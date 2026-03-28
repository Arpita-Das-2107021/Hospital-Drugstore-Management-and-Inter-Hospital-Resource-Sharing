"""Notifications service layer."""
import logging

from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import BroadcastMessage, BroadcastRecipient, EmergencyBroadcastResponse, Notification

UserAccount = get_user_model()
logger = logging.getLogger("hrsp.notifications")


def _is_super_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.roles.filter(name="SUPER_ADMIN").exists())


def _hospital_id_for_user(user):
    staff = getattr(user, "staff", None)
    return getattr(staff, "hospital_id", None)


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
    return {"is_read": True, "read_at": now, "updated": True}


def get_unread_broadcast_count(user) -> int:
    if _is_super_admin(user):
        raise PermissionDenied("Super admins do not have hospital unread state.")

    hospital_id = _hospital_id_for_user(user)
    if not hospital_id:
        raise ValidationError({"detail": "No hospital context."})

    return BroadcastRecipient.objects.filter(hospital_id=hospital_id, is_read=False).count()


def deliver_broadcast(broadcast: BroadcastMessage) -> int:
    """
    Create Notification records for each targeted user.
    Called from the Celery task.
    """
    if broadcast.scope == BroadcastMessage.Scope.ALL:
        users = UserAccount.objects.filter(is_active=True)
    else:
        users = UserAccount.objects.filter(
            staff__hospital__in=broadcast.target_hospitals.all(),
            is_active=True,
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
        raise PermissionDenied("Only the broadcast creator or a super admin can close this broadcast.")

    if broadcast.status == BroadcastMessage.Status.CLOSED:
        return broadcast

    broadcast.status = BroadcastMessage.Status.CLOSED
    broadcast.closed_by = actor
    broadcast.closed_at = timezone.now()
    broadcast.save(update_fields=["status", "closed_by", "closed_at"])
    return broadcast


def can_view_broadcast_responses(broadcast: BroadcastMessage, actor) -> bool:
    return can_manage_broadcast(broadcast, actor)
