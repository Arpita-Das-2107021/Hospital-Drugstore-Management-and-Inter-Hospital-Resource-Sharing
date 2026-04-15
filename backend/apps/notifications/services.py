"""Notifications service layer."""
import logging

from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from common.permissions.runtime import has_any_permission, is_platform_operator

from .models import (
    BroadcastChangeVersion,
    BroadcastClientCursor,
    BroadcastMessage,
    BroadcastRecipient,
    EmergencyBroadcastResponse,
    Notification,
)

UserAccount = get_user_model()
logger = logging.getLogger("hrsp.notifications")
GLOBAL_BROADCAST_VERSION_KEY = "global"


BROADCAST_RESPONSE_VIEW_PERMISSION_CODES = (
    "communication:broadcast.response.view",
    "communication:broadcast.manage",
    "hospital:broadcast.manage",
)


def _is_super_admin(user) -> bool:
    return is_platform_operator(user, allow_role_fallback=True)


def _hospital_id_for_user(user):
    staff = getattr(user, "staff", None)
    return getattr(staff, "hospital_id", None)


def _get_broadcast_tracker_for_update() -> BroadcastChangeVersion:
    tracker, _ = BroadcastChangeVersion.objects.select_for_update().get_or_create(
        singleton_key=GLOBAL_BROADCAST_VERSION_KEY,
        defaults={"version": 0},
    )
    return tracker


def get_broadcast_version() -> int:
    return int(
        BroadcastChangeVersion.objects.filter(singleton_key=GLOBAL_BROADCAST_VERSION_KEY)
        .values_list("version", flat=True)
        .first()
        or 0
    )


@transaction.atomic
def record_broadcast_change(*, action: str, broadcast: BroadcastMessage | None = None, broadcast_id=None) -> int:
    tracker = _get_broadcast_tracker_for_update()
    tracker.version = int(tracker.version) + 1
    tracker.save(update_fields=["version", "updated_at"])
    resolved_broadcast_id = broadcast_id or (str(broadcast.id) if broadcast else None)
    logger.info(
        "Broadcast state changed",
        extra={
            "broadcast_action": action,
            "broadcast_id": str(resolved_broadcast_id) if resolved_broadcast_id else None,
            "broadcast_version": int(tracker.version),
        },
    )
    return int(tracker.version)


def get_acknowledged_broadcast_version(user) -> int:
    if not user or not getattr(user, "is_authenticated", False):
        return 0

    return int(
        BroadcastClientCursor.objects.filter(user_id=user.id)
        .values_list("last_seen_version", flat=True)
        .first()
        or 0
    )


def acknowledge_broadcast_version(user, version: int) -> int:
    if not user or not getattr(user, "is_authenticated", False):
        return 0

    normalized_version = max(0, int(version or 0))
    BroadcastClientCursor.objects.update_or_create(
        user_id=user.id,
        defaults={"last_seen_version": normalized_version},
    )
    return normalized_version


def get_broadcast_badge_metadata(user) -> dict[str, int | bool]:
    current_version = get_broadcast_version()
    acknowledged_version = get_acknowledged_broadcast_version(user)

    try:
        unread_count = int(get_unread_broadcast_count(user))
    except (PermissionDenied, ValidationError):
        unread_count = 0

    return {
        "broadcast_unread_count": unread_count,
        "broadcast_changed": current_version > acknowledged_version,
        "broadcast_version": current_version,
    }


def mark_notification_read(notification: Notification, user) -> Notification:
    if notification.user_id != user.id:
        raise ValidationError({"detail": "Not your notification."})
    notification.is_read = True
    notification.read_at = timezone.now()
    notification.save(update_fields=["is_read", "read_at"])
    return notification


def mark_all_read(user) -> int:
    count = Notification.objects.filter(user=user, is_read=False).update(
        is_read=True, read_at=timezone.now()
    )
    return count


def send_broadcast(broadcast: BroadcastMessage, actor, send_email: bool = False) -> int:
    """Deliver a broadcast to all relevant users and return delivery count.

    If `send_email` is True the Celery delivery task will also enqueue email sends
    using `send_email_task`.
    """
    from apps.notifications.tasks import send_broadcast_task

    broadcast.sent_by = actor
    broadcast.sent_at = timezone.now()
    broadcast.save(update_fields=["sent_by", "sent_at"])

    # pass send_email flag into the task so it can queue email delivery
    send_broadcast_task.delay(str(broadcast.id), bool(send_email))
    logger.info("Broadcast %s queued for delivery by %s (send_email=%s)", broadcast.id, actor.id, send_email)
    return 0  # actual count returned by the task


def create_broadcast_recipients(broadcast: BroadcastMessage) -> int:
    """Materialize hospital recipients for read tracking."""
    if broadcast.scope == BroadcastMessage.Scope.ALL:
        from apps.hospitals.models import Hospital

        recipient_hospital_ids = list(Hospital.objects.values_list("id", flat=True))
    else:
        recipient_hospital_ids = list(
            broadcast.target_hospitals.values_list("id", flat=True).distinct()
        )

    if not recipient_hospital_ids:
        return 0

    recipients = [
        BroadcastRecipient(broadcast=broadcast, hospital_id=hospital_id, is_read=False)
        for hospital_id in recipient_hospital_ids
    ]
    BroadcastRecipient.objects.bulk_create(recipients, ignore_conflicts=True, batch_size=500)
    return len(recipients)


@transaction.atomic
def mark_broadcast_read(broadcast: BroadcastMessage, user):
    """Mark a broadcast as read for the request user's hospital context."""
    if _is_super_admin(user):
        raise PermissionDenied("Super admins do not have hospital unread state.")

    hospital_id = _hospital_id_for_user(user)
    if not hospital_id:
        raise ValidationError({"detail": "No hospital context."})

    recipient = (
        BroadcastRecipient.objects.select_for_update()
        .filter(broadcast=broadcast, hospital_id=hospital_id)
        .first()
    )
    if not recipient:
        # Sender-only visibility with no delivery target is treated as read.
        return {"is_read": True, "read_at": None, "updated": False}

    if recipient.is_read:
        return {"is_read": True, "read_at": recipient.read_at, "updated": False}

    now = timezone.now()
    recipient.is_read = True
    recipient.read_at = now
    recipient.save(update_fields=["is_read", "read_at"])
    record_broadcast_change(action="read", broadcast=broadcast)
    return {"is_read": True, "read_at": now, "updated": True}


@transaction.atomic
def mark_broadcast_unread(broadcast: BroadcastMessage, user):
    """Mark a broadcast as unread for the request user's hospital context."""
    if _is_super_admin(user):
        raise PermissionDenied("Super admins do not have hospital unread state.")

    hospital_id = _hospital_id_for_user(user)
    if not hospital_id:
        raise ValidationError({"detail": "No hospital context."})

    recipient = (
        BroadcastRecipient.objects.select_for_update()
        .filter(broadcast=broadcast, hospital_id=hospital_id)
        .first()
    )
    if not recipient:
        return {"is_read": False, "read_at": None, "updated": False}

    if not recipient.is_read:
        return {"is_read": False, "read_at": recipient.read_at, "updated": False}

    recipient.is_read = False
    recipient.read_at = None
    recipient.save(update_fields=["is_read", "read_at"])
    record_broadcast_change(action="unread", broadcast=broadcast)
    return {"is_read": False, "read_at": None, "updated": True}


def get_unread_broadcast_count(user) -> int:
    if _is_super_admin(user):
        raise PermissionDenied("Super admins do not have hospital unread state.")

    hospital_id = _hospital_id_for_user(user)
    if not hospital_id:
        raise ValidationError({"detail": "No hospital context."})

    return BroadcastRecipient.objects.filter(
        hospital_id=hospital_id,
        is_read=False,
    ).exclude(
        broadcast__sent_by_id=user.id,
    ).count()


def deliver_broadcast(broadcast: BroadcastMessage) -> int:
    """
    Create Notification records for each targeted user.
    Called from the Celery task.
    """
    if broadcast.scope == BroadcastMessage.Scope.ALL:
        users = list(UserAccount.objects.filter(is_active=True))
    else:
        users = list(
            UserAccount.objects.filter(
                staff__hospital__in=broadcast.target_hospitals.all(),
                is_active=True,
            ).distinct()
        )

    notifications = [
        Notification(
            user=user,
            notification_type=Notification.NotificationType.BROADCAST,
            message=broadcast.message,
            data={"broadcast_id": str(broadcast.id), "title": broadcast.title},
        )
        for user in users
    ]
    Notification.objects.bulk_create(notifications, batch_size=500)
    count = len(notifications)

    logger.info("Broadcast %s delivered to %d users", broadcast.id, count)
    return count


def create_emergency_response(broadcast: BroadcastMessage, hospital, data: dict, actor) -> EmergencyBroadcastResponse:
    if broadcast.status != BroadcastMessage.Status.ACTIVE:
        raise ValidationError({"detail": "Broadcast is closed and cannot receive responses."})

    if not broadcast.allow_response:
        raise ValidationError({"detail": "Responses are disabled for this broadcast."})

    response, created = EmergencyBroadcastResponse.objects.get_or_create(
        broadcast=broadcast,
        hospital=hospital,
        defaults={**data, "responded_by": actor},
    )
    if not created:
        # Update existing response
        for key, value in data.items():
            setattr(response, key, value)
        response.responded_by = actor
        response.save()

    return response


def can_manage_broadcast(broadcast: BroadcastMessage, actor) -> bool:
    if _is_super_admin(actor):
        return True
    return bool(broadcast.sent_by_id and broadcast.sent_by_id == actor.id)


def close_broadcast(broadcast: BroadcastMessage, actor) -> BroadcastMessage:
    if not can_manage_broadcast(broadcast, actor):
        raise PermissionDenied("Only the broadcast creator or an authorized manager can close this broadcast.")

    if broadcast.status == BroadcastMessage.Status.CLOSED:
        return broadcast

    broadcast.status = BroadcastMessage.Status.CLOSED
    broadcast.closed_by = actor
    broadcast.closed_at = timezone.now()
    broadcast.save(update_fields=["status", "closed_by", "closed_at"])
    record_broadcast_change(action="edit", broadcast=broadcast)
    return broadcast


@transaction.atomic
def delete_broadcast(broadcast: BroadcastMessage) -> bool:
    broadcast_id = str(broadcast.id)
    deleted_rows, _ = BroadcastMessage.objects.filter(id=broadcast.id).delete()
    if deleted_rows:
        record_broadcast_change(action="delete", broadcast_id=broadcast_id)
        return True
    return False


def can_view_broadcast_responses(broadcast: BroadcastMessage, actor) -> bool:
    if can_manage_broadcast(broadcast, actor):
        return True

    return has_any_permission(
        actor,
        BROADCAST_RESPONSE_VIEW_PERMISSION_CODES,
        hospital_id=_hospital_id_for_user(actor),
        allow_role_fallback=False,
    )
