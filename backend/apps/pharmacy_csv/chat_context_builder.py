"""Prompt context builder for pharmacy CSV session chat."""
from __future__ import annotations

import json
from typing import Any


PROMPT_TEMPLATE = (
    "You are Server A CSV assistant for pharmacy data onboarding.\n\n"
    "Session Scope Rules:\n"
    "1) You must only discuss CSV upload/validation/import issues for this specific file session.\n"
    "2) If user asks unrelated topics, politely refuse and redirect to CSV troubleshooting.\n"
    "3) Use practical, step-by-step fixes based on metadata below.\n"
    "4) Prioritize highest-impact fixes first (blocking errors before non-blocking cleanup).\n"
    "5) Keep responses natural, context-aware, and non-repetitive.\n\n"
    "Language: {language}\n"
    "Dataset Type: {dataset_type}\n"
    "Registration Lock Date: {lock_date}\n"
    "Context Metrics: total_errors={error_count}, total_conflicts={conflict_count}, sample_rows={sample_row_count}\n"
    "Error Pattern Summary:\n{error_summary}\n\n"
    "Conflict Pattern Summary:\n{conflict_summary}\n\n"
    "Expected Schema:\n{schema}\n\n"
    "Validation Errors:\n{errors}\n\n"
    "Validation Conflicts:\n{conflicts}\n\n"
    "Sample Rows:\n{sample_rows}\n\n"
    "Recent Session Messages:\n{history}\n\n"
    "User Question:\n{user_query}\n\n"
    "Response Quality Rules:\n"
    "- Tie each recommendation directly to this file's rows, columns, conflicts, or lock-date constraints.\n"
    "- Explain why the issue happened and what action to take now.\n"
    "- Keep advice concise but specific enough for immediate action.\n\n"
    "Provide concise CSV-focused help only."
)


def _to_pretty_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _pattern_summary(items: list[dict[str, Any]], *, key_candidates: tuple[str, ...]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        label = ""
        for key in key_candidates:
            value = str(item.get(key) or "").strip()
            if value:
                label = value
                break
        if not label:
            label = "unknown"
        counts[label] = counts.get(label, 0) + 1

    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    return [{"type": label, "count": count} for label, count in ranked]


def build_pharmacy_csv_chat_context(
    *,
    dataset_type: str,
    expected_schema: list[str],
    errors: list[dict[str, Any]],
    conflicts: list[dict[str, Any]],
    sample_rows: list[dict[str, Any]],
    session_history: list[dict[str, str]],
    user_query: str,
    language: str,
    lock_date: str,
    max_errors: int = 20,
    max_conflicts: int = 20,
    max_sample_rows: int = 5,
    max_history_messages: int = 10,
) -> dict[str, Any]:
    normalized_errors = list(errors or [])[:max_errors]
    normalized_conflicts = list(conflicts or [])[:max_conflicts]
    normalized_sample_rows = list(sample_rows or [])[:max_sample_rows]
    normalized_history = list(session_history or [])[-max_history_messages:]

    return {
        "language": language,
        "dataset_type": dataset_type,
        "lock_date": lock_date,
        "expected_schema": list(expected_schema or []),
        "errors": normalized_errors,
        "conflicts": normalized_conflicts,
        "sample_rows": normalized_sample_rows,
        "session_history": normalized_history,
        "error_count": len(normalized_errors),
        "conflict_count": len(normalized_conflicts),
        "sample_row_count": len(normalized_sample_rows),
        "error_summary": _pattern_summary(
            normalized_errors,
            key_candidates=("code", "error_code", "error_type", "error_message", "message"),
        ),
        "conflict_summary": _pattern_summary(
            normalized_conflicts,
            key_candidates=("conflict_key", "conflict_type", "reason", "message"),
        ),
        "user_query": str(user_query or "").strip(),
    }


def render_pharmacy_csv_chat_prompt(context: dict[str, Any]) -> str:
    return PROMPT_TEMPLATE.format(
        language=context["language"],
        dataset_type=context["dataset_type"],
        lock_date=context["lock_date"],
        error_count=context["error_count"],
        conflict_count=context["conflict_count"],
        sample_row_count=context["sample_row_count"],
        error_summary=_to_pretty_json(context["error_summary"]),
        conflict_summary=_to_pretty_json(context["conflict_summary"]),
        schema=_to_pretty_json(context["expected_schema"]),
        errors=_to_pretty_json(context["errors"]),
        conflicts=_to_pretty_json(context["conflicts"]),
        sample_rows=_to_pretty_json(context["sample_rows"]),
        history=_to_pretty_json(context["session_history"]),
        user_query=context["user_query"],
    )
