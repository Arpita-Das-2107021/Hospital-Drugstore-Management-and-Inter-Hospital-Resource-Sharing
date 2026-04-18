"""Resources service layer."""
import logging
import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import ResourceCatalog, ResourceInventory, ResourceShare, ResourceTransaction

logger = logging.getLogger("hrsp.resources")


def create_catalog_item(hospital, data: dict) -> ResourceCatalog:
    item = ResourceCatalog.objects.create(hospital=hospital, **data)
    ResourceInventory.objects.create(catalog_item=item)
    logger.info("Catalog item created: %s for hospital %s", item.id, hospital.id)
    return item


def adjust_inventory(
    inventory: ResourceInventory,
    quantity_delta: int,
    transaction_type: str,
    actor,
    notes: str = "",
    reference_id=None,
) -> ResourceInventory:
    with transaction.atomic():
        # Lock the row
        inventory = ResourceInventory.objects.select_for_update().get(pk=inventory.pk)
        new_qty = inventory.quantity_available + quantity_delta
        if new_qty < 0:
            raise ValidationError(
                {"detail": f"Insufficient quantity. Available: {inventory.quantity_available}, delta: {quantity_delta}"}
            )
        inventory.quantity_available = new_qty
        inventory.save(update_fields=["quantity_available", "updated_at"])

        ResourceTransaction.objects.create(
            inventory=inventory,
            transaction_type=transaction_type,
            quantity_delta=quantity_delta,
            balance_after=new_qty,
            reference_id=reference_id,
            notes=notes,
            performed_by=actor,
        )

    logger.info(
        "Inventory adjusted: %s delta=%d new_qty=%d by %s",
        inventory.id,
        quantity_delta,
        new_qty,
        actor.id,
    )
    return inventory


def reserve_inventory(inventory: ResourceInventory, quantity: int) -> ResourceInventory:
    """Reserve quantity (for pending requests). Does not reduce available stock."""
    with transaction.atomic():
        inventory = ResourceInventory.objects.select_for_update().get(pk=inventory.pk)
        if inventory.quantity_free < quantity:
            raise ValidationError(
                {"detail": f"Insufficient free quantity. Free: {inventory.quantity_free}, requested: {quantity}"}
            )
        inventory.reserved_quantity += quantity
        inventory.quantity_reserved = inventory.reserved_quantity
        inventory.save(update_fields=["reserved_quantity", "quantity_reserved", "updated_at"])
    return inventory


def release_reservation(inventory: ResourceInventory, quantity: int) -> ResourceInventory:
    """Release a reservation (e.g. request cancelled)."""
    with transaction.atomic():
        inventory = ResourceInventory.objects.select_for_update().get(pk=inventory.pk)
        inventory.reserved_quantity = max(0, inventory.reserved_quantity - quantity)
        inventory.quantity_reserved = inventory.reserved_quantity
        inventory.save(update_fields=["reserved_quantity", "quantity_reserved", "updated_at"])
    return inventory


def create_resource_share(hospital, catalog_item_id, data: dict, actor) -> ResourceShare:
    try:
        catalog_item = ResourceCatalog.objects.get(id=catalog_item_id, hospital=hospital)
    except ResourceCatalog.DoesNotExist:
        raise ValidationError({"catalog_item": "Catalog item not found for this hospital."})

    if not catalog_item.is_shareable:
        raise ValidationError({"detail": "This catalog item is not marked as shareable."})

    with transaction.atomic():
        share = ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=catalog_item,
            created_by=actor,
            **data,
        )

        try:
            inventory = catalog_item.inventory
        except ResourceInventory.DoesNotExist:
            inventory = None
        payload = {
            "event_id": str(uuid.uuid4()),
            "event_type": "resource_share_created",
            "occurred_at": timezone.now().isoformat(),
            "source_hospital_id": str(hospital.id),
            "source_hospital_name": hospital.name,
            "triggered_by_share_id": str(share.id),
            "actor_id": str(getattr(actor, "id", "")) if actor else "",
            "inventory": {
                "inventory_id": str(inventory.id) if inventory else None,
                "catalog_item_id": str(catalog_item.id),
                "resource_name": catalog_item.name,
                "resource_type": catalog_item.resource_type.name,
                "unit_of_measure": catalog_item.unit_of_measure,
                "quantity_available": inventory.quantity_available if inventory else 0,
                "quantity_reserved": inventory.reserved_quantity if inventory else 0,
                "quantity_free": inventory.quantity_free if inventory else 0,
            },
            "share": {
                "status": share.status,
                "quantity_offered": share.quantity_offered,
                "valid_until": share.valid_until.isoformat() if share.valid_until else None,
            },
            "metadata": {
                "notes": share.notes,
            },
        }

        def _notify_after_commit() -> None:
            from apps.hospitals.services import notify_hospital_inventory_update

            notify_hospital_inventory_update(
                hospital=hospital,
                operation="resource_share_update",
                payload=payload,
            )

        transaction.on_commit(_notify_after_commit)

    logger.info("ResourceShare created: %s", share.id)
    return share
