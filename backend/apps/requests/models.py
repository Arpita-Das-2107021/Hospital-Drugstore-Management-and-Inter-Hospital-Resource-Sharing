"""Requests domain models: ResourceRequest, ResourceRequestApproval, DispatchEvent, DeliveryEvent, DeliveryToken."""
import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone


class ResourceRequest(models.Model):
    """
    A hospital requesting a resource from another hospital.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        DISPATCHED = "dispatched", "Dispatched"
        FULFILLED = "fulfilled", "Fulfilled"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PENDING_MANUAL_VERIFICATION = "pending_manual_verification", "Pending Manual Verification"
        PAID = "paid", "Paid"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requesting_hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="outgoing_requests",
    )
    supplying_hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="incoming_requests",
    )
    catalog_item = models.ForeignKey(
        "resources.ResourceCatalog",
        on_delete=models.PROTECT,
        related_name="requests",
    )
    quantity_requested = models.PositiveIntegerField()
    quantity_approved = models.PositiveIntegerField(null=True, blank=True)
    price_snapshot = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_status = models.CharField(
        max_length=40,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )
    payment_note = models.TextField(blank=True)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    notes = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="resource_requests_made",
    )
    needed_by = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "requests_resourcerequest"
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["requesting_hospital", "status"]),
            models.Index(fields=["supplying_hospital", "status"]),
        ]

    def __str__(self) -> str:
        return f"Request({self.requesting_hospital}->{self.supplying_hospital}, {self.catalog_item}, {self.status})"


class ResourceRequestApproval(models.Model):
    """Record of who approved/rejected a request and why."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.OneToOneField(
        ResourceRequest,
        on_delete=models.CASCADE,
        related_name="approval",
    )
    reviewed_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="reviewed_requests",
    )
    decision = models.CharField(max_length=20, choices=[("approved", "Approved"), ("rejected", "Rejected")])
    quantity_approved = models.PositiveIntegerField(null=True, blank=True)
    reason = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "requests_approval"

    def __str__(self) -> str:
        return f"Approval({self.request}, {self.decision})"


class DispatchEvent(models.Model):
    """Logged when a request is physically dispatched."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.OneToOneField(
        ResourceRequest,
        on_delete=models.CASCADE,
        related_name="dispatch_event",
    )
    dispatched_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="dispatch_events",
    )
    shipment = models.ForeignKey(
        "shipments.Shipment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispatch_events",
    )
    notes = models.TextField(blank=True)
    dispatched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "requests_dispatchevent"


class DeliveryToken(models.Model):
    """
    One-time token the receiving hospital uses to confirm delivery.
    Expires after EXPIRY_HOURS.
    """

    EXPIRY_HOURS = 48

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.OneToOneField(
        ResourceRequest,
        on_delete=models.CASCADE,
        related_name="delivery_token",
    )
    token = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "requests_deliverytoken"

    @property
    def is_valid(self) -> bool:
        return self.used_at is None and timezone.now() < self.expires_at


class DeliveryEvent(models.Model):
    """Logged when a request is confirmed as delivered."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.OneToOneField(
        ResourceRequest,
        on_delete=models.CASCADE,
        related_name="delivery_event",
    )
    confirmed_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="delivery_events",
    )
    quantity_received = models.PositiveIntegerField()
    notes = models.TextField(blank=True)
    delivered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "requests_deliveryevent"
