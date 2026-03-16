"""Custom DRF exception handler — formats all errors into the envelope response format."""
import logging

from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied as DRFPermissionDenied,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("hrsp.exceptions")


def custom_exception_handler(exc, context):
    """
    Intercept all DRF exceptions and wrap them in the standard envelope format.

    {
        "data": null,
        "error": {"code": "...", "message": "...", "details": {...}},
        "meta": {}
    }
    """
    # Convert Django exceptions to DRF equivalents first
    if isinstance(exc, Http404):
        exc = ValidationError({"detail": "Not found."}, code="not_found")
        exc.status_code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, PermissionDenied):
        exc = DRFPermissionDenied()

    response = exception_handler(exc, context)

    if response is None:
        # Unhandled exception — log it and return 500
        logger.exception("Unhandled exception in %s", context.get("view"))
        return Response(
            {
                "success": False,
                "error": {
                    "code": "internal_server_error",
                    "message": "An unexpected error occurred.",
                    "details": {},
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    error_code, message, details = _extract_error_info(exc, response)

    response.data = {
        "success": False,
        "error": {
            "code": error_code,
            "message": message,
            "details": details,
        },
    }
    return response


def _extract_error_info(exc, response):
    """Extract a normalised (code, message, details) triple from an exception."""
    if isinstance(exc, ValidationError):
        details = response.data if isinstance(response.data, dict) else {"non_field_errors": response.data}
        # Flatten detail if it's the standard DRF single-key pattern
        if "detail" in details and len(details) == 1:
            return "validation_error", str(details["detail"]), {}
        return "validation_error", "Invalid data submitted.", details

    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        return "authentication_required", str(response.data.get("detail", "Authentication required.")), {}

    if isinstance(exc, DRFPermissionDenied):
        return "permission_denied", str(response.data.get("detail", "You do not have permission.")), {}

    # Generic fallback
    detail = response.data.get("detail", str(exc)) if isinstance(response.data, dict) else str(exc)
    return "error", str(detail), {}
