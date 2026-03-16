"""Audit log model — append-only record of significant platform events."""
import uuid

from django.db import models


class AuditLog(models.Model):
    """
    Immutable audit record. Never update or delete.
    Written by AuditMiddleware and explicit service calls.
    """

    class EventType(models.TextChoices):
        # Auth
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"
        LOGIN_FAILED = "login_failed", "Login Failed"
        PASSWORD_RESET = "password_reset", "Password Reset"
        # Hospitals
        HOSPITAL_CREATED = "hospital_created", "Hospital Created"
        HOSPITAL_VERIFIED = "hospital_verified", "Hospital Verified"
        HOSPITAL_SUSPENDED = "hospital_suspended", "Hospital Suspended"
        HOSPITAL_OFFBOARDING_REQUESTED = "hospital_offboarding_requested", "Hospital Offboarding Requested"
        HOSPITAL_OFFBOARDING_APPROVED = "hospital_offboarding_approved", "Hospital Offboarding Approved"
        HOSPITAL_OFFBOARDING_REJECTED = "hospital_offboarding_rejected", "Hospital Offboarding Rejected"
        # Staff
        STAFF_INVITED = "staff_invited", "Staff Invited"
        INVITATION_ACCEPTED = "invitation_accepted", "Invitation Accepted"
        ROLE_ASSIGNED = "role_assigned", "Role Assigned"
        ROLE_REVOKED = "role_revoked", "Role Revoked"
        # Resources
        INVENTORY_ADJUSTED = "inventory_adjusted", "Inventory Adjusted"
        # Requests
        REQUEST_CREATED = "request_created", "Request Created"
        REQUEST_APPROVED = "request_approved", "Request Approved"
        REQUEST_REJECTED = "request_rejected", "Request Rejected"
        REQUEST_DISPATCHED = "request_dispatched", "Request Dispatched"
        REQUEST_DELIVERED = "request_delivered", "Request Delivered"
        REQUEST_CANCELLED = "request_cancelled", "Request Cancelled"
        # Shipments
        SHIPMENT_CREATED = "shipment_created", "Shipment Created"
        SHIPMENT_STATUS_UPDATED = "shipment_status_updated", "Shipment Status Updated"
        # Admin
        BROADCAST_SENT = "broadcast_sent", "Broadcast Sent"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_type = models.CharField(max_length=50, choices=EventType.choices)
    actor = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    object_id = models.UUIDField(null=True, blank=True, help_text="PK of the affected object")
    object_type = models.CharField(max_length=100, blank=True, help_text="Model name of the affected object")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_auditlog"
        indexes = [
            models.Index(fields=["event_type", "-created_at"]),
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["hospital", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"AuditLog({self.event_type}, actor={self.actor_id})"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("AuditLog entries are immutable.")
        super().save(*args, **kwargs)
