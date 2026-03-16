"""Compatibility wrappers for email sending."""
from typing import List, Optional

from apps.core.services.email_service import send_email

def send_email_async(
    to: List[str],
    subject: str,
    body: str,
    from_email: Optional[str] = None,
    html_body: Optional[str] = None,
):
    """Send immediately through the core service.

    This signature is retained to keep existing callers compatible while allowing
    future migration to Celery-backed delivery.
    """
    return send_email(
        subject=subject,
        message=body,
        recipient_list=to,
        html_message=html_body,
    )
