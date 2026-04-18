"""Services for pharmacy sales/staff/movement CSV ingestion."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

from apps.ml.models import MLDispenseLog
from apps.resources.models import ResourceCatalog, ResourceInventory, ResourceTransaction, ResourceType
from apps.staff.models import Role, Staff

from .models import (
    PharmacyCSVImportConflict,
    PharmacyCSVImportError,
    PharmacyCSVImportJob,
    PharmacyCSVRowVersion,
    PharmacyCSVValidationContext,
)

logger = logging.getLogger("hrsp.pharmacy_csv")

DATASET_SALES = PharmacyCSVImportJob.DatasetType.SALES
DATASET_STAFF = PharmacyCSVImportJob.DatasetType.STAFF
DATASET_MOVEMENT = PharmacyCSVImportJob.DatasetType.MOVEMENT

SCHEMA_HINTS = {
    DATASET_SALES: ["date", "medicine_name", "quantity_sold", "external_event_id(optional)"],
    DATASET_STAFF: [
        "first_name",
        "last_name(optional)",
        "employee_id(optional)",
        "email(optional)",
        "department(optional)",
        "position(optional)",
        "employment_status(optional)",
        "role(optional)",
        "effective_date(optional)",
    ],
    DATASET_MOVEMENT: [
        "medicine_name",
        "quantity",
        "movement_type(optional)",
        "mode(optional: DELTA|ABSOLUTE)",
        "event_date(optional)",
        "external_event_id(optional)",
        "notes(optional)",
    ],
}


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _hash_payload(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _read_csv_rows(file_bytes: bytes) -> tuple[str, list[str], list[tuple[int, dict[str, Any]]], list[dict[str, Any]]]:
    file_hash = hashlib.sha256(file_bytes or b"").hexdigest()
    if not file_bytes:
        return file_hash, [], [], [
            {
                "row_number": 0,
                "field_name": "file",
                "error_code": "empty_file",
                "error_message": "CSV file is empty.",
                "raw_row": {},
            }
        ]

    decoded = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(decoded))
    fieldnames = [str(name).strip().lower() for name in (reader.fieldnames or []) if name is not None]

    rows: list[tuple[int, dict[str, Any]]] = []
    for row_number, raw_row in enumerate(reader, start=2):
        normalized_row = {
            str(key).strip().lower(): (value.strip() if isinstance(value, str) else value)
            for key, value in (raw_row or {}).items()
            if key is not None
        }
        rows.append((row_number, normalized_row))

    return file_hash, fieldnames, rows, []


def _first_value(row: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    for key in aliases:
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _parse_iso_date(value: Any, *, field_name: str, required: bool = True) -> date | None:
    text = _normalize_text(value)
    if not text:
        if required:
            raise ValidationError({field_name: f"{field_name} is required."})
        return None

    parsed = parse_date(text)
    if parsed:
        return parsed

    parsed_dt = parse_datetime(text)
    if parsed_dt:
        return parsed_dt.date()

    raise ValidationError({field_name: f"{field_name} must be a valid ISO date (YYYY-MM-DD)."})


def _parse_int(value: Any, *, field_name: str) -> int:
    text = _normalize_text(value)
    if text == "":
        raise ValidationError({field_name: f"{field_name} is required."})
    try:
        return int(text)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field_name: f"{field_name} must be an integer."}) from exc


def _parse_sales_csv(file_bytes: bytes) -> dict[str, Any]:
    file_hash, fieldnames, raw_rows, errors = _read_csv_rows(file_bytes)

    required_groups = {
        "date": ("date", "event_date", "sold_at", "dispensed_at"),
        "medicine_name": ("medicine_name", "drug_name", "item_name", "name", "resource_name"),
        "quantity_sold": ("quantity_sold", "quantity_dispensed", "quantity", "qty", "units"),
    }
    missing = [logical for logical, aliases in required_groups.items() if not any(alias in fieldnames for alias in aliases)]
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

    rows: list[dict[str, Any]] = []
    for row_number, raw in raw_rows:
        try:
            event_date = _parse_iso_date(
                _first_value(raw, required_groups["date"]),
                field_name="date",
                required=True,
            )
            medicine_name = _normalize_text(_first_value(raw, required_groups["medicine_name"]))
            if not medicine_name:
                raise ValidationError({"medicine_name": "medicine_name is required."})

            quantity_sold = _parse_int(
                _first_value(raw, required_groups["quantity_sold"]),
                field_name="quantity_sold",
            )
            if quantity_sold <= 0:
                raise ValidationError({"quantity_sold": "quantity_sold must be greater than zero."})

            rows.append(
                {
                    "row_number": row_number,
                    "event_date": event_date,
                    "medicine_name": medicine_name,
                    "quantity_sold": quantity_sold,
                    "external_event_id": _normalize_text(
                        _first_value(raw, ("external_event_id", "event_id", "sale_id", "dispense_id", "id"))
                    ),
                    "category": _normalize_text(raw.get("category") or "Medication") or "Medication",
                    "unit": _normalize_text(raw.get("unit") or raw.get("unit_of_measure") or "units") or "units",
                    "description": _normalize_text(raw.get("description")),
                    "raw_row": raw,
                }
            )
        except ValidationError as exc:
            errors.append(
                {
                    "row_number": row_number,
                    "field_name": ",".join(exc.detail.keys()) if isinstance(exc.detail, dict) else "row",
                    "error_code": "invalid_row",
                    "error_message": str(exc.detail),
                    "raw_row": raw,
                }
            )

    return {
        "file_hash": file_hash,
        "total_rows": len(raw_rows),
        "rows": rows,
        "errors": errors,
    }


def _parse_staff_csv(file_bytes: bytes) -> dict[str, Any]:
    file_hash, fieldnames, raw_rows, errors = _read_csv_rows(file_bytes)

    if not any(alias in fieldnames for alias in ("first_name", "firstname", "name")):
        errors.append(
            {
                "row_number": 0,
                "field_name": "headers",
                "error_code": "missing_required_headers",
                "error_message": "Missing required CSV headers: first_name",
                "raw_row": {"headers": fieldnames},
            }
        )

    rows: list[dict[str, Any]] = []
    allowed_statuses = {choice for choice, _ in Staff.EmploymentStatus.choices}
    for row_number, raw in raw_rows:
        try:
            first_name = _normalize_text(_first_value(raw, ("first_name", "firstname")))
            last_name = _normalize_text(raw.get("last_name") or raw.get("lastname"))
            if not first_name and not _normalize_text(raw.get("name")):
                raise ValidationError({"first_name": "first_name is required."})
            if not first_name:
                name_value = _normalize_text(raw.get("name"))
                first_name = name_value.split(" ")[0]
                if len(name_value.split(" ")) > 1 and not last_name:
                    last_name = " ".join(name_value.split(" ")[1:])

            employee_id = _normalize_text(raw.get("employee_id"))
            email = _normalize_text(raw.get("email")).lower()
            if not employee_id and not email:
                raise ValidationError({"employee_id": "Provide employee_id or email."})

            status = _normalize_text(raw.get("employment_status") or Staff.EmploymentStatus.ACTIVE).lower()
            if status not in allowed_statuses:
                raise ValidationError({
                    "employment_status": f"employment_status must be one of: {', '.join(sorted(allowed_statuses))}"
                })

            effective_date = _parse_iso_date(
                _first_value(raw, ("effective_date", "start_date", "joined_date", "date")),
                field_name="effective_date",
                required=False,
            )

            rows.append(
                {
                    "row_number": row_number,
                    "first_name": first_name,
                    "last_name": last_name,
                    "employee_id": employee_id,
                    "email": email,
                    "department": _normalize_text(raw.get("department")),
                    "position": _normalize_text(raw.get("position")),
                    "phone_number": _normalize_text(raw.get("phone_number") or raw.get("phone")),
                    "employment_status": status,
                    "role_name": _normalize_text(raw.get("role") or raw.get("role_name")),
                    "effective_date": effective_date,
                    "raw_row": raw,
                }
            )
        except ValidationError as exc:
            errors.append(
                {
                    "row_number": row_number,
                    "field_name": ",".join(exc.detail.keys()) if isinstance(exc.detail, dict) else "row",
                    "error_code": "invalid_row",
                    "error_message": str(exc.detail),
                    "raw_row": raw,
                }
            )

    return {
        "file_hash": file_hash,
        "total_rows": len(raw_rows),
        "rows": rows,
        "errors": errors,
    }


def _parse_movement_csv(file_bytes: bytes, *, default_mode: str = "DELTA") -> dict[str, Any]:
    file_hash, fieldnames, raw_rows, errors = _read_csv_rows(file_bytes)

    required_groups = {
        "medicine_name": ("medicine_name", "drug_name", "item_name", "name", "resource_name"),
        "quantity": ("quantity", "quantity_delta", "delta", "qty"),
    }
    missing = [logical for logical, aliases in required_groups.items() if not any(alias in fieldnames for alias in aliases)]
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

    rows: list[dict[str, Any]] = []
    for row_number, raw in raw_rows:
        try:
            medicine_name = _normalize_text(_first_value(raw, required_groups["medicine_name"]))
            if not medicine_name:
                raise ValidationError({"medicine_name": "medicine_name is required."})

            quantity = _parse_int(_first_value(raw, required_groups["quantity"]), field_name="quantity")
            mode = _normalize_text(raw.get("mode") or raw.get("apply_mode") or default_mode).upper() or "DELTA"
            if mode not in {"DELTA", "ABSOLUTE"}:
                raise ValidationError({"mode": "mode must be DELTA or ABSOLUTE."})
            if mode == "DELTA" and quantity == 0:
                raise ValidationError({"quantity": "quantity must be non-zero for DELTA mode."})
            if mode == "ABSOLUTE" and quantity < 0:
                raise ValidationError({"quantity": "quantity must be non-negative for ABSOLUTE mode."})

            movement_type = _normalize_text(
                _first_value(raw, ("movement_type", "event_type", "transaction_type", "type", "operation"))
                or "restock"
            ).lower()

            rows.append(
                {
                    "row_number": row_number,
                    "medicine_name": medicine_name,
                    "quantity": quantity,
                    "mode": mode,
                    "movement_type": movement_type,
                    "event_date": _parse_iso_date(
                        _first_value(raw, ("event_date", "date", "timestamp", "occurred_at")),
                        field_name="event_date",
                        required=False,
                    ),
                    "external_event_id": _normalize_text(
                        _first_value(raw, ("external_event_id", "event_id", "movement_id", "id"))
                    ),
                    "notes": _normalize_text(raw.get("notes") or raw.get("description")),
                    "resource_type": _normalize_text(raw.get("resource_type") or raw.get("category") or "Medication")
                    or "Medication",
                    "unit": _normalize_text(raw.get("unit") or raw.get("unit_of_measure") or "units") or "units",
                    "raw_row": raw,
                }
            )
        except ValidationError as exc:
            errors.append(
                {
                    "row_number": row_number,
                    "field_name": ",".join(exc.detail.keys()) if isinstance(exc.detail, dict) else "row",
                    "error_code": "invalid_row",
                    "error_message": str(exc.detail),
                    "raw_row": raw,
                }
            )

    return {
        "file_hash": file_hash,
        "total_rows": len(raw_rows),
        "rows": rows,
        "errors": errors,
    }


def _effective_lock_date(facility) -> date:
    created = getattr(facility, "created_at", None)
    if created:
        return created.date()
    return timezone.now().date()


def _row_business_date(dataset_type: str, row: dict[str, Any]) -> date | None:
    if dataset_type == DATASET_SALES:
        return row.get("event_date")
    if dataset_type == DATASET_MOVEMENT:
        return row.get("event_date")
    if dataset_type == DATASET_STAFF:
        return row.get("effective_date")
    return None


def _is_locked_period_row(*, dataset_type: str, row: dict[str, Any], lock_date: date) -> bool:
    business_date = _row_business_date(dataset_type, row)
    if not business_date:
        return False
    return business_date >= lock_date


def _row_payload_for_hash(dataset_type: str, row: dict[str, Any]) -> dict[str, Any]:
    if dataset_type == DATASET_SALES:
        return {
            "event_date": row["event_date"].isoformat(),
            "medicine_name": row["medicine_name"].strip().lower(),
            "quantity_sold": int(row["quantity_sold"]),
            "external_event_id": _normalize_text(row.get("external_event_id")).lower(),
        }

    if dataset_type == DATASET_STAFF:
        return {
            "employee_id": _normalize_text(row.get("employee_id")).lower(),
            "email": _normalize_text(row.get("email")).lower(),
            "first_name": _normalize_text(row.get("first_name")).lower(),
            "last_name": _normalize_text(row.get("last_name")).lower(),
            "department": _normalize_text(row.get("department")).lower(),
            "position": _normalize_text(row.get("position")).lower(),
            "phone_number": _normalize_text(row.get("phone_number")).lower(),
            "employment_status": _normalize_text(row.get("employment_status")).lower(),
            "role_name": _normalize_text(row.get("role_name")).lower(),
            "effective_date": row["effective_date"].isoformat() if row.get("effective_date") else "",
        }

    return {
        "medicine_name": _normalize_text(row.get("medicine_name")).lower(),
        "quantity": int(row.get("quantity") or 0),
        "mode": _normalize_text(row.get("mode")).upper(),
        "movement_type": _normalize_text(row.get("movement_type")).lower(),
        "event_date": row["event_date"].isoformat() if row.get("event_date") else "",
        "external_event_id": _normalize_text(row.get("external_event_id")).lower(),
        "notes": _normalize_text(row.get("notes")).lower(),
    }


def _conflict_key_for_row(dataset_type: str, row: dict[str, Any]) -> str:
    if dataset_type == DATASET_SALES:
        external_event_id = _normalize_text(row.get("external_event_id")).lower()
        if external_event_id:
            return f"external:{external_event_id}"
        return f"daily:{row['event_date'].isoformat()}:{row['medicine_name'].strip().lower()}"

    if dataset_type == DATASET_STAFF:
        employee_id = _normalize_text(row.get("employee_id")).lower()
        if employee_id:
            return f"employee:{employee_id}"
        return f"email:{_normalize_text(row.get('email')).lower()}"

    external_event_id = _normalize_text(row.get("external_event_id")).lower()
    if external_event_id:
        return f"external:{external_event_id}"
    event_date = row.get("event_date")
    date_key = event_date.isoformat() if event_date else "undated"
    return (
        f"movement:{date_key}:{_normalize_text(row.get('medicine_name')).lower()}:"
        f"{_normalize_text(row.get('movement_type')).lower()}:{_normalize_text(row.get('mode')).upper()}"
    )


def _check_row_version(*, facility, dataset_type: str, conflict_key: str, payload_hash: str):
    existing = PharmacyCSVRowVersion.objects.filter(
        facility=facility,
        dataset_type=dataset_type,
        conflict_key=conflict_key,
    ).first()
    if not existing:
        return "new", None
    if existing.payload_hash == payload_hash:
        return "duplicate", existing
    return "conflict", existing


def _to_row_error(*, row_number: int, field_name: str, error_code: str, error_message: str, raw_row: dict[str, Any]) -> dict:
    return {
        "row_number": max(0, int(row_number or 0)),
        "field_name": str(field_name or "")[:80],
        "error_code": str(error_code or "validation_error")[:80],
        "error_message": str(error_message or "validation error"),
        "raw_row": raw_row or {},
    }


def _to_row_conflict(
    *,
    row_number: int,
    conflict_key: str,
    message: str,
    existing_record: dict[str, Any],
    incoming_record: dict[str, Any],
    resolution: str,
) -> dict:
    return {
        "row_number": max(0, int(row_number or 0)),
        "conflict_key": str(conflict_key or "")[:255],
        "message": str(message or "")[:1000],
        "existing_record": existing_record or {},
        "incoming_record": incoming_record or {},
        "resolution": resolution,
    }


def _parse_dataset_csv(dataset_type: str, file_bytes: bytes, *, default_movement_mode: str = "DELTA") -> dict[str, Any]:
    if dataset_type == DATASET_SALES:
        return _parse_sales_csv(file_bytes)
    if dataset_type == DATASET_STAFF:
        return _parse_staff_csv(file_bytes)
    if dataset_type == DATASET_MOVEMENT:
        return _parse_movement_csv(file_bytes, default_mode=default_movement_mode)
    raise ValidationError({"dataset_type": "Unsupported dataset type."})


def validate_pharmacy_csv_upload(
    *,
    facility,
    dataset_type: str,
    file_bytes: bytes,
    conflict_policy: str,
    locked_period_policy: str,
    actor,
    default_movement_mode: str = "DELTA",
) -> dict[str, Any]:
    parsed = _parse_dataset_csv(dataset_type, file_bytes, default_movement_mode=default_movement_mode)
    lock_date = _effective_lock_date(facility)

    errors = list(parsed["errors"])
    conflicts: list[dict[str, Any]] = []
    valid_rows = 0
    seen_keys: set[str] = set()

    for row in parsed["rows"]:
        row_number = int(row.get("row_number") or 0)
        payload = _row_payload_for_hash(dataset_type, row)
        payload_hash = _hash_payload(payload)
        conflict_key = _conflict_key_for_row(dataset_type, row)

        if conflict_key in seen_keys:
            errors.append(
                _to_row_error(
                    row_number=row_number,
                    field_name="row",
                    error_code="duplicate_row_key",
                    error_message="Duplicate business key found within uploaded CSV.",
                    raw_row=row.get("raw_row", {}),
                )
            )
            continue
        seen_keys.add(conflict_key)

        if _is_locked_period_row(dataset_type=dataset_type, row=row, lock_date=lock_date):
            if locked_period_policy == PharmacyCSVImportJob.LockedPeriodPolicy.SKIP:
                errors.append(
                    _to_row_error(
                        row_number=row_number,
                        field_name="date",
                        error_code="locked_period_skipped",
                        error_message=(
                            f"Row date is locked (>= {lock_date.isoformat()}); row will be skipped during commit."
                        ),
                        raw_row=row.get("raw_row", {}),
                    )
                )
                continue

            errors.append(
                _to_row_error(
                    row_number=row_number,
                    field_name="date",
                    error_code="locked_period",
                    error_message=(
                        f"Rows dated on/after registration date ({lock_date.isoformat()}) cannot be imported."
                    ),
                    raw_row=row.get("raw_row", {}),
                )
            )
            continue

        state, existing_version = _check_row_version(
            facility=facility,
            dataset_type=dataset_type,
            conflict_key=conflict_key,
            payload_hash=payload_hash,
        )
        if state == "conflict":
            conflicts.append(
                _to_row_conflict(
                    row_number=row_number,
                    conflict_key=conflict_key,
                    message="Existing record has different values for the same business key.",
                    existing_record=existing_version.payload,
                    incoming_record=payload,
                    resolution=PharmacyCSVImportConflict.Resolution.PENDING,
                )
            )
            if conflict_policy == PharmacyCSVImportJob.ConflictPolicy.REJECT:
                continue

        valid_rows += 1

    sample_rows = [row.get("raw_row", {}) for row in parsed["rows"][:5]]
    validation_context = PharmacyCSVValidationContext.objects.create(
        facility=facility,
        dataset_type=dataset_type,
        file_hash=parsed["file_hash"],
        expected_schema=list(SCHEMA_HINTS.get(dataset_type, [])),
        errors=errors,
        conflicts=conflicts,
        sample_rows=sample_rows,
        total_rows=parsed["total_rows"],
        valid_rows=valid_rows,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )

    return {
        "file_id": str(validation_context.file_id),
        "dataset_type": dataset_type,
        "file_hash": parsed["file_hash"],
        "registration_lock_date": lock_date.isoformat(),
        "total_rows": parsed["total_rows"],
        "valid_rows": valid_rows,
        "error_rows": len(errors),
        "conflict_rows": len(conflicts),
        "row_errors": errors,
        "row_conflicts": conflicts,
        "conflict_policy": conflict_policy,
        "locked_period_policy": locked_period_policy,
    }


def _get_or_create_catalog_item(*, facility, name: str, resource_type_name: str, unit: str, description: str) -> ResourceCatalog:
    resource_type, _ = ResourceType.objects.get_or_create(name=resource_type_name or "Medication")
    unit = _normalize_text(unit) or "units"
    if unit and not resource_type.unit_of_measure:
        resource_type.unit_of_measure = unit
        resource_type.save(update_fields=["unit_of_measure", "updated_at"])

    catalog_item, _ = ResourceCatalog.objects.get_or_create(
        hospital=facility,
        resource_type=resource_type,
        name=name,
        defaults={
            "unit_of_measure": unit,
            "description": description,
        },
    )

    catalog_updates = []
    if unit and catalog_item.unit_of_measure != unit:
        catalog_item.unit_of_measure = unit
        catalog_updates.append("unit_of_measure")
    if description and catalog_item.description != description:
        catalog_item.description = description
        catalog_updates.append("description")
    if catalog_updates:
        catalog_updates.append("updated_at")
        catalog_item.save(update_fields=catalog_updates)

    ResourceInventory.objects.get_or_create(
        catalog_item=catalog_item,
        defaults={
            "quantity_available": 0,
            "quantity_reserved": 0,
            "reserved_quantity": 0,
        },
    )

    return catalog_item


def _sales_external_event_id(*, facility, row: dict[str, Any], catalog_item_id: Any) -> str:
    provided = _normalize_text(row.get("external_event_id")).lower()
    if provided:
        candidate = f"csv:provided:{provided}"
    else:
        candidate = (
            f"csv:auto:{facility.id}:{row['event_date'].isoformat()}:"
            f"{str(catalog_item_id)}:{_normalize_text(row['medicine_name']).lower()}"
        )

    if len(candidate) <= 160:
        return candidate

    digest = hashlib.sha256(candidate.encode("utf-8")).hexdigest()
    return f"csv:hash:{digest}"[:160]


def _apply_sales_row(*, facility, row: dict[str, Any]) -> None:
    catalog_item = _get_or_create_catalog_item(
        facility=facility,
        name=row["medicine_name"],
        resource_type_name=row.get("category") or "Medication",
        unit=row.get("unit") or "units",
        description=row.get("description") or "",
    )

    external_event_id = _sales_external_event_id(facility=facility, row=row, catalog_item_id=catalog_item.id)
    payload_hash = _hash_payload(
        {
            "facility_id": str(facility.id),
            "event_date": row["event_date"].isoformat(),
            "catalog_item_id": str(catalog_item.id),
            "quantity_sold": int(row["quantity_sold"]),
            "external_event_id": external_event_id,
        }
    )

    defaults = {
        "resource_catalog": catalog_item,
        "event_date": row["event_date"],
        "quantity_sold": int(row["quantity_sold"]),
        "source_type": MLDispenseLog.SourceType.CSV_UPLOAD,
        "source_endpoint": "/api/v1/pharmacy-csv/sales/imports/commit/",
        "payload_hash": payload_hash,
        "raw_payload": row.get("raw_row") or {},
    }

    MLDispenseLog.objects.update_or_create(
        facility=facility,
        external_event_id=external_event_id,
        defaults=defaults,
    )


def _apply_staff_row(*, facility, row: dict[str, Any]) -> None:
    role = None
    role_name = _normalize_text(row.get("role_name"))
    if role_name:
        role = Role.objects.filter(name__iexact=role_name).first()
        if not role:
            raise ValidationError({"role": f"Role '{role_name}' was not found."})

    staff_qs = Staff.objects.select_for_update().filter(hospital=facility)
    existing = None
    employee_id = _normalize_text(row.get("employee_id"))
    email = _normalize_text(row.get("email")).lower()

    if employee_id:
        existing = staff_qs.filter(employee_id__iexact=employee_id).first()
    if not existing and email:
        existing = staff_qs.filter(email__iexact=email).first()

    payload = {
        "first_name": row.get("first_name") or "Unknown",
        "last_name": row.get("last_name") or "",
        "employee_id": employee_id,
        "department": row.get("department") or "",
        "position": row.get("position") or "",
        "phone_number": row.get("phone_number") or "",
        "employment_status": row.get("employment_status") or Staff.EmploymentStatus.ACTIVE,
        "email": email,
        "role": role,
    }

    if existing:
        update_fields = []
        for key, value in payload.items():
            if getattr(existing, key) != value:
                setattr(existing, key, value)
                update_fields.append(key)
        if update_fields:
            update_fields.append("updated_at")
            existing.save(update_fields=update_fields)
        return

    Staff.objects.create(
        hospital=facility,
        first_name=payload["first_name"],
        last_name=payload["last_name"],
        employee_id=payload["employee_id"],
        department=payload["department"],
        position=payload["position"],
        phone_number=payload["phone_number"],
        employment_status=payload["employment_status"],
        email=payload["email"],
        role=payload["role"],
    )


def _movement_delta(mode: str, movement_type: str, quantity: int) -> int:
    movement_type = movement_type.strip().lower()
    mode = mode.strip().upper()

    if mode == "ABSOLUTE":
        return quantity

    inbound_types = {"restock", "stock_in", "purchase", "received", "transfer_in", "inbound"}
    outbound_types = {"sale", "dispense", "consumption", "stock_out", "transfer_out", "outbound", "usage"}

    if movement_type in inbound_types:
        return abs(quantity)
    if movement_type in outbound_types:
        return -abs(quantity)
    return quantity


def _movement_transaction_type(movement_type: str, delta: int) -> str:
    normalized = movement_type.strip().lower()
    if normalized == "transfer_out" or delta < 0 and normalized in {"outbound", "stock_out"}:
        return ResourceTransaction.TransactionType.TRANSFER_OUT
    if normalized == "transfer_in" or delta > 0 and normalized in {"inbound", "stock_in"}:
        return ResourceTransaction.TransactionType.TRANSFER_IN
    if normalized in {"restock", "purchase", "received"} and delta > 0:
        return ResourceTransaction.TransactionType.RESTOCK
    return ResourceTransaction.TransactionType.ADJUSTMENT


def _apply_movement_row(*, facility, row: dict[str, Any], actor) -> None:
    catalog_item = _get_or_create_catalog_item(
        facility=facility,
        name=row["medicine_name"],
        resource_type_name=row.get("resource_type") or "Medication",
        unit=row.get("unit") or "units",
        description="",
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
    if inventory.reserved_quantity != effective_reserved:
        inventory.reserved_quantity = effective_reserved
    if inventory.quantity_reserved != effective_reserved:
        inventory.quantity_reserved = effective_reserved

    old_quantity = int(inventory.quantity_available or 0)
    mode = _normalize_text(row.get("mode") or "DELTA").upper()
    quantity = int(row.get("quantity") or 0)

    if mode == "ABSOLUTE":
        new_quantity = quantity
        if new_quantity < effective_reserved:
            raise ValidationError(
                {
                    "quantity": (
                        f"Absolute quantity {new_quantity} cannot be lower than reserved quantity {effective_reserved}."
                    )
                }
            )
        delta = new_quantity - old_quantity
        transaction_type = ResourceTransaction.TransactionType.ADJUSTMENT
    else:
        delta = _movement_delta(mode=mode, movement_type=row.get("movement_type") or "", quantity=quantity)
        transaction_type = _movement_transaction_type(row.get("movement_type") or "", delta)
        new_quantity = old_quantity + delta
        if new_quantity < effective_reserved:
            raise ValidationError(
                {
                    "quantity": (
                        f"Resulting quantity {new_quantity} cannot be lower than reserved quantity {effective_reserved}."
                    )
                }
            )
        if new_quantity < 0:
            raise ValidationError({"quantity": "Resulting quantity cannot be negative."})

    inventory.quantity_available = new_quantity
    update_fields = ["quantity_available", "reserved_quantity", "quantity_reserved", "updated_at"]
    if delta > 0:
        inventory.last_restocked_at = timezone.now()
        update_fields.append("last_restocked_at")
    inventory.save(update_fields=list(dict.fromkeys(update_fields)))

    if delta != 0:
        ResourceTransaction.objects.create(
            inventory=inventory,
            transaction_type=transaction_type,
            quantity_delta=delta,
            balance_after=new_quantity,
            notes=row.get("notes") or f"pharmacy_csv:{mode.lower()}:{_normalize_text(row.get('movement_type')).lower()}",
            performed_by=actor if getattr(actor, "is_authenticated", False) else None,
        )


def _apply_dataset_row(*, dataset_type: str, facility, row: dict[str, Any], actor) -> None:
    if dataset_type == DATASET_SALES:
        _apply_sales_row(facility=facility, row=row)
        return
    if dataset_type == DATASET_STAFF:
        _apply_staff_row(facility=facility, row=row)
        return
    if dataset_type == DATASET_MOVEMENT:
        _apply_movement_row(facility=facility, row=row, actor=actor)
        return
    raise ValidationError({"dataset_type": "Unsupported dataset type."})


def _upsert_row_version(
    *,
    facility,
    dataset_type: str,
    conflict_key: str,
    payload_hash: str,
    payload: dict[str, Any],
    import_job: PharmacyCSVImportJob,
) -> None:
    PharmacyCSVRowVersion.objects.update_or_create(
        facility=facility,
        dataset_type=dataset_type,
        conflict_key=conflict_key,
        defaults={
            "payload_hash": payload_hash,
            "payload": payload,
            "last_import_job": import_job,
        },
    )


def commit_pharmacy_csv_upload(
    *,
    facility,
    dataset_type: str,
    file_bytes: bytes,
    conflict_policy: str,
    locked_period_policy: str,
    confirm_conflicts: bool,
    idempotency_key: str,
    actor,
    default_movement_mode: str = "DELTA",
) -> tuple[PharmacyCSVImportJob, bool]:
    parsed = _parse_dataset_csv(dataset_type, file_bytes, default_movement_mode=default_movement_mode)
    file_hash = parsed["file_hash"]

    if idempotency_key:
        existing_by_key = PharmacyCSVImportJob.objects.filter(
            facility=facility,
            dataset_type=dataset_type,
            idempotency_key=idempotency_key,
        ).first()
        if existing_by_key:
            if existing_by_key.file_hash == file_hash:
                return existing_by_key, True
            raise ValidationError({"idempotency_key": "Idempotency key conflict for a different file payload."})

    existing_success = PharmacyCSVImportJob.objects.filter(
        facility=facility,
        dataset_type=dataset_type,
        file_hash=file_hash,
        status__in=[PharmacyCSVImportJob.Status.APPLIED, PharmacyCSVImportJob.Status.PARTIALLY_APPLIED],
    ).first()
    if existing_success and not idempotency_key:
        return existing_success, True

    job = PharmacyCSVImportJob.objects.create(
        facility=facility,
        dataset_type=dataset_type,
        file_hash=file_hash,
        idempotency_key=(idempotency_key or "")[:128],
        conflict_policy=conflict_policy,
        locked_period_policy=locked_period_policy,
        status=PharmacyCSVImportJob.Status.APPLYING,
        total_rows=parsed["total_rows"],
        requested_by=actor if getattr(actor, "is_authenticated", False) else None,
    )

    lock_date = _effective_lock_date(facility)
    import_errors = list(parsed["errors"])
    import_conflicts: list[dict[str, Any]] = []

    applied_rows = 0
    skipped_duplicates = 0
    skipped_locked = 0
    detected_conflicts = 0
    overwritten_conflicts = 0
    seen_keys: set[str] = set()

    with transaction.atomic():
        for row in parsed["rows"]:
            row_number = int(row.get("row_number") or 0)
            raw_row = row.get("raw_row", {})
            conflict_key = _conflict_key_for_row(dataset_type, row)
            payload = _row_payload_for_hash(dataset_type, row)
            payload_hash = _hash_payload(payload)

            if conflict_key in seen_keys:
                import_errors.append(
                    _to_row_error(
                        row_number=row_number,
                        field_name="row",
                        error_code="duplicate_row_key",
                        error_message="Duplicate business key found within uploaded CSV.",
                        raw_row=raw_row,
                    )
                )
                continue
            seen_keys.add(conflict_key)

            if _is_locked_period_row(dataset_type=dataset_type, row=row, lock_date=lock_date):
                skipped_locked += 1
                error_code = (
                    "locked_period_skipped"
                    if locked_period_policy == PharmacyCSVImportJob.LockedPeriodPolicy.SKIP
                    else "locked_period"
                )
                import_errors.append(
                    _to_row_error(
                        row_number=row_number,
                        field_name="date",
                        error_code=error_code,
                        error_message=(
                            f"Rows dated on/after registration date ({lock_date.isoformat()}) are restricted."
                        ),
                        raw_row=raw_row,
                    )
                )
                continue

            state, existing_version = _check_row_version(
                facility=facility,
                dataset_type=dataset_type,
                conflict_key=conflict_key,
                payload_hash=payload_hash,
            )

            conflict_record = None
            if state == "duplicate":
                skipped_duplicates += 1
                continue

            if state == "conflict":
                detected_conflicts += 1
                conflict_record = {
                    "row_number": row_number,
                    "conflict_key": conflict_key,
                    "message": "Existing record has different values for the same business key.",
                    "existing_record": existing_version.payload,
                    "incoming_record": payload,
                }

                allow_overwrite = (
                    conflict_policy == PharmacyCSVImportJob.ConflictPolicy.OVERWRITE and bool(confirm_conflicts)
                )
                if not allow_overwrite:
                    import_conflicts.append(
                        _to_row_conflict(
                            row_number=row_number,
                            conflict_key=conflict_key,
                            message=conflict_record["message"],
                            existing_record=existing_version.payload,
                            incoming_record=payload,
                            resolution=PharmacyCSVImportConflict.Resolution.PENDING,
                        )
                    )
                    import_errors.append(
                        _to_row_error(
                            row_number=row_number,
                            field_name="row",
                            error_code="conflict_detected",
                            error_message="Conflicting values detected for an existing business key.",
                            raw_row=raw_row,
                        )
                    )
                    continue

            try:
                _apply_dataset_row(dataset_type=dataset_type, facility=facility, row=row, actor=actor)
                _upsert_row_version(
                    facility=facility,
                    dataset_type=dataset_type,
                    conflict_key=conflict_key,
                    payload_hash=payload_hash,
                    payload=payload,
                    import_job=job,
                )
                applied_rows += 1

                if conflict_record:
                    overwritten_conflicts += 1
                    import_conflicts.append(
                        _to_row_conflict(
                            row_number=row_number,
                            conflict_key=conflict_key,
                            message=conflict_record["message"],
                            existing_record=conflict_record["existing_record"],
                            incoming_record=payload,
                            resolution=PharmacyCSVImportConflict.Resolution.OVERWRITTEN,
                        )
                    )
            except ValidationError as exc:
                import_errors.append(
                    _to_row_error(
                        row_number=row_number,
                        field_name="row",
                        error_code="apply_failed",
                        error_message=str(exc.detail),
                        raw_row=raw_row,
                    )
                )
                if conflict_record:
                    import_conflicts.append(
                        _to_row_conflict(
                            row_number=row_number,
                            conflict_key=conflict_key,
                            message=conflict_record["message"],
                            existing_record=conflict_record["existing_record"],
                            incoming_record=payload,
                            resolution=PharmacyCSVImportConflict.Resolution.SKIPPED,
                        )
                    )

        error_instances = [
            PharmacyCSVImportError(
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
            PharmacyCSVImportError.objects.bulk_create(error_instances, batch_size=500)

        conflict_instances = [
            PharmacyCSVImportConflict(
                import_job=job,
                row_number=max(0, int(conflict.get("row_number") or 0)),
                conflict_key=str(conflict.get("conflict_key") or "")[:255],
                message=str(conflict.get("message") or "")[:1000],
                existing_record=conflict.get("existing_record") or {},
                incoming_record=conflict.get("incoming_record") or {},
                resolution=conflict.get("resolution") or PharmacyCSVImportConflict.Resolution.PENDING,
            )
            for conflict in import_conflicts
        ]
        if conflict_instances:
            PharmacyCSVImportConflict.objects.bulk_create(conflict_instances, batch_size=500)

        status_value = (
            PharmacyCSVImportJob.Status.PARTIALLY_APPLIED
            if import_errors and applied_rows > 0
            else PharmacyCSVImportJob.Status.FAILED
            if import_errors and applied_rows == 0
            else PharmacyCSVImportJob.Status.APPLIED
        )

        job.status = status_value
        job.applied_rows = applied_rows
        job.error_rows = len(import_errors)
        job.conflict_rows = len(import_conflicts)
        job.summary = {
            "dataset_type": dataset_type,
            "registration_lock_date": lock_date.isoformat(),
            "applied_rows": applied_rows,
            "error_rows": len(import_errors),
            "conflict_rows": len(import_conflicts),
            "detected_conflicts": detected_conflicts,
            "overwritten_conflicts": overwritten_conflicts,
            "skipped_duplicates": skipped_duplicates,
            "skipped_locked": skipped_locked,
            "idempotency_scope": "facility+dataset+idempotency_key_or_file_hash",
        }
        job.save(
            update_fields=[
                "status",
                "applied_rows",
                "error_rows",
                "conflict_rows",
                "summary",
                "updated_at",
            ]
        )

    logger.info(
        "Pharmacy CSV import committed for facility=%s dataset=%s job=%s status=%s applied=%s errors=%s conflicts=%s",
        facility.id,
        dataset_type,
        job.id,
        job.status,
        job.applied_rows,
        job.error_rows,
        job.conflict_rows,
    )
    return job, False


def import_job_snapshot(job: PharmacyCSVImportJob) -> dict[str, Any]:
    return {
        "id": str(job.id),
        "facility_id": str(job.facility_id),
        "dataset_type": job.dataset_type,
        "file_hash": job.file_hash,
        "idempotency_key": job.idempotency_key,
        "conflict_policy": job.conflict_policy,
        "locked_period_policy": job.locked_period_policy,
        "status": job.status,
        "total_rows": job.total_rows,
        "applied_rows": job.applied_rows,
        "error_rows": job.error_rows,
        "conflict_rows": job.conflict_rows,
        "summary": job.summary,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }
