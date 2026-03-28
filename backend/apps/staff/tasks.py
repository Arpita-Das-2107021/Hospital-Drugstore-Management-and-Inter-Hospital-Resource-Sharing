"""Staff app Celery tasks."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_invitation_email_task(self, to: str, subject: str, body: str) -> None:
    """Send invitation email asynchronously."""
    try:
        from django.core.mail import send_mail
        from django.conf import settings

        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to],
            fail_silently=False,
        )
        logger.info("Invitation email sent to %s", to)
    except Exception as exc:
        logger.error("Failed to send invitation email to %s: %s", to, exc)
        raise self.retry(exc=exc)


@shared_task
def expire_pending_invitations() -> dict:
    """
    Periodic task: mark expired invitations.
    Scheduled via django-celery-beat.
    """
    from django.utils import timezone
    from .models import Invitation

    expired = Invitation.objects.filter(
        status=Invitation.Status.PENDING,
        expires_at__lt=timezone.now(),
    )
    count = expired.update(status=Invitation.Status.EXPIRED)
    logger.info("Expired %d pending invitations", count)
    return {"expired_count": count}
