"""Shipments domain models: Shipment, ShipmentTracking."""
import uuid

from django.db import models
from django.utils import timezone


class Shipment(models.Model):
    """
    A physical shipment that may carry one or more dispatched resource requests.
    Managed by logistics staff.
    """

    class Status(models.TextChoices):
        PENDING = "pending_dispatch", "Pending Dispatch"
        DISPATCHED = "dispatched", "Dispatched"
        IN_TRANSIT = "in_transit", "In Transit"
        DELIVERED = "delivered", "Delivered"
        CANCEL_REQUESTED = "cancel_requested", "Cancel Requested"
        RETURNING = "returning", "Returning"
        RETURNED = "returned", "Returned"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=100, blank=True, db_index=True)
    origin_hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="outgoing_shipments",
    )
    destination_hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="incoming_shipments",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    dispatch_token = models.CharField(max_length=128, blank=True)
    receive_token = models.CharField(max_length=128, blank=True)
    return_token = models.CharField(max_length=128, blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    dispatch_token_used_at = models.DateTimeField(null=True, blank=True)
    receive_token_used_at = models.DateTimeField(null=True, blank=True)
    return_token_used_at = models.DateTimeField(null=True, blank=True)
    rider_name = models.CharField(max_length=200, blank=True)
    rider_phone = models.CharField(max_length=50, blank=True)
    vehicle_info = models.CharField(max_length=200, blank=True)
    cancel_reason = models.TextField(blank=True)
    carrier_name = models.CharField(max_length=200, blank=True)
    tracking_number = models.CharField(max_length=200, blank=True)
    estimated_delivery_at = models.DateTimeField(null=True, blank=True)
    actual_delivery_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="shipments_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "shipments_shipment"
        indexes = [
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Shipment({self.origin_hospital}->{self.destination_hospital}, {self.status})"

    @property
    def tokens_are_valid(self) -> bool:
        return bool(self.token_expires_at and timezone.now() < self.token_expires_at)


class ShipmentTracking(models.Model):
    """
    Ordered log of location/status updates for a shipment.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shipment = models.ForeignKey(
        Shipment,
        on_delete=models.CASCADE,
        related_name="tracking_events",
    )
    status = models.CharField(max_length=20, choices=Shipment.Status.choices)
    location = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="shipment_tracking_entries",
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shipments_tracking"
        ordering = ["-recorded_at"]

    def __str__(self) -> str:
        return f"Tracking({self.shipment}, {self.status}, {self.recorded_at})"
