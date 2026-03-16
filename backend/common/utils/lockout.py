"""Custom lockout response for django-axes."""
from django.http import JsonResponse


def lockout_response(request, credentials, *args, **kwargs):
    return JsonResponse(
        {
            "data": None,
            "error": {
                "code": "account_locked",
                "message": "Too many failed login attempts. Your account has been temporarily locked. "
                "Please try again in 15 minutes.",
                "details": {},
            },
            "meta": {},
        },
        status=429,
    )
