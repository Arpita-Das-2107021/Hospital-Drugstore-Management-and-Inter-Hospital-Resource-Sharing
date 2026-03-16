"""
Production settings.
"""
from .base import *  # noqa: F401, F403

DEBUG = False

# ---------------------------------------------------------------------------
# HTTPS / Security headers
# ---------------------------------------------------------------------------
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------------------
# Logging — write to files in production
# ---------------------------------------------------------------------------
# File handlers are already configured in base.py; override root to use them
LOGGING["root"]["handlers"] = ["console", "app_file", "error_file"]  # noqa: F405
