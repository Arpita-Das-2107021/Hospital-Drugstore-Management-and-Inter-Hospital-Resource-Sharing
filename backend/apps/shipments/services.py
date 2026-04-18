"""Shipments service layer."""
import logging

from django.db import transaction
from rest_framework.exceptions import ValidationError

from common.services.workflow_lock import ensure_shipment_workflow_is_mutable

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
    ensure_shipment_workflow_is_mutable(shipment)

    if status == Shipment.Status.DELIVERED:
        from apps.requests.models import DispatchEvent, ResourceRequest

        active_dispatch = (
            DispatchEvent.objects.select_related("request")
            .filter(
                shipment=shipment,
                request__workflow_state=ResourceRequest.WorkflowState.IN_TRANSIT,
            )
            .first()
        )
        if active_dispatch is not None:
            raise ValidationError(
                {
                    "detail": (
                        "Cannot mark shipment as delivered from shipments tracking while linked request is in transit. "
                        "Use request transfer confirmation endpoint instead."
                    ),
                    "request_id": str(active_dispatch.request_id),
                }
            )

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


def assign_rider(shipment: Shipment, rider_name: str, rider_phone: str, vehicle_info: str) -> Shipment:
    ensure_shipment_workflow_is_mutable(shipment)
    shipment.rider_name = rider_name
    shipment.rider_phone = rider_phone
    shipment.vehicle_info = vehicle_info
    shipment.save(update_fields=["rider_name", "rider_phone", "vehicle_info", "updated_at"])
    return shipment
