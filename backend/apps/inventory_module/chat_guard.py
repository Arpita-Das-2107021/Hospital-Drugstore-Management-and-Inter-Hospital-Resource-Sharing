"""Scope guard for inventory CSV chat sessions."""
from __future__ import annotations

import re

CSV_SCOPE_TERMS = {
    "csv",
    "file",
    "upload",
    "import",
    "row",
    "column",
    "header",
    "schema",
    "error",
    "validation",
    "inventory",
    "medicine",
    "quantity",
    "price",
    "expiry",
    "expiry_date",
    "batch",
    "manufacturer",
    "unit",
    "currency",
}

OFF_TOPIC_MARKERS = {
    "weather",
    "football",
    "cricket",
    "movie",
    "song",
    "recipe",
    "travel",
    "politics",
    "religion",
    "relationship",
    "stock market",
    "bitcoin",
    "exam answer",
    "leetcode",
    "interview question",
    "joke",
    "poem",
    "story",
}


def is_query_in_csv_scope(query: str) -> tuple[bool, str]:
    """Return whether query appears in scope for inventory CSV troubleshooting."""
    normalized = str(query or "").strip().lower()
    if not normalized:
        return False, "empty_query"

    tokenized = re.sub(r"[^a-z0-9_\s-]", " ", normalized)
    tokens = {token for token in tokenized.split() if token}

    has_scope_term = False
    for term in CSV_SCOPE_TERMS:
        if " " in term:
            if term in normalized:
                has_scope_term = True
                break
            continue
        if term in tokens:
            has_scope_term = True
            break

    has_off_topic_marker = False
    for marker in OFF_TOPIC_MARKERS:
        if " " in marker:
            if marker in normalized:
                has_off_topic_marker = True
                break
            continue
        if marker in tokens:
            has_off_topic_marker = True
            break

    if has_off_topic_marker and not has_scope_term:
        return False, "off_topic"

    return True, "in_scope"


def out_of_scope_message(language: str) -> str:
    lang = (language or "en").strip().lower()
    if lang.startswith("bn"):
        return (
            "আমি শুধু এই সেশনের inventory CSV আপলোড ও validation বিষয়ক প্রশ্নে সহায়তা করতে পারি। "
            "অনুগ্রহ করে file error, row/column issue, schema বা import fix নিয়ে প্রশ্ন করুন।"
        )

    return (
        "I can only help with inventory CSV upload and validation topics for this session. "
        "Please ask about file errors, row/column issues, schema, or import fixes."
    )
