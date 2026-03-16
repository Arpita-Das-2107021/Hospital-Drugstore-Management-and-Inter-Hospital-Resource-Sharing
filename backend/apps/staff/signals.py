"""Staff app signals."""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger("hrsp.staff")


def _register():
    """Signals are registered lazily via apps.ready()."""
    from .models import Invitation

    @receiver(post_save, sender=Invitation)
    def log_invitation_status_change(sender, instance, created, **kwargs):
        if not created:
            logger.info(
                "Invitation %s status changed to %s",
                instance.id,
                instance.status,
            )


_register()
