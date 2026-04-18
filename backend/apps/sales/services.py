"""Service layer for internal operational sales."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.ml.models import MLDispenseLog
from apps.resources.models import (
    ResourceCatalog,
    ResourceInventory,
    ResourceInventoryBatch,
    ResourceTransaction,
    ResourceType,
)
from common.permissions.runtime import has_any_permission, is_platform_operator, user_hospital_id

from .models import InternalSale, RetailSale

INTERNAL_SALES_SOURCE_ENDPOINT = "/api/v1/sales/records/"
RETAIL_SALES_PERMISSION_CREATE = "sale.create"
RETAIL_SALES_PERMISSION_HISTORY = "sale.history.view"
INVENTORY_PERMISSION_VIEW = "inventory.view"
INVENTORY_PERMISSION_BATCH_VIEW = "inventory.batch.view"
INVENTORY_PERMISSION_COST_VIEW = "inventory.cost.view"

# Prefer namespaced dual-scope codes, but keep legacy compatibility.
RETAIL_SALES_PERMISSION_CREATE_CODES = ("hospital:sales.manage", RETAIL_SALES_PERMISSION_CREATE)
RETAIL_SALES_PERMISSION_HISTORY_CODES = ("hospital:sales.view", RETAIL_SALES_PERMISSION_HISTORY)
INVENTORY_PERMISSION_VIEW_CODES = ("hospital:inventory.view", INVENTORY_PERMISSION_VIEW)
INVENTORY_PERMISSION_BATCH_VIEW_CODES = ("hospital:inventory.view", INVENTORY_PERMISSION_BATCH_VIEW)
INVENTORY_PERMISSION_COST_VIEW_CODES = ("hospital:inventory.view", INVENTORY_PERMISSION_COST_VIEW)


def _normalize_text(value) -> str:
    return str(value or "").strip()


def _compute_total_amount(*, quantity_sold: int, unit_price: Decimal, total_amount: Decimal | None) -> Decimal:
    if total_amount is not None:
        return total_amount
    return unit_price * Decimal(quantity_sold)


def _get_or_create_catalog_item(
    *,
    facility,
    medicine_name: str,
    resource_type_name: str,
    unit: str,
) -> ResourceCatalog:
    normalized_name = _normalize_text(medicine_name)
    if not normalized_name:
        raise ValidationError({"medicine_name": "medicine_name is required."})

    resource_type, _ = ResourceType.objects.get_or_create(name=_normalize_text(resource_type_name) or "Medication")
    normalized_unit = _normalize_text(unit) or "units"
    if normalized_unit and not resource_type.unit_of_measure:
        resource_type.unit_of_measure = normalized_unit
        resource_type.save(update_fields=["unit_of_measure", "updated_at"])

    catalog_item, _ = ResourceCatalog.objects.get_or_create(
        hospital=facility,
        resource_type=resource_type,
        name=normalized_name,
        defaults={
            "unit_of_measure": normalized_unit,
            "description": "",
        },
    )
    if normalized_unit and catalog_item.unit_of_measure != normalized_unit:
        catalog_item.unit_of_measure = normalized_unit
        catalog_item.save(update_fields=["unit_of_measure", "updated_at"])

    return catalog_item


def _resolve_catalog_item(
    *,
    facility,
    resource_catalog_id,
    medicine_name: str,
    resource_type_name: str,
    unit: str,
) -> ResourceCatalog:
    if resource_catalog_id:
        return get_object_or_404(ResourceCatalog, id=resource_catalog_id, hospital=facility)
    return _get_or_create_catalog_item(
        facility=facility,
        medicine_name=medicine_name,
        resource_type_name=resource_type_name,
        unit=unit,
    )


def _project_sale_to_ml_log(*, sale: InternalSale) -> None:
    external_event_id = f"internal-sale:{sale.id}"
    payload_hash = hashlib.sha256(
        json.dumps(
            {
                "sale_id": str(sale.id),
                "facility_id": str(sale.facility_id),
                "resource_catalog_id": str(sale.resource_catalog_id),
                "event_date": sale.event_date.isoformat(),
                "quantity_sold": int(sale.quantity_sold),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()

    MLDispenseLog.objects.update_or_create(
        facility=sale.facility,
        external_event_id=external_event_id,
        defaults={
            "resource_catalog": sale.resource_catalog,
            "event_date": sale.event_date,
            "quantity_sold": int(sale.quantity_sold),
            "source_type": MLDispenseLog.SourceType.INTERNAL_SALE,
            "source_endpoint": INTERNAL_SALES_SOURCE_ENDPOINT,
            "payload_hash": payload_hash,
            "raw_payload": {
                "sale_id": str(sale.id),
                "channel": sale.channel,
                "client_reference": sale.client_reference,
                "currency": sale.currency,
                "unit_price": str(sale.unit_price),
                "total_amount": str(sale.total_amount),
                "notes": sale.notes,
                "raw_payload": sale.raw_payload,
            },
        },
    )


def create_internal_sale(
    *,
    facility,
    actor,
    resource_catalog_id=None,
    medicine_name: str = "",
    quantity_sold: int,
    event_date=None,
    unit: str = "units",
    resource_type_name: str = "Medication",
    unit_price: Decimal | None = None,
    total_amount: Decimal | None = None,
    currency: str = "BDT",
    channel: str = InternalSale.Channel.WALK_IN,
    client_reference: str = "",
    notes: str = "",
    raw_payload: dict | None = None,
) -> tuple[InternalSale, bool]:
    quantity_sold = int(quantity_sold or 0)
    if quantity_sold <= 0:
        raise ValidationError({"quantity_sold": "quantity_sold must be greater than zero."})

    normalized_reference = _normalize_text(client_reference)
    unit_price_value = unit_price if unit_price is not None else Decimal("0.00")
    event_date_value = event_date or timezone.now().date()
    normalized_currency = _normalize_text(currency) or "BDT"

    with transaction.atomic():
        if normalized_reference:
            existing_sale = InternalSale.objects.select_related("resource_catalog", "facility").filter(
                facility=facility,
                client_reference=normalized_reference,
            ).first()
            if existing_sale:
                return existing_sale, True

        catalog_item = _resolve_catalog_item(
            facility=facility,
            resource_catalog_id=resource_catalog_id,
            medicine_name=medicine_name,
            resource_type_name=resource_type_name,
            unit=unit,
        )

        inventory, _ = ResourceInventory.objects.get_or_create(
            catalog_item=catalog_item,
            defaults={
                "quantity_available": 0,
                "quantity_reserved": 0,
                "reserved_quantity": 0,
            },
        )
        inventory = ResourceInventory.objects.select_for_update().get(pk=inventory.pk)

        effective_reserved = max(int(inventory.reserved_quantity or 0), int(inventory.quantity_reserved or 0))
        if inventory.quantity_available - quantity_sold < effective_reserved:
            raise ValidationError(
                {
                    "quantity_sold": (
                        "Insufficient free stock for this sale. "
                        f"Available={inventory.quantity_available}, reserved={effective_reserved}."
                    )
                }
            )

        inventory.quantity_available = max(0, int(inventory.quantity_available) - quantity_sold)
        inventory.save(update_fields=["quantity_available", "updated_at"])

        sale = InternalSale.objects.create(
            facility=facility,
            resource_catalog=catalog_item,
            sold_by=actor if getattr(actor, "is_authenticated", False) else None,
            event_date=event_date_value,
            quantity_sold=quantity_sold,
            unit_price=unit_price_value,
            total_amount=_compute_total_amount(
                quantity_sold=quantity_sold,
                unit_price=unit_price_value,
                total_amount=total_amount,
            ),
            currency=normalized_currency,
            channel=channel,
            client_reference=normalized_reference,
            notes=notes,
            raw_payload=raw_payload or {},
        )

        ResourceTransaction.objects.create(
            inventory=inventory,
            transaction_type=ResourceTransaction.TransactionType.TRANSFER_OUT,
            quantity_delta=-quantity_sold,
            balance_after=inventory.quantity_available,
            reference_id=sale.id,
            notes=f"internal_sale:{sale.id}",
            performed_by=actor if getattr(actor, "is_authenticated", False) else None,
        )

        _project_sale_to_ml_log(sale=sale)

    return sale, False


def _resolve_facility_from_user(*, user, hospital_id=None):
    if is_platform_operator(user, allow_role_fallback=True):
        if not hospital_id:
            raise ValidationError({"hospital_id": "hospital_id is required for platform admin context."})
        from apps.hospitals.models import Hospital  # noqa: PLC0415

        return get_object_or_404(Hospital, id=hospital_id)

    if hasattr(user, "staff") and user.staff and user.staff.hospital_id:
        return user.staff.hospital

    raise PermissionDenied("No hospital context is associated with this account.")


def list_internal_sales_for_user(*, user, hospital_id=None):
    queryset = InternalSale.objects.select_related("facility", "resource_catalog", "sold_by")
    if is_platform_operator(user, allow_role_fallback=True):
        if hospital_id:
            queryset = queryset.filter(facility_id=hospital_id)
        return queryset.order_by("-event_date", "-created_at")

    if hasattr(user, "staff") and user.staff and user.staff.hospital_id:
        return queryset.filter(facility=user.staff.hospital).order_by("-event_date", "-created_at")

    return queryset.none()


def get_internal_sale_for_user(*, user, sale_id):
    queryset = list_internal_sales_for_user(user=user)
    return get_object_or_404(queryset, id=sale_id)


def resolve_sale_facility(*, user, hospital_id=None):
    return _resolve_facility_from_user(user=user, hospital_id=hospital_id)


def list_internal_sale_resource_options(*, facility) -> list[dict]:
    queryset = ResourceCatalog.objects.filter(hospital=facility).select_related("resource_type").order_by("name")

    options: list[dict] = []
    for catalog_item in queryset:
        try:
            available_stock = int(catalog_item.inventory.quantity_available)
        except ResourceInventory.DoesNotExist:
            available_stock = 0

        unit = _normalize_text(catalog_item.unit_of_measure)
        if not unit and catalog_item.resource_type_id:
            unit = _normalize_text(catalog_item.resource_type.unit_of_measure)

        options.append(
            {
                "id": catalog_item.id,
                "resource_name": catalog_item.name,
                "available_stock": available_stock,
                "unit": unit,
            }
        )

    return options


def _has_strict_permission(user, codes: tuple[str, ...]) -> bool:
    return has_any_permission(user, codes, allow_role_fallback=False)


def _ensure_permissions(user, permission_groups: tuple[tuple[str, ...], ...]) -> None:
    missing = []
    for group in permission_groups:
        if _has_strict_permission(user, group):
            continue
        if len(group) == 1:
            missing.append(group[0])
        else:
            missing.append(f"any of ({', '.join(group)})")
    if missing:
        raise PermissionDenied(f"Missing required permission(s): {', '.join(missing)}.")


def _is_discount_policy_active(policy, now_dt) -> bool:
    if policy is None or not policy.is_active:
        return False
    if policy.start_at and policy.start_at > now_dt:
        return False
    if policy.end_at and policy.end_at < now_dt:
        return False
    return True


def _retail_discount_amount(*, inventory: ResourceInventory, quantity: int, unit_price: Decimal) -> Decimal:
    policy = getattr(inventory, "active_discount_policy", None)
    gross_amount = unit_price * Decimal(quantity)
    if not _is_discount_policy_active(policy, timezone.now()):
        return Decimal("0.00")

    if policy.discount_type == policy.DiscountType.PERCENTAGE:
        raw_discount = (gross_amount * Decimal(policy.discount_value or 0)) / Decimal("100")
    else:
        raw_discount = Decimal(policy.discount_value or 0)

    bounded_discount = min(max(raw_discount, Decimal("0.00")), gross_amount)
    return bounded_discount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _ensure_default_retail_batch(inventory: ResourceInventory) -> None:
    if inventory.batches.exists():
        return
    ResourceInventoryBatch.objects.create(
        inventory=inventory,
        batch_number=f"AUTO-{inventory.id}",
        quantity_acquired=max(0, int(inventory.quantity_available or 0)),
        quantity_available_in_batch=max(0, int(inventory.quantity_available or 0)),
        quantity_reserved_in_batch=max(0, int(inventory.reserved_quantity or 0)),
        unit_price_at_acquisition=inventory.price_per_unit,
        currency=inventory.currency,
        acquired_at=timezone.now(),
        source_reference="retail_sale_bootstrap",
    )


def _batch_free_stock(batch: ResourceInventoryBatch) -> int:
    return max(0, int(batch.quantity_available_in_batch or 0) - int(batch.quantity_reserved_in_batch or 0))


def _sync_inventory_from_batches(inventory: ResourceInventory, batches: list[ResourceInventoryBatch]) -> None:
    inventory.quantity_available = max(0, sum(int(batch.quantity_available_in_batch or 0) for batch in batches))
    reserved_quantity = max(0, sum(int(batch.quantity_reserved_in_batch or 0) for batch in batches))
    inventory.reserved_quantity = reserved_quantity
    inventory.quantity_reserved = reserved_quantity
    inventory.save(update_fields=["quantity_available", "reserved_quantity", "quantity_reserved", "updated_at"])


def _assert_retail_invariant(inventory: ResourceInventory, batches: list[ResourceInventoryBatch]) -> None:
    aggregate_free = max(0, int(inventory.quantity_available or 0) - int(inventory.reserved_quantity or 0))
    batch_free = sum(_batch_free_stock(batch) for batch in batches)
    if aggregate_free != batch_free:
        raise ValidationError(
            {
                "detail": "Inventory/batch free-stock invariant violation.",
                "aggregate_free_stock": aggregate_free,
                "batch_free_stock": batch_free,
            }
        )


def _resolve_retail_inventory_for_user(*, user, inventory_id):
    inventory = get_object_or_404(
        ResourceInventory.objects.select_related("catalog_item__hospital", "active_discount_policy"),
        id=inventory_id,
    )

    if is_platform_operator(user, allow_role_fallback=False):
        return inventory

    actor_hospital_id = user_hospital_id(user)
    inventory_hospital_id = inventory.catalog_item.hospital_id
    if not actor_hospital_id or str(actor_hospital_id) != str(inventory_hospital_id):
        raise PermissionDenied("You do not have access to this inventory item.")

    return inventory


def create_retail_sale(
    *,
    user,
    inventory_id,
    quantity: int,
    batch_id=None,
    customer_reference: str = "",
    notes: str = "",
) -> RetailSale:
    _ensure_permissions(
        user,
        (
            RETAIL_SALES_PERMISSION_CREATE_CODES,
            INVENTORY_PERMISSION_VIEW_CODES,
            INVENTORY_PERMISSION_BATCH_VIEW_CODES,
            INVENTORY_PERMISSION_COST_VIEW_CODES,
        ),
    )

    quantity = int(quantity or 0)
    if quantity <= 0:
        raise ValidationError({"quantity": "quantity must be greater than zero."})

    with transaction.atomic():
        inventory = _resolve_retail_inventory_for_user(user=user, inventory_id=inventory_id)
        inventory = ResourceInventory.objects.select_for_update().get(id=inventory.id)

        _ensure_default_retail_batch(inventory)
        batches = list(
            ResourceInventoryBatch.objects.select_for_update()
            .filter(inventory=inventory)
            .order_by("expires_at", "acquired_at")
        )

        selected_batch = None
        remaining = quantity

        if batch_id:
            selected_batch = next((batch for batch in batches if str(batch.id) == str(batch_id)), None)
            if selected_batch is None:
                raise ValidationError({"batch_id": "batch_id does not belong to the selected inventory."})
            free_stock = _batch_free_stock(selected_batch)
            if free_stock < quantity:
                raise ValidationError(
                    {
                        "quantity": (
                            "Insufficient free stock in selected batch. "
                            f"batch_free={free_stock}, requested={quantity}."
                        )
                    }
                )
            selected_batch.quantity_available_in_batch = int(selected_batch.quantity_available_in_batch or 0) - quantity
            selected_batch.save(update_fields=["quantity_available_in_batch", "updated_at"])
            remaining = 0
        else:
            touched_batches = []
            for batch in batches:
                free_stock = _batch_free_stock(batch)
                if free_stock <= 0:
                    continue
                take = min(free_stock, remaining)
                if take <= 0:
                    continue
                batch.quantity_available_in_batch = int(batch.quantity_available_in_batch or 0) - take
                batch.save(update_fields=["quantity_available_in_batch", "updated_at"])
                touched_batches.append(batch)
                remaining -= take
                if remaining <= 0:
                    break

            if remaining > 0:
                raise ValidationError(
                    {
                        "quantity": (
                            "Insufficient free stock for this sale. "
                            f"requested={quantity}, missing={remaining}."
                        )
                    }
                )

            if len(touched_batches) == 1:
                selected_batch = touched_batches[0]

        refreshed_batches = list(
            ResourceInventoryBatch.objects.select_for_update()
            .filter(inventory=inventory)
            .order_by("expires_at", "acquired_at")
        )
        _sync_inventory_from_batches(inventory, refreshed_batches)
        _assert_retail_invariant(inventory, refreshed_batches)

        unit_price = Decimal(inventory.price_per_unit or Decimal("0.00")).quantize(Decimal("0.01"))
        gross_amount = (unit_price * Decimal(quantity)).quantize(Decimal("0.01"))
        discount_amount = _retail_discount_amount(inventory=inventory, quantity=quantity, unit_price=unit_price)
        final_total = max(Decimal("0.00"), gross_amount - discount_amount).quantize(Decimal("0.01"))

        sale = RetailSale.objects.create(
            inventory=inventory,
            batch=selected_batch,
            quantity=quantity,
            unit_selling_price_snapshot=unit_price,
            discount_amount=discount_amount,
            final_total=final_total,
            sold_by=user if getattr(user, "is_authenticated", False) else None,
            customer_reference=str(customer_reference or "").strip(),
            notes=notes or "",
        )

        ResourceTransaction.objects.create(
            inventory=inventory,
            transaction_type=ResourceTransaction.TransactionType.TRANSFER_OUT,
            quantity_delta=-quantity,
            balance_after=inventory.quantity_available,
            reference_id=sale.id,
            notes=f"retail_sale:{sale.id}",
            performed_by=user if getattr(user, "is_authenticated", False) else None,
        )

    return sale


def list_retail_sales_for_user(*, user, hospital_id=None):
    _ensure_permissions(user, (RETAIL_SALES_PERMISSION_HISTORY_CODES,))

    queryset = RetailSale.objects.select_related(
        "inventory",
        "inventory__catalog_item",
        "inventory__catalog_item__hospital",
        "batch",
        "sold_by",
    )

    if is_platform_operator(user, allow_role_fallback=False):
        if hospital_id:
            queryset = queryset.filter(inventory__catalog_item__hospital_id=hospital_id)
        return queryset.order_by("-sold_at", "-id")

    actor_hospital_id = user_hospital_id(user)
    if not actor_hospital_id:
        raise PermissionDenied("No hospital context is associated with this account.")

    return queryset.filter(inventory__catalog_item__hospital_id=actor_hospital_id).order_by("-sold_at", "-id")


def get_retail_sale_for_user(*, user, sale_id):
    queryset = list_retail_sales_for_user(user=user)
    return get_object_or_404(queryset, id=sale_id)
