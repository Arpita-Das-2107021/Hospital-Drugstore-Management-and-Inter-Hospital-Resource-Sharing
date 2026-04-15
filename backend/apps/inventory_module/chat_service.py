"""Orchestration service for CSV AI chat explanation."""
from __future__ import annotations

import json
import re

from django.conf import settings
from django.utils import timezone
from pydantic import BaseModel, ConfigDict, Field, ValidationError as PydanticValidationError
from rest_framework.exceptions import ValidationError

from apps.core.services.llm_service import LLMService, LLMServiceError

from .chat_guard import is_query_in_csv_scope
from .context_builder import build_csv_chat_context, render_csv_chat_prompt
from .error_classifier import classify_validation_errors
from .models import InventoryCSVChatMessage, InventoryCSVChatSession


class ValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row: int = Field(ge=0)
    message: str


class CsvValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    summary: str
    issues: list[ValidationIssue]
    recommendation: str


class CsvValidationResponseParsingError(ValueError):
    """Raised when LLM output cannot be parsed into the CSV response schema."""


def _history_for_prompt(session: InventoryCSVChatSession, *, max_history_messages: int) -> list[dict[str, str]]:
    rows = list(session.messages.order_by("-created_at")[:max_history_messages])
    rows.reverse()
    return [{"role": item.role.lower(), "content": item.content} for item in rows]


def _fallback_csv_reply(*, context: dict, language: str) -> CsvValidationResponse:
    errors = context.get("classified_errors") or []
    issues: list[ValidationIssue] = []
    if errors:
        top = errors[: int(getattr(settings, "INVENTORY_CSV_CHAT_CONTEXT_MAX_ERRORS", 20))]
        for err in top:
            row_number = max(0, int(err.get("row_number") or 0))
            message = str(err.get("message") or "validation issue")
            issues.append(ValidationIssue(row=row_number, message=message))

    if str(language).startswith("bn"):
        if issues:
            return CsvValidationResponse(
                success=True,
                summary="ভ্যালিডেশন সম্পন্ন হয়েছে: কিছু সমস্যা পাওয়া গেছে।",
                issues=issues,
                recommendation="সমস্যাযুক্ত row ঠিক করে আবার আপলোড করুন।",
            )
        return CsvValidationResponse(
            success=True,
            summary="ভ্যালিডেশন সম্পন্ন হয়েছে: বড় কোনো সমস্যা পাওয়া যায়নি।",
            issues=[],
            recommendation="আপনি CSV ইমপোর্ট চালিয়ে যেতে পারেন।",
        )

    if issues:
        return CsvValidationResponse(
            success=True,
            summary="Validation completed with issues",
            issues=issues,
            recommendation="Fix the invalid rows and reupload",
        )

    return CsvValidationResponse(
        success=True,
        summary="Validation completed",
        issues=[],
        recommendation="No row-level issues were found. You can proceed.",
    )


def _scope_guard_csv_reply(language: str) -> CsvValidationResponse:
    if str(language).startswith("bn"):
        return CsvValidationResponse(
            success=False,
            summary="আমি শুধু এই ফাইলের CSV validation প্রশ্নে সহায়তা করতে পারি।",
            issues=[],
            recommendation="অনুগ্রহ করে row/column বা validation error সম্পর্কে প্রশ্ন করুন।",
        )

    return CsvValidationResponse(
        success=False,
        summary="I can only help with this file's CSV validation questions.",
        issues=[],
        recommendation="Please ask about row, column, schema, or import validation issues.",
    )


def _json_candidate_texts(raw_text: str) -> list[str]:
    text = str(raw_text or "").strip()
    if not text:
        return []

    candidates: list[str] = [text]
    fence_cleaned = re.sub(r"^\s*```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    fence_cleaned = re.sub(r"\s*```\s*$", "", fence_cleaned)
    fence_cleaned = fence_cleaned.strip()
    if fence_cleaned and fence_cleaned != text:
        candidates.append(fence_cleaned)

    for value in (text, fence_cleaned):
        if not value:
            continue
        match = re.search(r"\{[\s\S]*\}", value)
        if match:
            candidates.append(match.group(0).strip())

    seen: set[str] = set()
    unique_candidates: list[str] = []
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        unique_candidates.append(candidate)
    return unique_candidates


def parse_csv_validation_response_text(raw_text: str) -> CsvValidationResponse:
    """Parse LLM output into a strict CSV validation response schema."""
    last_error: Exception | None = None
    for candidate in _json_candidate_texts(raw_text):
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue

        if not isinstance(parsed, dict):
            last_error = TypeError("Top-level JSON value must be an object.")
            continue

        try:
            return CsvValidationResponse.model_validate(parsed)
        except PydanticValidationError as exc:
            raise CsvValidationResponseParsingError("CSV validation response failed schema validation.") from exc

    raise CsvValidationResponseParsingError("LLM response did not contain a valid JSON object.") from last_error



def _generate_csv_error_chat_reply(
    *,
    validation_context,
    user_query: str,
    language: str,
    session_history: list[dict[str, str]] | None = None,
    allow_fallback: bool = False,
) -> dict:
    """Generate a structured CSV validation response with optional fallback mode."""
    effective_language = (language or validation_context.language or "en").strip().lower()

    classified_errors = classify_validation_errors(validation_context.errors or [])
    context = build_csv_chat_context(
        expected_schema=list(validation_context.expected_schema or settings.INVENTORY_CSV_EXPECTED_SCHEMA),
        classified_errors=classified_errors,
        sample_rows=list(validation_context.sample_rows or []),
        session_history=session_history,
        user_query=user_query,
        language=effective_language,
        max_errors=settings.INVENTORY_CSV_CHAT_CONTEXT_MAX_ERRORS,
        max_sample_rows=settings.INVENTORY_CSV_CHAT_SAMPLE_ROW_LIMIT,
        max_history_messages=int(getattr(settings, "INVENTORY_CSV_CHAT_MAX_HISTORY_MESSAGES", 10)),
    )
    prompt = render_csv_chat_prompt(context)

    reply_mode = "llm"
    try:
        raw_response = LLMService().ask(prompt=prompt, language=effective_language)
        response_payload = parse_csv_validation_response_text(raw_response)
    except LLMServiceError:
        if not allow_fallback:
            raise
        response_payload = _fallback_csv_reply(context=context, language=effective_language)
        reply_mode = "fallback"
    except CsvValidationResponseParsingError as exc:
        if not allow_fallback:
            raise LLMServiceError("LLM returned invalid CSV validation JSON response.") from exc
        response_payload = _fallback_csv_reply(context=context, language=effective_language)
        reply_mode = "fallback"

    return {
        "response": response_payload.model_dump(),
        "classified_errors": context["classified_errors"],
        "sample_rows": context["sample_rows"],
        "reply_mode": reply_mode,
    }


def generate_csv_error_chat_reply(*, validation_context, user_query: str, language: str) -> dict:
    """Generate strict JSON CSV validation payload in requested language."""
    payload = _generate_csv_error_chat_reply(
        validation_context=validation_context,
        user_query=user_query,
        language=language,
        session_history=None,
        allow_fallback=False,
    )
    return payload["response"]


def create_csv_chat_session(*, validation_context, actor, language: str) -> InventoryCSVChatSession:
    effective_language = (language or "en").strip().lower()
    return InventoryCSVChatSession.objects.create(
        facility=validation_context.facility,
        validation_context=validation_context,
        language=effective_language,
        status=InventoryCSVChatSession.Status.ACTIVE,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )


def send_csv_chat_message(*, session: InventoryCSVChatSession, user_query: str, actor, language: str) -> dict:
    if session.status != InventoryCSVChatSession.Status.ACTIVE:
        raise ValidationError({"session": "Chat session is not active."})

    effective_language = (language or session.language or "en").strip().lower()
    if session.language != effective_language:
        session.language = effective_language
        session.save(update_fields=["language", "updated_at"])

    content = str(user_query or "").strip()
    InventoryCSVChatMessage.objects.create(
        session=session,
        role=InventoryCSVChatMessage.Role.USER,
        content=content,
        out_of_scope=False,
        message_meta={
            "actor_id": str(getattr(actor, "id", "") or ""),
            "received_at": timezone.now().isoformat(),
        },
    )

    in_scope, reason = is_query_in_csv_scope(content)
    if not in_scope:
        response_payload = _scope_guard_csv_reply(effective_language).model_dump()
        assistant_message = InventoryCSVChatMessage.objects.create(
            session=session,
            role=InventoryCSVChatMessage.Role.ASSISTANT,
            content=response_payload["summary"],
            out_of_scope=True,
            message_meta={
                "reply_mode": "scope_guard",
                "reason": reason,
            },
        )
        return {
            "session_id": str(session.id),
            "file_id": str(session.validation_context_id),
            "language": effective_language,
            "out_of_scope": True,
            "response": response_payload,
            "reply_mode": "scope_guard",
            "message_id": str(assistant_message.id),
            "history_count": session.messages.count(),
        }

    context_max_history = int(getattr(settings, "INVENTORY_CSV_CHAT_MAX_HISTORY_MESSAGES", 10))
    payload = _generate_csv_error_chat_reply(
        validation_context=session.validation_context,
        user_query=content,
        language=effective_language,
        session_history=_history_for_prompt(session, max_history_messages=context_max_history),
        allow_fallback=True,
    )

    assistant_message = InventoryCSVChatMessage.objects.create(
        session=session,
        role=InventoryCSVChatMessage.Role.ASSISTANT,
        content=payload["response"]["summary"],
        out_of_scope=False,
        message_meta={
            "reply_mode": payload.get("reply_mode", "llm"),
            "history_included": min(session.messages.count(), context_max_history),
            "error_count": len(payload["response"].get("issues", [])),
        },
    )

    return {
        "session_id": str(session.id),
        "file_id": str(session.validation_context_id),
        "language": effective_language,
        "out_of_scope": False,
        "response": payload["response"],
        "reply_mode": payload.get("reply_mode", "llm"),
        "message_id": str(assistant_message.id),
        "history_count": session.messages.count(),
        "classified_errors": payload.get("classified_errors", []),
        "sample_rows": payload.get("sample_rows", []),
    }
