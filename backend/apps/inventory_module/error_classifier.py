"""Deterministic CSV validation error classifier for AI chat context."""
from __future__ import annotations

from typing import Any


SUPPORTED_TYPES = {
    "missing_column",
    "invalid_value",
    "negative_quantity",
    "invalid_date",
    "duplicate_entry",
}


def _derive_error_type(raw_error: dict[str, Any]) -> str:
    explicit_type = str(raw_error.get("type") or "").strip().lower()
    if explicit_type in SUPPORTED_TYPES:
        return explicit_type

    error_code = str(raw_error.get("error_code") or "").strip().lower()
    field_name = str(raw_error.get("field_name") or "").strip().lower()
    error_message = str(raw_error.get("error_message") or "").strip().lower()

    if error_code in {"missing_required_headers", "missing_column"}:
        return "missing_column"
    if error_code in {"invalid_expiry_date", "invalid_date"}:
        return "invalid_date"
    if error_code in {"duplicate_row", "duplicate_entry"}:
        return "duplicate_entry"
    if error_code == "invalid_quantity" and (
        "non-negative" in error_message or "negative" in error_message
    ):
        return "negative_quantity"
    if field_name == "quantity" and ("non-negative" in error_message or "negative" in error_message):
        return "negative_quantity"
    return "invalid_value"


def _extract_missing_columns(raw_error: dict[str, Any]) -> list[str]:
    column = str(raw_error.get("column") or "").strip()
    if column:
        return [column]

    missing_columns = raw_error.get("missing_columns")
    if isinstance(missing_columns, list):
        cleaned = [str(item).strip() for item in missing_columns if str(item).strip()]
        if cleaned:
            return cleaned

    message = str(raw_error.get("error_message") or "")
    marker = ":"
    if marker in message:
        tail = message.split(marker, 1)[1]
        guessed = [part.strip() for part in tail.split(",") if part.strip()]
        if guessed:
            return guessed

    return []


def classify_validation_error(raw_error: dict[str, Any]) -> dict[str, Any]:
    """Map raw CSV validation error into a deterministic human-readable category."""
    error_type = _derive_error_type(raw_error)
    row_number = int(raw_error.get("row_number") or 0)
    field_name = str(raw_error.get("field_name") or "").strip()

    if error_type == "missing_column":
        missing_columns = _extract_missing_columns(raw_error)
        if missing_columns:
            if len(missing_columns) == 1:
                message = f"Column '{missing_columns[0]}' is missing."
            else:
                joined = ", ".join(f"'{col}'" for col in missing_columns)
                message = f"Required columns are missing: {joined}."
        else:
            message = "One or more required columns are missing."
        return {
            "code": "MISSING_COLUMN",
            "message": message,
            "severity": "high",
            "type": error_type,
            "row_number": row_number,
            "field": field_name,
        }

    if error_type == "negative_quantity":
        return {
            "code": "NEGATIVE_QUANTITY",
            "message": "Quantity cannot be negative. Use a non-negative integer value.",
            "severity": "high",
            "type": error_type,
            "row_number": row_number,
            "field": field_name or "quantity",
        }

    if error_type == "invalid_date":
        return {
            "code": "INVALID_DATE",
            "message": "Date format is invalid. Use ISO format YYYY-MM-DD.",
            "severity": "medium",
            "type": error_type,
            "row_number": row_number,
            "field": field_name or "expiry_date",
        }

    if error_type == "duplicate_entry":
        return {
            "code": "DUPLICATE_ENTRY",
            "message": "Duplicate entry detected in the CSV upload.",
            "severity": "medium",
            "type": error_type,
            "row_number": row_number,
            "field": field_name,
        }

    raw_message = str(raw_error.get("error_message") or "").strip()
    fallback_message = raw_message or "The value in this row is invalid."
    return {
        "code": "INVALID_VALUE",
        "message": fallback_message,
        "severity": "medium",
        "type": "invalid_value",
        "row_number": row_number,
        "field": field_name,
    }


def classify_validation_errors(raw_errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Classify a sequence of raw validation errors using deterministic mapping."""
    return [classify_validation_error(raw_error) for raw_error in raw_errors]
