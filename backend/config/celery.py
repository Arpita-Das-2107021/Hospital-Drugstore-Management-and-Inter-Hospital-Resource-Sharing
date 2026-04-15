"""
Celery application configuration.
"""
import os

from celery import Celery
from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("hrsp")

# Read config from Django settings, using the CELERY_ namespace
app.config_from_object("django.conf:settings", namespace="CELERY")

# Use centralized periodic schedule definitions from Django settings.
app.conf.beat_schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {})

# Auto-discover tasks in all installed apps
app.autodiscover_tasks()
