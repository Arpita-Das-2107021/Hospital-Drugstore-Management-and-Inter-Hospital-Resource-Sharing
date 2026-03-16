"""Audit log service — write audit entries safely."""
import logging

from .models import AuditLog

logger = logging.getLogger("hrsp.audit")


def write_audit_log(
    event_type: str,
    actor=None,
    hospital=None,
    object_id=None,
    object_type: str = "",
    ip_address: str = None,
    user_agent: str = "",
    metadata: dict = None,
) -> AuditLog:
    """Write a single audit log entry. Silently absorbs errors to never break primary flows."""
    try:
        entry = AuditLog(
            event_type=event_type,
            actor=actor,
            hospital=hospital,
            object_id=object_id,
            object_type=object_type,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
        )
        entry.save()
        return entry
    except Exception as e:
        logger.error("Failed to write audit log: %s", e)
        return None


def write_audit_log_from_request(request, event_type: str, **kwargs) -> AuditLog:
    """Convenience wrapper that extracts IP and user agent from the request object."""
    actor = request.user if request.user.is_authenticated else None
    ip = getattr(request, "audit_ip", request.META.get("REMOTE_ADDR", ""))
    ua = getattr(request, "audit_user_agent", "")
    hospital = None
    if actor and hasattr(actor, "staff") and actor.staff:
        hospital = actor.staff.hospital
    return write_audit_log(
        event_type=event_type,
        actor=actor,
        hospital=hospital,
        ip_address=ip,
        user_agent=ua,
        **kwargs,
    )
