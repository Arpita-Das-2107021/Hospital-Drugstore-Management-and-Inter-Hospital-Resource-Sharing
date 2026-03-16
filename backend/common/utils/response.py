"""Standard API response envelope builder."""
from typing import Any, Optional


def success_response(data: Any = None, meta: Optional[dict] = None) -> dict:
    """Build a successful envelope response."""
    return {
        "success": True,
        "data": data,
    }


def error_response(code: str, message: str, details: Optional[dict] = None) -> dict:
    """Build an error envelope response."""
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
        },
    }
