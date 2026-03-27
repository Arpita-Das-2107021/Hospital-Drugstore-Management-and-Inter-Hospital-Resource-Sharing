"""Test settings for deterministic CI/local pytest runs."""

from .dev import *  # noqa: F401,F403


# Keep API tests independent from Redis/network state.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "hrsp-tests",
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

# Execute tasks in-process during tests; prevents broker-related flakiness.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Disable global throttling in tests to avoid cache coupling and request order flakiness.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {},
}

# Keep test email assertions local and side-effect free.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
