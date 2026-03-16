"""Requests service layer."""
import logging
from decimal import Decimal
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from common.utils.tokens import generate_hex_token

from .models import (
    DeliveryEvent,
    DeliveryToken,
    DispatchEvent,
    ResourceRequest,
    ResourceRequestApproval,
)

logger = logging.getLogger("hrsp.requests")


def create_resource_request(requesting_hospital, data: dict, actor) -> ResourceRequest:
    from apps.hospitals.models import Hospital
    from apps.resources.models import ResourceCatalog

    try:
        supplying_hospital = Hospital.objects.get(id=data["supplying_hospital"])
    except Hospital.DoesNotExist:
        raise NotFound("Supplying hospital not found.")

    try:
        catalog_item = ResourceCatalog.objects.get(id=data["catalog_item"])
    except ResourceCatalog.DoesNotExist:
        raise NotFound("Catalog item not found.")

    if not catalog_item.is_shareable:
        raise ValidationError({"detail": "This resource is not marked as shareable."})

    if requesting_hospital == supplying_hospital:
        raise ValidationError({"detail": "Cannot request from your own hospital."})

    req = ResourceRequest.objects.create(
        requesting_hospital=requesting_hospital,
        supplying_hospital=supplying_hospital,
        catalog_item=catalog_item,
        quantity_requested=data["quantity_requested"],
        priority=data.get("priority", ResourceRequest.Priority.NORMAL),
        notes=data.get("notes", ""),
        needed_by=data.get("needed_by"),
        requested_by=actor,
    )
    logger.info("ResourceRequest created: %s", req.id)
    return req


def approve_request(req: ResourceRequest, decision: str, quantity_approved: int, reason: str, actor) -> ResourceRequest:
    if req.status != ResourceRequest.Status.PENDING:
        raise ValidationError({"detail": f"Request is already {req.status}."})

    with transaction.atomic():
        if decision == "approved":
            from apps.resources.services import reserve_inventory

            inventory = req.catalog_item.inventory
            approved_qty = quantity_approved or req.quantity_requested
            reserve_inventory(inventory, approved_qty)

            # Snapshot pricing at approval time to prevent later manipulation.
            req.price_snapshot = inventory.price_per_unit
            req.total_price = Decimal(approved_qty) * inventory.price_per_unit
            req.status = ResourceRequest.Status.APPROVED
            req.quantity_approved = approved_qty
        else:
            req.status = ResourceRequest.Status.REJECTED
            req.quantity_approved = None

        req.save(update_fields=["status", "quantity_approved", "price_snapshot", "total_price", "updated_at"])

        ResourceRequestApproval.objects.create(
            request=req,
            reviewed_by=actor,
            decision=decision,
            quantity_approved=req.quantity_approved,
            reason=reason,
        )

    logger.info("Request %s %s by %s", req.id, decision, actor.id)
    return req


def dispatch_request(req: ResourceRequest, actor, shipment=None, notes: str = "") -> DispatchEvent:
    if req.status != ResourceRequest.Status.APPROVED:
        raise ValidationError({"detail": "Only approved requests can be dispatched."})

    with transaction.atomic():
        from apps.shipments.models import Shipment, ShipmentTracking
        from apps.shipments.services import create_shipment

        if shipment is None:
            shipment = create_shipment(
                origin_hospital=req.supplying_hospital,
                destination_hospital=req.requesting_hospital,
                data={"reference": f"REQ-{req.id}"},
                actor=actor,
            )

        req.status = ResourceRequest.Status.DISPATCHED
        req.save(update_fields=["status", "updated_at"])

        token_expiry = timezone.now() + timedelta(hours=24)
        shipment.dispatch_token = generate_hex_token(32)
        shipment.receive_token = generate_hex_token(32)
        shipment.token_expires_at = token_expiry
        shipment.status = Shipment.Status.DISPATCHED
        shipment.save(update_fields=["dispatch_token", "receive_token", "token_expires_at", "status", "updated_at"])

        ShipmentTracking.objects.create(
            shipment=shipment,
            status=Shipment.Status.DISPATCHED,
            notes="Resource dispatched",
            recorded_by=actor,
        )

        dispatch_event = DispatchEvent.objects.create(
            request=req,
            dispatched_by=actor,
            shipment=shipment,
            notes=notes,
        )

        # Keep legacy delivery token for backward compatibility.
        DeliveryToken.objects.update_or_create(
            request=req,
            defaults={
                "token": shipment.dispatch_token,
                "expires_at": token_expiry,
                "used_at": None,
            },
        )

    logger.info("Request %s dispatched", req.id)
    return dispatch_event


def confirm_delivery(token_value: str, quantity_received: int, notes: str, actor, receive_token: str | None = None) -> DeliveryEvent:
    from apps.shipments.models import Shipment, ShipmentTracking

    legacy_token = DeliveryToken.objects.select_related("request").filter(token=token_value).first()
    if legacy_token and not legacy_token.is_valid:
        raise ValidationError({"detail": "Delivery token is expired or already used."})

    try:
        dispatch_event = DispatchEvent.objects.select_related("request", "shipment").get(shipment__dispatch_token=token_value)
    except DispatchEvent.DoesNotExist:
        # Backward-compatibility path via DeliveryToken model.
        if legacy_token is None:
            raise NotFound("Delivery token not found.")

        dispatch_event = DispatchEvent.objects.select_related("request", "shipment").filter(request=legacy_token.request).first()
        if dispatch_event is None:
            raise ValidationError({"detail": "No shipment found for this delivery token."})

    req = dispatch_event.request
    shipment = dispatch_event.shipment

    if shipment is None:
        raise ValidationError({"detail": "Shipment missing for this request."})
    if receive_token and shipment.receive_token != receive_token:
        raise ValidationError({"detail": "Invalid receive token."})
    if not shipment.tokens_are_valid:
        raise ValidationError({"detail": "Dispatch token has expired."})
    if shipment.dispatch_token_used_at or shipment.receive_token_used_at:
        raise ValidationError({"detail": "Delivery tokens already used."})
    if req.status != ResourceRequest.Status.DISPATCHED:
        raise ValidationError({"detail": "Request is not in dispatched state."})

    approved_quantity = req.quantity_approved or req.quantity_requested
    if quantity_received > approved_quantity:
        raise ValidationError({"detail": "Received quantity cannot exceed approved quantity."})

    with transaction.atomic():
        from apps.resources.services import adjust_inventory, release_reservation
        from apps.resources.models import ResourceInventory, ResourceTransaction

        supplying_inventory = req.catalog_item.inventory
        adjust_inventory(
            inventory=supplying_inventory,
            quantity_delta=-quantity_received,
            transaction_type=ResourceTransaction.TransactionType.TRANSFER_OUT,
            actor=actor,
            notes=f"Delivered for request {req.id}",
            reference_id=req.id,
        )
        release_reservation(supplying_inventory, quantity_received)

        # Credit receiving hospital inventory
        try:
            receiving_inv = ResourceInventory.objects.get(catalog_item__hospital=req.requesting_hospital,
                                                          catalog_item__name=req.catalog_item.name)
        except ResourceInventory.DoesNotExist:
            receiving_inv = None

        if receiving_inv:
            adjust_inventory(
                inventory=receiving_inv,
                quantity_delta=quantity_received,
                transaction_type=ResourceTransaction.TransactionType.TRANSFER_IN,
                actor=actor,
                notes=f"Received from request {req.id}",
                reference_id=req.id,
            )

        delivery_event = DeliveryEvent.objects.create(
            request=req,
            confirmed_by=actor,
            quantity_received=quantity_received,
            notes=notes,
        )

        shipment.dispatch_token_used_at = timezone.now()
        if receive_token:
            shipment.receive_token_used_at = timezone.now()
        shipment.status = Shipment.Status.DELIVERED
        shipment.actual_delivery_at = timezone.now()
        shipment.save(
            update_fields=[
                "dispatch_token_used_at",
                "receive_token_used_at",
                "status",
                "actual_delivery_at",
                "updated_at",
            ]
        )

        DeliveryToken.objects.filter(request=req, token=token_value, used_at__isnull=True).update(used_at=timezone.now())

        ShipmentTracking.objects.create(
            shipment=shipment,
            status=Shipment.Status.DELIVERED,
            notes="delivery_verified",
            recorded_by=actor,
        )

        req.status = ResourceRequest.Status.FULFILLED if receive_token else ResourceRequest.Status.DELIVERED
        req.save(update_fields=["status", "updated_at"])

    logger.info("Delivery confirmed for request %s", req.id)
    return delivery_event


def cancel_request(req: ResourceRequest, actor, reason: str = "") -> ResourceRequest:
    from apps.shipments.models import Shipment, ShipmentTracking

    if req.status in (ResourceRequest.Status.FULFILLED, ResourceRequest.Status.DELIVERED, ResourceRequest.Status.REJECTED):
        raise ValidationError({"detail": f"Cannot cancel a request with status {req.status}."})

    with transaction.atomic():
        if req.status == ResourceRequest.Status.APPROVED:
            from apps.resources.services import release_reservation

            release_reservation(req.catalog_item.inventory, req.quantity_approved or req.quantity_requested)

            try:
                dispatch_event = DispatchEvent.objects.select_related("shipment").get(request=req)
            except DispatchEvent.DoesNotExist:
                dispatch_event = None

            if dispatch_event and dispatch_event.shipment:
                dispatch_event.shipment.status = Shipment.Status.CANCELLED
                dispatch_event.shipment.cancel_reason = reason
                dispatch_event.shipment.save(update_fields=["status", "cancel_reason", "updated_at"])
                ShipmentTracking.objects.create(
                    shipment=dispatch_event.shipment,
                    status=Shipment.Status.CANCELLED,
                    notes=reason or "Cancelled before dispatch",
                    recorded_by=actor,
                )

        elif req.status == ResourceRequest.Status.DISPATCHED:
            if not reason:
                raise ValidationError({"detail": "Cannot cancel a dispatched request without a return reason."})

            dispatch_event = DispatchEvent.objects.select_related("shipment").filter(request=req).first()
            if not dispatch_event or not dispatch_event.shipment:
                raise ValidationError({"detail": "Dispatched request has no shipment to return."})

            shipment = dispatch_event.shipment
            if not shipment.return_token:
                shipment.return_token = generate_hex_token(32)
            shipment.status = Shipment.Status.RETURNING
            shipment.cancel_reason = reason
            shipment.save(update_fields=["return_token", "status", "cancel_reason", "updated_at"])
            ShipmentTracking.objects.create(
                shipment=shipment,
                status=Shipment.Status.RETURNING,
                notes=reason or "Returning to origin",
                recorded_by=actor,
            )

        req.status = ResourceRequest.Status.CANCELLED
        req.save(update_fields=["status", "updated_at"])

    logger.info("Request %s cancelled by %s", req.id, actor.id)
    return req


def verify_return(req: ResourceRequest, return_token: str, actor) -> ResourceRequest:
    from apps.shipments.models import Shipment, ShipmentTracking
    from apps.resources.services import release_reservation

    if req.status != ResourceRequest.Status.CANCELLED:
        raise ValidationError({"detail": "Only cancelled requests can be returned."})

    dispatch_event = DispatchEvent.objects.select_related("shipment").filter(request=req).first()
    if not dispatch_event or not dispatch_event.shipment:
        raise ValidationError({"detail": "No shipment found for this request."})

    shipment = dispatch_event.shipment
    if shipment.return_token != return_token:
        raise ValidationError({"detail": "Invalid return token."})
    if shipment.return_token_used_at:
        raise ValidationError({"detail": "Return token already used."})

    with transaction.atomic():
        release_reservation(req.catalog_item.inventory, req.quantity_approved or req.quantity_requested)
        shipment.return_token_used_at = timezone.now()
        shipment.status = Shipment.Status.RETURNED
        shipment.save(update_fields=["return_token_used_at", "status", "updated_at"])
        ShipmentTracking.objects.create(
            shipment=shipment,
            status=Shipment.Status.RETURNED,
            notes="Return verified at origin.",
            recorded_by=actor,
        )

    logger.info("Return verified for request %s", req.id)
    return req


def confirm_payment(req: ResourceRequest, payment_status: str, payment_note: str, actor) -> ResourceRequest:
    if req.status != ResourceRequest.Status.FULFILLED:
        raise ValidationError({"detail": "Payment can only be recorded for fulfilled requests."})

    if payment_status not in ResourceRequest.PaymentStatus.values:
        raise ValidationError({"detail": "Invalid payment status."})

    req.payment_status = payment_status
    req.payment_note = payment_note or ""
    req.save(update_fields=["payment_status", "payment_note", "updated_at"])
    logger.info("Payment status updated for request %s by %s", req.id, actor.id)
    return req
