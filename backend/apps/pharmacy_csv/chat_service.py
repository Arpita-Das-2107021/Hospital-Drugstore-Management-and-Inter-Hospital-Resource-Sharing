"""Session chat orchestration service for pharmacy CSV AI assistance."""
from __future__ import annotations

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.services.llm_service import LLMService, LLMServiceError

from .chat_context_builder import build_pharmacy_csv_chat_context, render_pharmacy_csv_chat_prompt
from .chat_guard import is_query_in_csv_scope, out_of_scope_message
from .models import PharmacyCSVChatMessage, PharmacyCSVChatSession


def create_csv_chat_session(*, validation_context, actor, language: str) -> PharmacyCSVChatSession:
    effective_language = (language or "en").strip().lower()
    return PharmacyCSVChatSession.objects.create(
        facility=validation_context.facility,
        validation_context=validation_context,
        dataset_type=validation_context.dataset_type,
        language=effective_language,
        status=PharmacyCSVChatSession.Status.ACTIVE,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )


def _history_for_prompt(session: PharmacyCSVChatSession, *, max_history_messages: int) -> list[dict[str, str]]:
    rows = list(session.messages.order_by("-created_at")[:max_history_messages])
    rows.reverse()
    return [{"role": item.role.lower(), "content": item.content} for item in rows]


def _fallback_csv_reply(*, context: dict, language: str) -> str:
    errors = context.get("errors") or []
    conflicts = context.get("conflicts") or []
    dataset = context.get("dataset_type") or "CSV"

    if errors:
        top = errors[:3]
        bullets = []
        for err in top:
            row_number = err.get("row_number", 0)
            message = err.get("error_message") or "validation issue"
            bullets.append(f"row {row_number}: {message}")
        intro = "Top issues detected" if not str(language).startswith("bn") else "প্রধান সমস্যাগুলো"
        return f"{intro} for {dataset}: " + "; ".join(bullets)

    if conflicts:
        top = conflicts[:3]
        keys = [str(item.get("conflict_key") or "unknown") for item in top]
        intro = (
            "Conflicts detected on these keys"
            if not str(language).startswith("bn")
            else "এই key-গুলোতে conflict পাওয়া গেছে"
        )
        return f"{intro}: {', '.join(keys)}. Use conflict_policy=OVERWRITE with confirm_conflicts=true only if intended."

    if str(language).startswith("bn"):
        return "এই ফাইলের বড় ধরনের সমস্যা ধরা পড়েনি। নির্দিষ্ট row/column উল্লেখ করে প্রশ্ন করুন।"

    return "No major validation issues were detected for this file. Ask with row/column details for deeper help."


def send_csv_chat_message(*, session: PharmacyCSVChatSession, user_query: str, actor, language: str) -> dict:
    if session.status != PharmacyCSVChatSession.Status.ACTIVE:
        raise ValidationError({"session": "Chat session is not active."})

    effective_language = (language or session.language or "en").strip().lower()
    if session.language != effective_language:
        session.language = effective_language
        session.save(update_fields=["language", "updated_at"])

    user_message = PharmacyCSVChatMessage.objects.create(
        session=session,
        role=PharmacyCSVChatMessage.Role.USER,
        content=str(user_query or "").strip(),
        out_of_scope=False,
        message_meta={
            "actor_id": str(getattr(actor, "id", "") or ""),
            "received_at": timezone.now().isoformat(),
        },
    )

    in_scope, reason = is_query_in_csv_scope(user_query)
    if not in_scope:
        answer = out_of_scope_message(effective_language)
        assistant_message = PharmacyCSVChatMessage.objects.create(
            session=session,
            role=PharmacyCSVChatMessage.Role.ASSISTANT,
            content=answer,
            out_of_scope=True,
            message_meta={
                "reply_mode": "scope_guard",
                "reason": reason,
            },
        )
        return {
            "session_id": str(session.id),
            "file_id": str(session.validation_context_id),
            "dataset_type": session.dataset_type,
            "language": effective_language,
            "out_of_scope": True,
            "reply": assistant_message.content,
            "reply_mode": "scope_guard",
            "message_id": str(assistant_message.id),
            "history_count": session.messages.count(),
        }

    validation_context = session.validation_context
    lock_date = validation_context.facility.created_at.date().isoformat()
    context = build_pharmacy_csv_chat_context(
        dataset_type=validation_context.dataset_type,
        expected_schema=list(validation_context.expected_schema or []),
        errors=list(validation_context.errors or []),
        conflicts=list(validation_context.conflicts or []),
        sample_rows=list(validation_context.sample_rows or []),
        session_history=_history_for_prompt(
            session,
            max_history_messages=int(getattr(settings, "PHARMACY_CSV_CHAT_MAX_HISTORY_MESSAGES", 10)),
        ),
        user_query=user_query,
        language=effective_language,
        lock_date=lock_date,
        max_errors=int(getattr(settings, "PHARMACY_CSV_CHAT_CONTEXT_MAX_ERRORS", 20)),
        max_conflicts=int(getattr(settings, "PHARMACY_CSV_CHAT_CONTEXT_MAX_CONFLICTS", 20)),
        max_sample_rows=int(getattr(settings, "PHARMACY_CSV_CHAT_SAMPLE_ROW_LIMIT", 5)),
        max_history_messages=int(getattr(settings, "PHARMACY_CSV_CHAT_MAX_HISTORY_MESSAGES", 10)),
    )
    prompt = render_pharmacy_csv_chat_prompt(context)

    reply_mode = "llm"
    try:
        answer = LLMService().ask(prompt=prompt, language=effective_language)
    except LLMServiceError:
        answer = _fallback_csv_reply(context=context, language=effective_language)
        reply_mode = "fallback"

    assistant_message = PharmacyCSVChatMessage.objects.create(
        session=session,
        role=PharmacyCSVChatMessage.Role.ASSISTANT,
        content=answer,
        out_of_scope=False,
        message_meta={
            "reply_mode": reply_mode,
            "history_included": len(context.get("session_history", [])),
            "error_count": len(context.get("errors", [])),
            "conflict_count": len(context.get("conflicts", [])),
        },
    )

    return {
        "session_id": str(session.id),
        "file_id": str(validation_context.file_id),
        "dataset_type": validation_context.dataset_type,
        "language": effective_language,
        "out_of_scope": False,
        "reply": assistant_message.content,
        "reply_mode": reply_mode,
        "message_id": str(assistant_message.id),
        "history_count": session.messages.count(),
        "context_meta": {
            "errors": len(context.get("errors", [])),
            "conflicts": len(context.get("conflicts", [])),
            "sample_rows": len(context.get("sample_rows", [])),
        },
    }
