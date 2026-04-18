"""Inventory module services and built-in gateway implementation."""
import csv
import hashlib
import io
import logging
import uuid as uuid_lib
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import NotFound, ValidationError

from apps.hospitals.models import Hospital
from apps.resources.models import (
    DiscountPolicy,
    ResourceCatalog,
    ResourceInventory,
    ResourceInventoryBatch,
    ResourceTransaction,
    ResourceType,
)
from apps.resources.services import release_reservation, reserve_inventory

from .models import InventoryImportError, InventoryImportJob
from .ports import InventoryMutationPort, InventoryReadPort, InventoryReservationPort

logger = logging.getLogger("hrsp.inventory_module")


def _safe_parse_int(value, *, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValidationError({field_name: f"{field_name} must be an integer."})
    if parsed < 0:
        raise ValidationError({field_name: f"{field_name} must be non-negative."})
    return parsed


def _safe_parse_decimal(value, *, field_name: str, allow_blank: bool = True) -> Decimal | None:
    text = "" if value is None else str(value).strip()
    if not text:
        return None if allow_blank else Decimal("0")
    try:
        parsed = Decimal(text)
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({field_name: f"{field_name} must be a valid decimal."})
    if parsed < 0:
        raise ValidationError({field_name: f"{field_name} must be non-negative."})
    return parsed


def _safe_parse_date(value, *, field_name: str) -> date | None:
    text = "" if value is None else str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise ValidationError({field_name: f"{field_name} must be ISO date format YYYY-MM-DD."})


def _safe_parse_datetime(value, *, field_name: str) -> datetime | None:
    text = "" if value is None else str(value).strip()
    if not text:
        return None

    parsed_dt = parse_datetime(text)
    if parsed_dt is not None:
        if timezone.is_naive(parsed_dt):
            return timezone.make_aware(parsed_dt)
        return parsed_dt

    parsed_date = parse_date(text)
    if parsed_date is not None:
        return _to_aware_midnight(parsed_date)

    raise ValidationError({field_name: f"{field_name} must be ISO datetime/date format."})


def _to_aware_midnight(value: date | None):
    if value is None:
        return None
    dt = datetime.combine(value, time.min)
    if timezone.is_naive(dt):
        return timezone.make_aware(dt)
    return dt


def _normalize_name(value: str) -> str:
    return " ".join((value or "").strip().split())


def _effective_reserved_quantity(inventory: ResourceInventory) -> int:
    return max(int(inventory.reserved_quantity or 0), int(inventory.quantity_reserved or 0))


def _resolve_resource_type(row: dict) -> ResourceType:
    resource_type_name = _normalize_name(str(row.get("resource_type") or "Medication")) or "Medication"
    unit = _normalize_name(str(row.get("unit") or "units"))
    resource_type, _ = ResourceType.objects.get_or_create(
        name=resource_type_name,
        defaults={"unit_of_measure": unit},
    )
    if unit and not resource_type.unit_of_measure:
        resource_type.unit_of_measure = unit
        resource_type.save(update_fields=["unit_of_measure", "updated_at"])
    return resource_type


def _get_or_create_catalog_item(facility: Hospital, row: dict) -> ResourceCatalog:
    resource_type = _resolve_resource_type(row)
    name = _normalize_name(str(row["name"]))
    unit = _normalize_name(str(row.get("unit") or "units"))
    catalog_item, _ = ResourceCatalog.objects.get_or_create(
        hospital=facility,
        resource_type=resource_type,
        name=name,
        defaults={
            "unit_of_measure": unit,
            "description": _normalize_name(str(row.get("description") or "")),
        },
    )

    changed_fields = []
    if unit and catalog_item.unit_of_measure != unit:
        catalog_item.unit_of_measure = unit
        changed_fields.append("unit_of_measure")
    if changed_fields:
        catalog_item.save(update_fields=changed_fields + ["updated_at"])

    return catalog_item


def _upsert_batch_metadata(inventory: ResourceInventory, row: dict) -> None:
    manufacturer = _normalize_name(str(row.get("manufacturer") or ""))
    batch_number = _normalize_name(str(row.get("batch_number") or ""))
    expiry = row.get("expiry_date")
    unit_price = row.get("price")

    if not any([manufacturer, batch_number, expiry, unit_price is not None]):
        return

    if not batch_number:
        batch_number = f"AUTO-{inventory.id}"

    defaults = {
        "quantity_acquired": max(0, inventory.quantity_available),
        "quantity_available_in_batch": max(0, inventory.quantity_available),
        "quantity_reserved_in_batch": max(0, inventory.reserved_quantity),
        "unit_price_at_acquisition": unit_price if unit_price is not None else inventory.price_per_unit,
        "currency": inventory.currency,
        "manufacturer": manufacturer,
        "acquired_at": timezone.now(),
        "expires_at": _to_aware_midnight(expiry),
        "source_reference": "inventory_module_import",
    }

    ResourceInventoryBatch.objects.update_or_create(
        inventory=inventory,
        batch_number=batch_number,
        defaults=defaults,
    )


def _update_inventory_last_sync_source(facility: Hospital, source: str) -> None:
    facility.inventory_last_sync_source = source
    facility.save(update_fields=["inventory_last_sync_source", "updated_at"])


def _get_inventory_for_item_ref(facility_id, item_ref) -> ResourceInventory:
    qs = ResourceInventory.objects.select_related("catalog_item", "catalog_item__resource_type").filter(
        catalog_item__hospital_id=facility_id
    )
    text_ref = str(item_ref).strip()

    try:
        item_uuid = uuid_lib.UUID(text_ref)
        inventory = qs.filter(catalog_item_id=item_uuid).first()
        if inventory:
            return inventory
    except (ValueError, TypeError):
        pass

    inventory = qs.filter(catalog_item__name__iexact=text_ref).first()
    if inventory:
        return inventory

    raise NotFound("Inventory item not found for this facility.")


def parse_inventory_csv(file_bytes: bytes) -> dict:
    file_hash = hashlib.sha256(file_bytes or b"").hexdigest()
    if not file_bytes:
        return {
            "file_hash": file_hash,
            "total_rows": 0,
            "rows": [],
            "errors": [
                {
                    "row_number": 0,
                    "field_name": "file",
                    "error_code": "empty_file",
                    "error_message": "CSV file is empty.",
                    "raw_row": {},
                }
            ],
        }

    decoded = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(decoded))

    fieldnames = [str(name).strip().lower() for name in (reader.fieldnames or []) if name is not None]
    required_fields = {"name", "quantity"}
    missing = sorted(required_fields - set(fieldnames))

    errors = []
    if missing:
        errors.append(
            {
                "row_number": 0,
                "field_name": "headers",
                "error_code": "missing_required_headers",
                "error_message": f"Missing required CSV headers: {', '.join(missing)}",
                "raw_row": {"headers": fieldnames},
            }
        )

    rows = []
    seen_keys = set()

    for row_number, raw_row in enumerate(reader, start=2):
        normalized_row = {
            str(key).strip().lower(): (value.strip() if isinstance(value, str) else value)
            for key, value in (raw_row or {}).items()
            if key is not None
        }

        row_errors = []
        name = _normalize_name(str(normalized_row.get("name") or ""))
        if not name:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "name",
                    "error_code": "required",
                    "error_message": "name is required.",
                    "raw_row": normalized_row,
                }
            )

        try:
            quantity = _safe_parse_int(normalized_row.get("quantity"), field_name="quantity")
            if quantity <= 0:
                raise ValidationError({"quantity": "quantity must be greater than zero for restock import."})
        except ValidationError as exc:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "quantity",
                    "error_code": "invalid_quantity",
                    "error_message": str(exc.detail),
                    "raw_row": normalized_row,
                }
            )
            quantity = None

        try:
            price = _safe_parse_decimal(normalized_row.get("price"), field_name="price")
        except ValidationError as exc:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "price",
                    "error_code": "invalid_price",
                    "error_message": str(exc.detail),
                    "raw_row": normalized_row,
                }
            )
            price = None

        try:
            expiry_date = _safe_parse_date(normalized_row.get("expiry_date"), field_name="expiry_date")
        except ValidationError as exc:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "expiry_date",
                    "error_code": "invalid_expiry_date",
                    "error_message": str(exc.detail),
                    "raw_row": normalized_row,
                }
            )
            expiry_date = None

        manufacturer = _normalize_name(str(normalized_row.get("manufacturer") or ""))
        batch_number = _normalize_name(str(normalized_row.get("batch_number") or ""))
        dedup_key = (name.lower(), manufacturer.lower(), batch_number.lower())

        if name and dedup_key in seen_keys:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "name",
                    "error_code": "duplicate_row",
                    "error_message": "Duplicate medicine row in uploaded CSV.",
                    "raw_row": normalized_row,
                }
            )

        if row_errors:
            errors.extend(row_errors)
            continue

        seen_keys.add(dedup_key)
        rows.append(
            {
                "name": name,
                "quantity": quantity,
                "price": price,
                "expiry_date": expiry_date,
                "manufacturer": manufacturer,
                "batch_number": batch_number,
                "unit": _normalize_name(str(normalized_row.get("unit") or "units")),
                "resource_type": _normalize_name(str(normalized_row.get("resource_type") or "Medication")),
                "currency": _normalize_name(str(normalized_row.get("currency") or "BDT")),
                "description": _normalize_name(str(normalized_row.get("description") or "")),
            }
        )

    return {
        "file_hash": file_hash,
        "total_rows": len(rows) + len([e for e in errors if e.get("row_number", 0) > 0]),
        "rows": rows,
        "errors": errors,
    }


def extract_csv_sample_rows(file_bytes: bytes, *, limit: int = 5) -> list[dict]:
    """Extract a small number of normalized CSV rows for chat context preview."""
    if not file_bytes:
        return []

    decoded = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(decoded))

    max_rows = max(1, int(limit or 1))
    sample_rows = []
    for raw_row in reader:
        normalized_row = {
            str(key).strip().lower(): (value.strip() if isinstance(value, str) else value)
            for key, value in (raw_row or {}).items()
            if key is not None
        }
        sample_rows.append(normalized_row)
        if len(sample_rows) >= max_rows:
            break

    return sample_rows


def _create_row_transaction(
    *,
    inventory: ResourceInventory,
    quantity_delta: int,
    actor,
    notes: str,
    transaction_type: str = ResourceTransaction.TransactionType.ADJUSTMENT,
) -> None:
    if quantity_delta == 0:
        return

    ResourceTransaction.objects.create(
        inventory=inventory,
        transaction_type=transaction_type,
        quantity_delta=quantity_delta,
        balance_after=inventory.quantity_available,
        notes=notes,
        performed_by=actor,
    )


def _append_restock_batch_update(*, inventory: ResourceInventory, row: dict, restock_amount: int) -> None:
    batch_number = _normalize_name(str(row.get("batch_number") or "")) or f"AUTO-{inventory.id}"
    existing_batch = (
        ResourceInventoryBatch.objects.select_for_update()
        .filter(inventory=inventory, batch_number=batch_number)
        .first()
    )

    if existing_batch is not None:
        existing_batch.quantity_acquired = int(existing_batch.quantity_acquired or 0) + restock_amount
        existing_batch.quantity_available_in_batch = int(existing_batch.quantity_available_in_batch or 0) + restock_amount
        existing_batch.save(update_fields=["quantity_acquired", "quantity_available_in_batch", "updated_at"])
        return

    unit_price = row.get("price") if row.get("price") is not None else inventory.price_per_unit
    manufacturer = _normalize_name(str(row.get("manufacturer") or ""))

    ResourceInventoryBatch.objects.create(
        inventory=inventory,
        batch_number=batch_number,
        quantity_acquired=restock_amount,
        quantity_available_in_batch=restock_amount,
        quantity_reserved_in_batch=0,
        unit_price_at_acquisition=unit_price,
        currency=inventory.currency,
        manufacturer=manufacturer,
        acquired_at=timezone.now(),
        expires_at=_to_aware_midnight(row.get("expiry_date")),
        source_reference="inventory_csv_restock",
    )


def _apply_row_restock_append(
    *,
    facility: Hospital,
    row: dict,
    actor,
) -> None:
    catalog_item = _get_or_create_catalog_item(facility, row)
    defaults = {
        "quantity_available": 0,
        "quantity_reserved": 0,
        "reserved_quantity": 0,
        "price_per_unit": row.get("price") if row.get("price") is not None else Decimal("0.00"),
        "currency": row.get("currency") or "BDT",
        "expiry_date": row.get("expiry_date"),
    }
    inventory, _ = ResourceInventory.objects.get_or_create(catalog_item=catalog_item, defaults=defaults)
    inventory = ResourceInventory.objects.select_for_update().get(pk=inventory.pk)

    restock_amount = int(row["quantity"])
    if restock_amount <= 0:
        raise ValidationError({"quantity": "quantity must be greater than zero for restock import."})

    inventory.quantity_available = int(inventory.quantity_available or 0) + restock_amount
    inventory.last_restocked_at = timezone.now()
    inventory.save(update_fields=["quantity_available", "last_restocked_at", "updated_at"])

    _create_row_transaction(
        inventory=inventory,
        quantity_delta=restock_amount,
        actor=actor,
        notes="csv_import:restock",
        transaction_type=ResourceTransaction.TransactionType.RESTOCK,
    )
    _append_restock_batch_update(inventory=inventory, row=row, restock_amount=restock_amount)


def _apply_row_quantity_update(
    *,
    facility: Hospital,
    row: dict,
    actor,
    mode: str,
) -> None:
    catalog_item = _get_or_create_catalog_item(facility, row)
    defaults = {
        "quantity_available": 0,
        "quantity_reserved": 0,
        "reserved_quantity": 0,
        "price_per_unit": row.get("price") if row.get("price") is not None else Decimal("0.00"),
        "currency": row.get("currency") or "BDT",
        "expiry_date": row.get("expiry_date"),
    }
    inventory, _ = ResourceInventory.objects.get_or_create(catalog_item=catalog_item, defaults=defaults)
    inventory = ResourceInventory.objects.select_for_update().get(pk=inventory.pk)

    effective_reserved_quantity = _effective_reserved_quantity(inventory)
    if inventory.reserved_quantity != effective_reserved_quantity:
        inventory.reserved_quantity = effective_reserved_quantity
    if inventory.quantity_reserved != effective_reserved_quantity:
        inventory.quantity_reserved = effective_reserved_quantity

    new_quantity = int(row["quantity"])
    if new_quantity < effective_reserved_quantity:
        raise ValidationError(
            {
                "quantity": (
                    f"Quantity {new_quantity} is below reserved quantity {effective_reserved_quantity} "
                    f"for item '{catalog_item.name}'."
                )
            }
        )

    old_quantity = inventory.quantity_available
    inventory.quantity_available = new_quantity
    inventory.last_restocked_at = timezone.now()

    update_fields = ["quantity_available", "reserved_quantity", "quantity_reserved", "last_restocked_at", "updated_at"]
    if row.get("price") is not None and inventory.price_per_unit != row["price"]:
        inventory.price_per_unit = row["price"]
        update_fields.append("price_per_unit")
    if row.get("currency") and inventory.currency != row["currency"]:
        inventory.currency = row["currency"]
        update_fields.append("currency")
    if row.get("expiry_date") is not None:
        inventory.expiry_date = row["expiry_date"]
        update_fields.append("expiry_date")

    inventory.save(update_fields=list(dict.fromkeys(update_fields)))

    _create_row_transaction(
        inventory=inventory,
        quantity_delta=new_quantity - old_quantity,
        actor=actor,
        notes=f"csv_import:{mode.lower()}",
    )
    _upsert_batch_metadata(inventory, row)


def commit_inventory_csv_import(
    *,
    facility: Hospital,
    file_bytes: bytes,
    mode: str,
    confirm_full_replace: bool,
    idempotency_key: str,
    actor,
) -> tuple[InventoryImportJob, bool]:
    if mode != InventoryImportJob.Mode.MERGE or confirm_full_replace:
        raise ValidationError({"detail": "CSV edit mode is not allowed. Use restock import only."})

    parsed = parse_inventory_csv(file_bytes)
    file_hash = parsed["file_hash"]

    existing = InventoryImportJob.objects.filter(facility=facility, file_hash=file_hash).first()
    if existing:
        return existing, True

    job = InventoryImportJob.objects.create(
        facility=facility,
        mode=InventoryImportJob.Mode.MERGE,
        file_hash=file_hash,
        idempotency_key=(idempotency_key or "")[:128],
        confirm_full_replace=False,
        status=InventoryImportJob.Status.APPLYING,
        total_rows=parsed["total_rows"],
        requested_by=actor if getattr(actor, "is_authenticated", False) else None,
    )

    import_errors = list(parsed["errors"])
    applied_rows = 0

    with transaction.atomic():
        for index, row in enumerate(parsed["rows"], start=2):
            try:
                _apply_row_restock_append(facility=facility, row=row, actor=actor)
                applied_rows += 1
            except ValidationError as exc:
                import_errors.append(
                    {
                        "row_number": index,
                        "field_name": "quantity",
                        "error_code": "restock_apply_failed",
                        "error_message": str(exc.detail),
                        "raw_row": row,
                    }
                )

        error_instances = [
            InventoryImportError(
                import_job=job,
                row_number=max(0, int(err.get("row_number") or 0)),
                field_name=str(err.get("field_name") or "")[:80],
                error_code=str(err.get("error_code") or "validation_error")[:80],
                error_message=str(err.get("error_message") or "validation error"),
                raw_row=err.get("raw_row") or {},
            )
            for err in import_errors
        ]
        if error_instances:
            InventoryImportError.objects.bulk_create(error_instances, batch_size=500)

        status_value = (
            InventoryImportJob.Status.PARTIALLY_APPLIED
            if import_errors and applied_rows > 0
            else InventoryImportJob.Status.FAILED
            if import_errors and applied_rows == 0
            else InventoryImportJob.Status.APPLIED
        )

        job.status = status_value
        job.applied_rows = applied_rows
        job.error_rows = len(import_errors)
        job.summary = {
            "mode": InventoryImportJob.Mode.MERGE,
            "applied_rows": applied_rows,
            "error_rows": len(import_errors),
            "idempotency_scope": "facility+file_hash",
            "write_policy": "append_only_restock",
        }
        job.save(update_fields=["status", "applied_rows", "error_rows", "summary", "updated_at"])

        _update_inventory_last_sync_source(facility, "csv_import")

    logger.info(
        "CSV import committed for facility %s job=%s status=%s applied=%s errors=%s",
        facility.id,
        job.id,
        job.status,
        job.applied_rows,
        job.error_rows,
    )
    return job, False


def parse_inventory_discount_csv(file_bytes: bytes) -> dict:
    file_hash = hashlib.sha256(file_bytes or b"").hexdigest()
    if not file_bytes:
        return {
            "file_hash": file_hash,
            "total_rows": 0,
            "rows": [],
            "errors": [
                {
                    "row_number": 0,
                    "field_name": "file",
                    "error_code": "empty_file",
                    "error_message": "CSV file is empty.",
                    "raw_row": {},
                }
            ],
        }

    decoded = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(decoded))
    fieldnames = [str(name).strip().lower() for name in (reader.fieldnames or []) if name is not None]

    required_fields = {"inventory_name", "discount_type", "discount_value"}
    missing = sorted(required_fields - set(fieldnames))

    errors = []
    if missing:
        errors.append(
            {
                "row_number": 0,
                "field_name": "headers",
                "error_code": "missing_required_headers",
                "error_message": f"Missing required CSV headers: {', '.join(missing)}",
                "raw_row": {"headers": fieldnames},
            }
        )

    rows = []
    for row_number, raw_row in enumerate(reader, start=2):
        normalized_row = {
            str(key).strip().lower(): (value.strip() if isinstance(value, str) else value)
            for key, value in (raw_row or {}).items()
            if key is not None
        }

        row_errors = []
        inventory_name = _normalize_name(str(normalized_row.get("inventory_name") or ""))
        if not inventory_name:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "inventory_name",
                    "error_code": "required",
                    "error_message": "inventory_name is required.",
                    "raw_row": normalized_row,
                }
            )

        discount_type = _normalize_name(str(normalized_row.get("discount_type") or "")).lower()
        if discount_type not in {
            DiscountPolicy.DiscountType.PERCENTAGE,
            DiscountPolicy.DiscountType.FIXED,
        }:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "discount_type",
                    "error_code": "invalid_discount_type",
                    "error_message": "discount_type must be 'percentage' or 'fixed'.",
                    "raw_row": normalized_row,
                }
            )

        try:
            discount_value = _safe_parse_decimal(
                normalized_row.get("discount_value"),
                field_name="discount_value",
            )
            if discount_value is None:
                raise ValidationError({"discount_value": "discount_value is required."})
            if discount_type == DiscountPolicy.DiscountType.PERCENTAGE and discount_value > Decimal("100.00"):
                raise ValidationError({"discount_value": "percentage discount cannot exceed 100."})
        except ValidationError as exc:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "discount_value",
                    "error_code": "invalid_discount_value",
                    "error_message": str(exc.detail),
                    "raw_row": normalized_row,
                }
            )
            discount_value = None

        try:
            start_at = _safe_parse_datetime(normalized_row.get("start_at"), field_name="start_at")
        except ValidationError as exc:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "start_at",
                    "error_code": "invalid_start_at",
                    "error_message": str(exc.detail),
                    "raw_row": normalized_row,
                }
            )
            start_at = None

        try:
            end_at = _safe_parse_datetime(normalized_row.get("end_at"), field_name="end_at")
        except ValidationError as exc:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "end_at",
                    "error_code": "invalid_end_at",
                    "error_message": str(exc.detail),
                    "raw_row": normalized_row,
                }
            )
            end_at = None

        if start_at and end_at and end_at < start_at:
            row_errors.append(
                {
                    "row_number": row_number,
                    "field_name": "end_at",
                    "error_code": "invalid_window",
                    "error_message": "end_at must be greater than or equal to start_at.",
                    "raw_row": normalized_row,
                }
            )

        if row_errors:
            errors.extend(row_errors)
            continue

        rows.append(
            {
                "inventory_name": inventory_name,
                "discount_type": discount_type,
                "discount_value": discount_value,
                "start_at": start_at,
                "end_at": end_at,
            }
        )

    return {
        "file_hash": file_hash,
        "total_rows": len(rows) + len([e for e in errors if e.get("row_number", 0) > 0]),
        "rows": rows,
        "errors": errors,
    }


def _upsert_inventory_discount_policy(*, inventory: ResourceInventory, row: dict, actor) -> DiscountPolicy:
    marker = f"csv_discount_import:inventory={inventory.id}"
    active_policy = inventory.active_discount_policy

    target_policy = None
    if (
        active_policy is not None
        and active_policy.applies_to_scope == DiscountPolicy.AppliesToScope.INVENTORY
        and marker in str(active_policy.description or "")
    ):
        target_policy = active_policy

    if target_policy is None:
        target_policy = DiscountPolicy.objects.create(
            name=f"CSV Discount - {inventory.catalog_item.name}",
            discount_type=row["discount_type"],
            discount_value=row["discount_value"],
            is_active=True,
            start_at=row.get("start_at"),
            end_at=row.get("end_at"),
            applies_to_scope=DiscountPolicy.AppliesToScope.INVENTORY,
            description=marker,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        return target_policy

    target_policy.discount_type = row["discount_type"]
    target_policy.discount_value = row["discount_value"]
    target_policy.is_active = True
    target_policy.start_at = row.get("start_at")
    target_policy.end_at = row.get("end_at")
    target_policy.applies_to_scope = DiscountPolicy.AppliesToScope.INVENTORY
    target_policy.description = marker
    target_policy.save(
        update_fields=[
            "discount_type",
            "discount_value",
            "is_active",
            "start_at",
            "end_at",
            "applies_to_scope",
            "description",
            "updated_at",
        ]
    )
    return target_policy


def commit_inventory_discount_csv_import(
    *,
    facility: Hospital,
    file_bytes: bytes,
    actor,
) -> dict:
    parsed = parse_inventory_discount_csv(file_bytes)
    import_errors = list(parsed["errors"])
    applied_rows = 0

    with transaction.atomic():
        for index, row in enumerate(parsed["rows"], start=2):
            try:
                inventory = (
                    ResourceInventory.objects.select_for_update()
                    .select_related("catalog_item")
                    .filter(
                        catalog_item__hospital=facility,
                        catalog_item__name__iexact=row["inventory_name"],
                    )
                    .first()
                )
                if inventory is None:
                    raise ValidationError({"inventory_name": "inventory_name was not found in this hospital."})

                policy = _upsert_inventory_discount_policy(inventory=inventory, row=row, actor=actor)
                if inventory.active_discount_policy_id != policy.id:
                    inventory.active_discount_policy = policy
                    inventory.save(update_fields=["active_discount_policy", "updated_at"])
                applied_rows += 1
            except ValidationError as exc:
                import_errors.append(
                    {
                        "row_number": index,
                        "field_name": "inventory_name",
                        "error_code": "discount_apply_failed",
                        "error_message": str(exc.detail),
                        "raw_row": row,
                    }
                )

    status_value = (
        InventoryImportJob.Status.PARTIALLY_APPLIED
        if import_errors and applied_rows > 0
        else InventoryImportJob.Status.FAILED
        if import_errors and applied_rows == 0
        else InventoryImportJob.Status.APPLIED
    )

    return {
        "file_hash": parsed["file_hash"],
        "total_rows": parsed["total_rows"],
        "applied_rows": applied_rows,
        "error_rows": len(import_errors),
        "row_errors": import_errors,
        "status": status_value,
        "write_policy": "discount_only_no_stock_mutation",
    }


def import_job_snapshot(job: InventoryImportJob) -> dict:
    return {
        "id": str(job.id),
        "facility_id": str(job.facility_id),
        "source_type": job.source_type,
        "mode": job.mode,
        "file_hash": job.file_hash,
        "status": job.status,
        "total_rows": job.total_rows,
        "applied_rows": job.applied_rows,
        "error_rows": job.error_rows,
        "summary": job.summary,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


class BuiltInInventoryGateway(InventoryReadPort, InventoryReservationPort, InventoryMutationPort):
    """Built-in inventory provider backed by existing resources models."""

    def get_available_inventory(self, facility_id, item_ref, include_reserved: bool = False) -> dict:
        inventory = _get_inventory_for_item_ref(facility_id, item_ref)
        effective_reserved_quantity = _effective_reserved_quantity(inventory)
        payload = {
            "facility_id": str(facility_id),
            "item_ref": str(item_ref),
            "quantity_available": inventory.quantity_available,
            "quantity_reserved": effective_reserved_quantity,
            "quantity_free": inventory.quantity_free,
            "price_per_unit": str(inventory.price_per_unit),
            "currency": inventory.currency,
            "as_of": inventory.updated_at,
        }
        if include_reserved:
            payload["reserved_quantity"] = effective_reserved_quantity
        return payload

    def get_item_snapshot(self, facility_id, item_ref) -> dict | None:
        try:
            inventory = _get_inventory_for_item_ref(facility_id, item_ref)
        except NotFound:
            return None

        effective_reserved_quantity = _effective_reserved_quantity(inventory)

        return {
            "inventory_id": str(inventory.id),
            "catalog_item_id": str(inventory.catalog_item_id),
            "name": inventory.catalog_item.name,
            "resource_type": inventory.catalog_item.resource_type.name,
            "quantity_available": inventory.quantity_available,
            "quantity_reserved": effective_reserved_quantity,
            "quantity_free": inventory.quantity_free,
            "price_per_unit": str(inventory.price_per_unit),
            "currency": inventory.currency,
            "updated_at": inventory.updated_at,
        }

    def reserve_stock(
        self,
        request_id,
        facility_id,
        item_ref,
        quantity: int,
        idempotency_key: str = "",
    ) -> dict:
        inventory = _get_inventory_for_item_ref(facility_id, item_ref)
        reserve_inventory(inventory, quantity)
        inventory.refresh_from_db()
        return {
            "request_id": str(request_id),
            "inventory_id": str(inventory.id),
            "reserved_quantity": inventory.reserved_quantity,
            "idempotency_key": idempotency_key,
        }

    def release_stock(self, request_id, facility_id, item_ref, quantity: int, reason: str = "") -> dict:
        inventory = _get_inventory_for_item_ref(facility_id, item_ref)
        release_reservation(inventory, quantity)
        inventory.refresh_from_db()
        return {
            "request_id": str(request_id),
            "inventory_id": str(inventory.id),
            "reserved_quantity": inventory.reserved_quantity,
            "reason": reason,
        }

    def confirm_transfer(
        self,
        request_id,
        source_facility_id,
        target_facility_id,
        item_ref,
        quantity: int,
        actor=None,
    ) -> dict:
        if quantity <= 0:
            raise ValidationError({"quantity": "quantity must be greater than zero."})

        with transaction.atomic():
            source_inventory = _get_inventory_for_item_ref(source_facility_id, item_ref)
            source_inventory = ResourceInventory.objects.select_for_update().select_related("catalog_item").get(
                pk=source_inventory.pk
            )

            effective_reserved_quantity = _effective_reserved_quantity(source_inventory)

            if source_inventory.quantity_available < quantity:
                raise ValidationError(
                    {
                        "quantity": (
                            f"Insufficient source stock. available={source_inventory.quantity_available}, "
                            f"requested={quantity}"
                        )
                    }
                )

            if effective_reserved_quantity < quantity:
                raise ValidationError(
                    {
                        "quantity": (
                            f"Insufficient reserved stock. reserved={effective_reserved_quantity}, "
                            f"requested={quantity}"
                        )
                    }
                )

            source_inventory.quantity_available -= quantity
            next_reserved_quantity = max(0, effective_reserved_quantity - quantity)
            source_inventory.reserved_quantity = next_reserved_quantity
            source_inventory.quantity_reserved = next_reserved_quantity
            source_inventory.save(
                update_fields=["quantity_available", "reserved_quantity", "quantity_reserved", "updated_at"]
            )
            ResourceTransaction.objects.create(
                inventory=source_inventory,
                transaction_type=ResourceTransaction.TransactionType.TRANSFER_OUT,
                quantity_delta=-quantity,
                balance_after=source_inventory.quantity_available,
                reference_id=request_id,
                notes="inventory_gateway_transfer_out",
                performed_by=actor,
            )

            catalog_item = source_inventory.catalog_item
            target_catalog, _ = ResourceCatalog.objects.get_or_create(
                hospital_id=target_facility_id,
                resource_type=catalog_item.resource_type,
                name=catalog_item.name,
                defaults={
                    "unit_of_measure": catalog_item.unit_of_measure,
                    "description": catalog_item.description,
                },
            )
            target_inventory, _ = ResourceInventory.objects.get_or_create(
                catalog_item=target_catalog,
                defaults={
                    "quantity_available": 0,
                    "price_per_unit": source_inventory.price_per_unit,
                    "currency": source_inventory.currency,
                },
            )
            target_inventory = ResourceInventory.objects.select_for_update().get(pk=target_inventory.pk)
            target_inventory.quantity_available += quantity
            target_inventory.save(update_fields=["quantity_available", "updated_at"])
            ResourceTransaction.objects.create(
                inventory=target_inventory,
                transaction_type=ResourceTransaction.TransactionType.TRANSFER_IN,
                quantity_delta=quantity,
                balance_after=target_inventory.quantity_available,
                reference_id=request_id,
                notes="inventory_gateway_transfer_in",
                performed_by=actor,
            )

        return {
            "request_id": str(request_id),
            "quantity_transferred": quantity,
            "source_inventory_id": str(source_inventory.id),
            "target_inventory_id": str(target_inventory.id),
        }

    def apply_inventory_update(
        self,
        facility_id,
        source: str,
        operations: list[dict],
        mode: str,
        metadata: dict | None = None,
        actor=None,
    ) -> dict:
        facility = Hospital.objects.get(id=facility_id)
        applied = 0
        errors = []

        with transaction.atomic():
            for index, op in enumerate(operations, start=1):
                try:
                    _apply_row_quantity_update(
                        facility=facility,
                        row={
                            "name": _normalize_name(str(op.get("name") or "")),
                            "quantity": _safe_parse_int(op.get("quantity"), field_name="quantity"),
                            "price": _safe_parse_decimal(op.get("price"), field_name="price"),
                            "expiry_date": _safe_parse_date(op.get("expiry_date"), field_name="expiry_date"),
                            "manufacturer": _normalize_name(str(op.get("manufacturer") or "")),
                            "batch_number": _normalize_name(str(op.get("batch_number") or "")),
                            "unit": _normalize_name(str(op.get("unit") or "units")),
                            "resource_type": _normalize_name(str(op.get("resource_type") or "Medication")),
                            "currency": _normalize_name(str(op.get("currency") or "BDT")),
                            "description": _normalize_name(str(op.get("description") or "")),
                        },
                        actor=actor,
                        mode=mode,
                    )
                    applied += 1
                except ValidationError as exc:
                    errors.append({"row_number": index, "error": str(exc.detail), "raw_row": op})

        _update_inventory_last_sync_source(facility, source)
        return {
            "facility_id": str(facility.id),
            "source": source,
            "mode": mode,
            "applied_rows": applied,
            "error_rows": len(errors),
            "errors": errors,
            "metadata": metadata or {},
        }

    def quick_update(self, facility_id, name: str, quantity: int, price=None, actor=None) -> dict:
        if not name:
            raise ValidationError({"name": "name is required."})
        if quantity < 0:
            raise ValidationError({"quantity": "quantity must be non-negative."})

        facility = Hospital.objects.get(id=facility_id)
        row = {
            "name": _normalize_name(name),
            "quantity": quantity,
            "price": _safe_parse_decimal(price, field_name="price") if price is not None else None,
            "expiry_date": None,
            "manufacturer": "",
            "batch_number": "",
            "unit": "units",
            "resource_type": "Medication",
            "currency": "BDT",
            "description": "",
        }

        with transaction.atomic():
            catalog_item = _get_or_create_catalog_item(facility, row)
            inventory, created = ResourceInventory.objects.get_or_create(
                catalog_item=catalog_item,
                defaults={
                    "quantity_available": 0,
                    "price_per_unit": row["price"] if row["price"] is not None else Decimal("0.00"),
                    "currency": "BDT",
                },
            )
            inventory = ResourceInventory.objects.select_for_update().get(pk=inventory.pk)

            effective_reserved_quantity = _effective_reserved_quantity(inventory)
            if inventory.reserved_quantity != effective_reserved_quantity:
                inventory.reserved_quantity = effective_reserved_quantity
            if inventory.quantity_reserved != effective_reserved_quantity:
                inventory.quantity_reserved = effective_reserved_quantity

            if quantity < effective_reserved_quantity:
                raise ValidationError(
                    {
                        "quantity": (
                            f"quantity ({quantity}) cannot be below reserved quantity "
                            f"({effective_reserved_quantity})."
                        )
                    }
                )

            old_quantity = inventory.quantity_available
            inventory.quantity_available = quantity
            if row["price"] is not None:
                inventory.price_per_unit = row["price"]
            inventory.last_restocked_at = timezone.now()
            inventory.save(
                update_fields=[
                    "quantity_available",
                    "reserved_quantity",
                    "quantity_reserved",
                    "price_per_unit",
                    "last_restocked_at",
                    "updated_at",
                ]
            )

            _create_row_transaction(
                inventory=inventory,
                quantity_delta=quantity - old_quantity,
                actor=actor,
                notes="quick_update",
            )

            _update_inventory_last_sync_source(facility, "dashboard_quick_update")

        return {
            "created": created,
            "inventory_id": str(inventory.id),
            "catalog_item_id": str(catalog_item.id),
            "name": catalog_item.name,
            "quantity_available": inventory.quantity_available,
            "quantity_reserved": inventory.reserved_quantity,
            "quantity_free": inventory.quantity_free,
            "price_per_unit": str(inventory.price_per_unit),
            "currency": inventory.currency,
            "updated_at": inventory.updated_at,
        }


_GATEWAY = BuiltInInventoryGateway()


def get_inventory_gateway(facility=None) -> BuiltInInventoryGateway:
    # Transitional seam: evaluate configured source strategy now, keep built-in provider active
    # until non-dashboard providers implement reservation/mutation contracts.
    if facility is not None:
        from .source_resolver import InventorySourceResolver

        InventorySourceResolver.resolve(facility)
    return _GATEWAY
