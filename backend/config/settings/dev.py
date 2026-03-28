"""
Development settings.
"""
from .base import *  # noqa: F401, F403

DEBUG = True

# Allow all hosts in development
ALLOWED_HOSTS = ["*"]

# Disable HTTPS redirects in development
SECURE_SSL_REDIRECT = False

# Show all SQL queries in development (optional - enable manually)
# LOGGING['loggers']['django.db.backends'] = {
#     'handlers': ['console'],
#     'level': 'DEBUG',
#     'propagate': False,
# }

# Optional convenience override for local debugging
if __import__("os").getenv("DJANGO_USE_CONSOLE_EMAIL", "").lower() in {"1", "true", "yes", "on"}:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

CORS_ALLOW_ALL_ORIGINS = True  # Development only
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://host.docker.internal:3000",
]
