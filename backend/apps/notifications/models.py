"""Notifications domain models: Notification, BroadcastMessage, EmergencyBroadcastResponse."""
import uuid

from django.db import models


class Notification(models.Model):
    """In-app notification for a single user."""

    class NotificationType(models.TextChoices):
        REQUEST_RECEIVED = "request_received", "Request Received"
        REQUEST_APPROVED = "request_approved", "Request Approved"
        REQUEST_REJECTED = "request_rejected", "Request Rejected"
        REQUEST_DISPATCHED = "request_dispatched", "Request Dispatched"
        REQUEST_DELIVERED = "request_delivered", "Request Delivered"
        INVITATION_SENT = "invitation_sent", "Invitation Sent"
        BROADCAST = "broadcast", "Broadcast"
        SYSTEM = "system", "System"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(max_length=30, choices=NotificationType.choices)
    message = models.TextField()
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_notification"
        indexes = [
            models.Index(fields=["user", "is_read", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Notification({self.user}, {self.notification_type}, read={self.is_read})"


class BroadcastMessage(models.Model):
    """
    A message sent to all staff at one or more hospitals, or system-wide.
    """

    class Scope(models.TextChoices):
        ALL = "all", "System-Wide"
        HOSPITALS = "hospitals", "Specific Hospitals"

    class Priority(models.TextChoices):
        NORMAL = "normal", "Normal"
        URGENT = "urgent", "Urgent"
        EMERGENCY = "emergency", "Emergency"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=300)
    message = models.TextField()
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.ALL)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    allow_response = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    target_hospitals = models.ManyToManyField(
        "hospitals.Hospital",
        blank=True,
        related_name="targeted_broadcasts",
    )
    sent_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="broadcasts_sent",
    )
    closed_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="broadcasts_closed",
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_broadcast"

    def __str__(self) -> str:
        return f"Broadcast({self.title}, {self.priority})"


class BroadcastRecipient(models.Model):
    """Per-hospital delivery and read state for a broadcast."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    broadcast = models.ForeignKey(
        BroadcastMessage,
        on_delete=models.CASCADE,
        related_name="recipients",
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="broadcast_recipients",
    )
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_broadcastrecipient"
        constraints = [
            models.UniqueConstraint(fields=["broadcast", "hospital"], name="uniq_broadcast_hospital_recipient"),
        ]
        indexes = [
            models.Index(fields=["hospital", "is_read"]),
            models.Index(fields=["broadcast", "hospital"]),
        ]

    def __str__(self) -> str:
        return f"BroadcastRecipient({self.broadcast_id}, {self.hospital_id}, read={self.is_read})"


class EmergencyBroadcastResponse(models.Model):
    """
    A hospital's response to an emergency broadcast
    (e.g. 'We can provide X units of Y').
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    broadcast = models.ForeignKey(
        BroadcastMessage,
        on_delete=models.CASCADE,
        related_name="responses",
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="broadcast_responses",
    )
    responded_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="broadcast_responses",
    )
    can_provide = models.BooleanField(default=False)
    quantity_available = models.PositiveIntegerField(null=True, blank=True)
    response_message = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    responded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_emergencyresponse"
        unique_together = [("broadcast", "hospital")]

    def __str__(self) -> str:
        return f"Response({self.hospital}, broadcast={self.broadcast.id})"
