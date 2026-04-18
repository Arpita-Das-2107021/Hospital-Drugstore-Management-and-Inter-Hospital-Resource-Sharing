"""Prompt context builder for CSV error explanation chat."""
from __future__ import annotations

import json
from typing import Any


PROMPT_TEMPLATE = (
    "You are an assistant helping hospital pharmacy staff fix CSV upload issues for one file session.\n\n"
    "Session Scope Rules:\n"
    "1) Only discuss inventory CSV upload, validation, or import issues for this file session.\n"
    "2) If question is unrelated, refuse politely and redirect to CSV troubleshooting for this file.\n"
    "3) Prioritize high-impact fixes first (schema blockers before row-level cleanup).\n"
    "4) Keep guidance practical and context-aware with concrete row/column references when available.\n"
    "5) Use natural, non-repetitive language tailored to the user question.\n\n"
    "Language: {language}\n\n"
    "Error Pattern Summary:\n"
    "{error_summary}\n\n"
    "Expected Schema:\n"
    "{schema}\n\n"
    "Detected Errors:\n"
    "{classified_errors}\n\n"
    "Sample Data:\n"
    "{sample_rows}\n\n"
    "Recent Session Messages:\n"
    "{history}\n\n"
    "User Question:\n"
    "{user_query}\n\n"
    "Response Quality Rules:\n"
    "- Tie the answer to this specific file metadata.\n"
    "- Mention why the issue happens and what to fix first.\n"
    "- Avoid copying fixed template phrases across different questions.\n\n"
    "Output Contract:\n"
    "Return ONLY valid JSON.\n"
    "Do not use markdown.\n"
    "Do not use code fences.\n"
    "Do not include explanations outside JSON.\n"
    "Use exactly these keys: success, summary, issues, recommendation.\n"
    "JSON schema to follow exactly:\n"
    "{{\n"
    "  \"success\": true,\n"
    "  \"summary\": \"Validation completed\",\n"
    "  \"issues\": [\n"
    "    {{\n"
    "      \"row\": 1,\n"
    "      \"message\": \"Missing batch number\"\n"
    "    }}\n"
    "  ],\n"
    "  \"recommendation\": \"Fix the invalid rows and reupload\"\n"
    "}}"
)


def _to_pretty_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _error_pattern_summary(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for item in errors:
        if not isinstance(item, dict):
            continue
        label = str(
            item.get("code")
            or item.get("error_code")
            or item.get("type")
            or item.get("category")
            or "unknown"
        ).strip()
        counts[label] = counts.get(label, 0) + 1

    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    return [{"issue_type": label, "count": count} for label, count in ranked]


def build_csv_chat_context(
    *,
    expected_schema: list[str],
    classified_errors: list[dict[str, Any]],
    sample_rows: list[dict[str, Any]],
    session_history: list[dict[str, str]] | None = None,
    user_query: str,
    language: str,
    max_errors: int = 20,
    max_sample_rows: int = 5,
    max_history_messages: int = 10,
) -> dict[str, Any]:
    """Build minimal structured context for LLM prompt creation."""
    trimmed_errors = classified_errors[:max_errors]
    trimmed_rows = sample_rows[:max_sample_rows]
    history = list(session_history or [])[-max_history_messages:]

    return {
        "language": language,
        "expected_schema": expected_schema,
        "classified_errors": trimmed_errors,
        "error_summary": _error_pattern_summary(trimmed_errors),
        "sample_rows": trimmed_rows,
        "session_history": history,
        "user_query": user_query.strip(),
    }


def render_csv_chat_prompt(context: dict[str, Any]) -> str:
    """Render the final prompt payload string passed to configured LLM provider."""
    return PROMPT_TEMPLATE.format(
        language=context["language"],
        error_summary=_to_pretty_json(context["error_summary"]),
        schema=_to_pretty_json(context["expected_schema"]),
        classified_errors=_to_pretty_json(context["classified_errors"]),
        sample_rows=_to_pretty_json(context["sample_rows"]),
        history=_to_pretty_json(context["session_history"]),
        user_query=context["user_query"],
    )
