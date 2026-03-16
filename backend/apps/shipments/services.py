"""Shipments service layer."""
import logging

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import Shipment, ShipmentTracking

logger = logging.getLogger("hrsp.shipments")


def create_shipment(origin_hospital, destination_hospital, data: dict, actor) -> Shipment:
    shipment = Shipment.objects.create(
        origin_hospital=origin_hospital,
        destination_hospital=destination_hospital,
        created_by=actor,
        **data,
    )
    ShipmentTracking.objects.create(
        shipment=shipment,
        status=Shipment.Status.PENDING,
        notes="Shipment created.",
        recorded_by=actor,
    )
    logger.info("Shipment created: %s", shipment.id)
    return shipment


def add_tracking_event(shipment: Shipment, status: str, location: str, notes: str, actor) -> ShipmentTracking:
    with transaction.atomic():
        event = ShipmentTracking.objects.create(
            shipment=shipment,
            status=status,
            location=location,
            notes=notes,
            recorded_by=actor,
        )
        shipment.status = status
        if status == Shipment.Status.DELIVERED:
            from django.utils import timezone
            shipment.actual_delivery_at = timezone.now()
        shipment.save(update_fields=["status", "actual_delivery_at", "updated_at"])

    logger.info("Tracking event added to shipment %s: %s", shipment.id, status)
    return event
