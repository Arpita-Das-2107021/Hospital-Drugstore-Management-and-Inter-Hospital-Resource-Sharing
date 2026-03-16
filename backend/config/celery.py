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

# Periodic sync for hospital external APIs.
app.conf.beat_schedule = {
	"sync-all-active-hospitals": {
		"task": "apps.hospitals.tasks.sync_all_active_hospitals_task",
		"schedule": settings.HOSPITAL_SYNC_INTERVAL_SECONDS,
	},
}

# Auto-discover tasks in all installed apps
app.autodiscover_tasks()
