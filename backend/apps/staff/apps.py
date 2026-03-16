"""Staff app configuration."""
from django.apps import AppConfig


class StaffConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.staff"
    label = "staff"

    def ready(self):
        import apps.staff.signals  # noqa: F401
