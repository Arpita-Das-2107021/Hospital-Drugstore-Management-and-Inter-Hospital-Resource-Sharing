"""Notifications Celery tasks."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def send_email_task(self, to, subject: str, body: str, from_email: str = None, html_body: str = None) -> None:
    """
    Send an email asynchronously.
    `to` may be a single address string or a list of addresses.
    Used by common.services.email.send_email_async and invitation flows.
    """
    try:
        from django.conf import settings
        from django.core.mail import EmailMultiAlternatives

        recipients = [to] if isinstance(to, str) else to
        # Log metadata about email being sent
        try:
            logger.info(
                "Preparing email | subject=%s | recipients_count=%d | has_html_body=%s | body_len=%d | html_len=%d",
                subject,
                len(recipients),
                bool(html_body),
                len(body or ""),
                len(html_body or ""),
            )
        except Exception:
            pass
        
        # Use EmailMultiAlternatives to support both text and HTML versions
        email = EmailMultiAlternatives(
            subject=subject,
            body=body,
            from_email=from_email or settings.DEFAULT_FROM_EMAIL,
            to=recipients,
        )
        if html_body:
            email.attach_alternative(html_body, "text/html")
        
        email.send(fail_silently=False)
        logger.info("Email sent successfully | subject=%s | recipients=%d | with_html=%s", subject, len(recipients), bool(html_body))
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def send_notification_task(self, user_id: str, notification_type: str, message: str, data: dict = None) -> None:
    """Create an in-app Notification record for a user."""
    try:
        from django.contrib.auth import get_user_model

        from .models import Notification

        UserAccount = get_user_model()
        user = UserAccount.objects.get(id=user_id)
        Notification.objects.create(
            user=user,
            notification_type=notification_type,
            message=message,
            data=data or {},
        )
        logger.info("Notification created for user %s: %s", user_id, notification_type)
    except Exception as exc:
        logger.error("Failed to create notification for user %s: %s", user_id, exc)
        raise self.retry(exc=exc)


@shared_task
def send_broadcast_task(broadcast_id: str, send_email: bool = False) -> dict:
    """Deliver a BroadcastMessage to all target hospitals' staff.

    When `send_email` is True, also enqueue `send_email_task` to deliver the
    broadcast message via SMTP to targeted users.
    """
    from django.contrib.auth import get_user_model

    from .models import BroadcastMessage
    from .services import deliver_broadcast

    try:
        broadcast = BroadcastMessage.objects.get(id=broadcast_id)
        count = deliver_broadcast(broadcast)
        logger.info("Broadcast %s delivered to %d users", broadcast_id, count)

        if send_email:
            from apps.core.services import render_email_template

            UserAccount = get_user_model()
            if broadcast.scope == BroadcastMessage.Scope.ALL:
                users_qs = UserAccount.objects.filter(
                    is_active=True,
                    staff__isnull=False,
                    hospital_role_assignment__hospital_role__name="HEALTHCARE_ADMIN",
                    hospital_role_assignment__hospital_role__is_active=True,
                )
            else:
                users_qs = UserAccount.objects.filter(
                    staff__hospital__in=broadcast.target_hospitals.all(),
                    is_active=True,
                    hospital_role_assignment__hospital_role__name="HEALTHCARE_ADMIN",
                    hospital_role_assignment__hospital_role__is_active=True,
                )

            emails = list(users_qs.exclude(email__isnull=True).exclude(email="").values_list("email", flat=True).distinct())
            if emails:
                from django.conf import settings
                # Determine broadcast scope display text
                scope_display = "All Network Hospitals" if broadcast.scope == BroadcastMessage.Scope.ALL else f"{broadcast.target_hospitals.count()} Selected Hospital(s)"
                frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
                alert_url = f"{frontend_url.rstrip('/')}/alerts/{broadcast.id}"
                
                context = {
                    "title": broadcast.title,
                    "message": broadcast.message,
                    "priority": broadcast.priority,
                    "sent_by_email": broadcast.sent_by.email if broadcast.sent_by else "System",
                    "broadcast_scope": scope_display,
                    "frontend_url": frontend_url,
                    "alert_url": alert_url,
                }
                # Render text and html templates
                try:
                    body = render_email_template("broadcast.txt", context)
                    logger.debug("Text template rendered: %s...", body[:100])
                except Exception as e:
                    logger.error("Failed to render broadcast.txt template: %s", e, exc_info=True)
                    body = f"{broadcast.title}\n\n{broadcast.message}"

                html_body = None
                try:
                    html_body = render_email_template("broadcast.html", context)
                    logger.debug("HTML template rendered: %s...", html_body[:100])
                except Exception as e:
                    logger.error("Failed to render broadcast.html template: %s", e, exc_info=True)
                    # Fallback: create simple HTML from message
                    html_body = f"<h2>{broadcast.title}</h2><p>{broadcast.message}</p><p>Priority: {broadcast.priority}</p>"

                # Use the existing send_email_task to send to the list of recipients
                logger.info("Enqueuing email with html_body (len=%s) for %d recipients", len(html_body) if html_body else 0, len(emails))
                send_email_task.delay(emails, broadcast.title, body, None, html_body)
                logger.info("Enqueued email delivery for broadcast %s to %d addresses", broadcast_id, len(emails))

        return {"delivered_to": count}
    except BroadcastMessage.DoesNotExist:
        logger.warning("BroadcastMessage %s not found", broadcast_id)
        return {"error": "not_found"}
