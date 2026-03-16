"""Reusable email helpers for service-layer workflows."""
import logging
from typing import Any

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

logger = logging.getLogger("hrsp.email")


def send_email(subject: str, message: str, recipient_list: list[str], html_message: str | None = None) -> bool:
    """Send an email and never raise to callers."""
    if not recipient_list:
        logger.warning("Email skipped for subject '%s': empty recipient list", subject)
        return False

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
            fail_silently=False,
            html_message=html_message,
        )
        return True
    except Exception:
        logger.exception(
            "Email send failed | subject=%s recipients=%s",
            subject,
            recipient_list,
        )
        return False


def render_email_template(template_name: str, context: dict[str, Any]) -> str:
    """Render a text email template from templates/emails/."""
    return render_to_string(f"emails/{template_name}", context)
