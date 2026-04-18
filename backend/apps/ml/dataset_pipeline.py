"""Dataset generation and MinIO upload pipeline for ML jobs."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.utils import timezone

from apps.hospitals.models import Hospital
from apps.requests.models import DeliveryEvent
from apps.resources.models import ResourceCatalog, ResourceInventory, ResourceTransaction

from .models import MLDispenseLog, MLJob

logger = logging.getLogger("hrsp.ml")


SALES_FILE_NAME = "sales.csv"
MEDICINES_FILE_NAME = "medicines.csv"
HEALTHCARES_FILE_NAME = "healthcares.csv"

SALES_HEADERS = ["date", "healthcare_id", "medicine_name", "quantity_sold", "upazila"]
MEDICINES_HEADERS = ["medicine_name", "base_daily_sales", "outbreak_multiplier", "signals_disease"]
HEALTHCARES_HEADERS = ["healthcare_id", "name", "upazila", "lat", "lon"]


def _healthcare_id_for(hospital: Hospital) -> str:
    """Use registration_number as the canonical healthcare identifier for ML datasets."""
    if hospital.registration_number:
        return str(hospital.registration_number).strip()
    return str(hospital.id)


def _upazila_for(hospital: Hospital) -> str:
    return (
        hospital.region_level_2
        or hospital.city
        or hospital.region_level_1
        or hospital.state
        or hospital.country
        or "UNKNOWN"
    )


def _active_healthcares() -> list[Hospital]:
    return list(
        Hospital.objects.exclude(verified_status=Hospital.VerifiedStatus.OFFBOARDED).order_by("name")
    )


def _build_healthcares_rows(hospitals: list[Hospital]) -> list[dict]:
    rows = []
    for hospital in hospitals:
        lat = hospital.latitude if hospital.latitude is not None else Decimal("0")
        lon = hospital.longitude if hospital.longitude is not None else Decimal("0")
        rows.append(
            {
                "healthcare_id": _healthcare_id_for(hospital),
                "name": hospital.name,
                "upazila": _upazila_for(hospital),
                "lat": str(lat),
                "lon": str(lon),
            }
        )
    return rows


def _collect_sales_from_delivery_events(
    *,
    since,
    until,
    allowed_hospital_ids: set,
    aggregate: dict[tuple[str, str, str, str], int],
) -> None:
    events = DeliveryEvent.objects.select_related(
        "request",
        "request__requesting_hospital",
        "request__catalog_item",
    ).filter(delivered_at__gte=since)
    if until is not None:
        events = events.filter(delivered_at__lte=until)
    events = events.order_by("id")

    for event in events.iterator():
        request = event.request
        hospital = request.requesting_hospital
        if hospital_id := getattr(hospital, "id", None):
            if hospital_id not in allowed_hospital_ids:
                continue
        quantity = int(event.quantity_received or 0)
        if quantity <= 0:
            continue
        key = (
            event.delivered_at.date().isoformat(),
            _healthcare_id_for(hospital),
            request.catalog_item.name,
            _upazila_for(hospital),
        )
        aggregate[key] += quantity


def _collect_sales_from_dispense_logs(
    *,
    since,
    until,
    allowed_hospital_ids: set,
    aggregate: dict[tuple[str, str, str, str], int],
) -> None:
    logs = MLDispenseLog.objects.select_related("facility", "resource_catalog").filter(
        event_date__gte=since.date(),
        quantity_sold__gt=0,
        facility_id__in=allowed_hospital_ids,
    )
    if until is not None:
        logs = logs.filter(event_date__lte=until.date())
    logs = logs.order_by("id")

    for entry in logs.iterator():
        facility = entry.facility
        key = (
            entry.event_date.isoformat(),
            _healthcare_id_for(facility),
            entry.resource_catalog.name,
            _upazila_for(facility),
        )
        aggregate[key] += int(entry.quantity_sold or 0)


def _collect_sales_from_inventory_movements(
    *,
    since,
    until,
    allowed_hospital_ids: set,
    aggregate: dict[tuple[str, str, str, str], int],
) -> None:
    include_transfer_out = bool(getattr(settings, "ML_INCLUDE_TRANSFER_OUT_IN_SALES", False))
    transaction_types = [ResourceTransaction.TransactionType.ADJUSTMENT]
    if include_transfer_out:
        transaction_types.append(ResourceTransaction.TransactionType.TRANSFER_OUT)

    txns = ResourceTransaction.objects.select_related(
        "inventory",
        "inventory__catalog_item",
        "inventory__catalog_item__hospital",
    ).filter(
        created_at__gte=since,
        quantity_delta__lt=0,
        transaction_type__in=transaction_types,
    )
    if until is not None:
        txns = txns.filter(created_at__lte=until)
    txns = txns.order_by("id")

    for txn in txns.iterator():
        inventory = txn.inventory
        catalog_item = inventory.catalog_item
        hospital = catalog_item.hospital
        if hospital.id not in allowed_hospital_ids:
            continue

        # Only treat adjustment rows as inferred sales when they came from import/snapshot
        # updates or are explicitly tagged as sales/dispense consumption events.
        if txn.transaction_type == ResourceTransaction.TransactionType.ADJUSTMENT:
            notes = (txn.notes or "").strip().lower()
            if not notes:
                continue
            if notes.startswith("csv_import:full_replace"):
                continue
            if not (
                notes.startswith("csv_import:")
                or notes.startswith("quick_update")
                or "dispense" in notes
                or "sale" in notes
                or "consum" in notes
            ):
                continue

        quantity = abs(int(txn.quantity_delta or 0))
        if quantity <= 0:
            continue
        key = (
            txn.created_at.date().isoformat(),
            _healthcare_id_for(hospital),
            catalog_item.name,
            _upazila_for(hospital),
        )
        aggregate[key] += quantity


def _add_inventory_baseline_sales(
    *,
    hospitals: list[Hospital],
    aggregate: dict[tuple[str, str, str, str], int],
) -> None:
    baseline_ratio = float(getattr(settings, "ML_SALES_BASELINE_RATIO", 0.02))
    baseline_cap = int(getattr(settings, "ML_SALES_BASELINE_MAX_PER_ITEM", 50))

    existing_pairs = {(key[1], key[2]) for key in aggregate.keys()}
    allowed_ids = {hospital.id for hospital in hospitals}
    today = timezone.now().date().isoformat()

    inventories = (
        ResourceInventory.objects.select_related("catalog_item", "catalog_item__hospital")
        .filter(catalog_item__hospital_id__in=allowed_ids)
        .order_by("id")
    )

    for inventory in inventories.iterator():
        catalog_item = inventory.catalog_item
        hospital = catalog_item.hospital
        pair = (_healthcare_id_for(hospital), catalog_item.name)
        if pair in existing_pairs:
            continue

        quantity_available = int(inventory.quantity_available or 0)
        if quantity_available <= 0:
            continue

        baseline_qty = max(1, min(int(round(quantity_available * baseline_ratio)), baseline_cap))
        key = (
            today,
            pair[0],
            pair[1],
            _upazila_for(hospital),
        )
        aggregate[key] += baseline_qty


def _build_sales_rows(
    hospitals: list[Hospital],
    *,
    date_from=None,
    date_to=None,
    include_baseline: bool = True,
) -> list[dict]:
    now = timezone.now()
    local_tz = timezone.get_current_timezone()

    if date_from is not None:
        since = timezone.make_aware(datetime.combine(date_from, time.min), local_tz)
    else:
        lookback_days = int(getattr(settings, "ML_DATASET_LOOKBACK_DAYS", 90))
        since = now - timedelta(days=max(1, lookback_days))

    until = None
    if date_to is not None:
        until = timezone.make_aware(datetime.combine(date_to, time.max), local_tz)
        if until < since:
            raise ValueError("date_to cannot be before date_from.")

    aggregate: dict[tuple[str, str, str, str], int] = defaultdict(int)
    allowed_hospital_ids = {hospital.id for hospital in hospitals}

    _collect_sales_from_delivery_events(
        since=since,
        until=until,
        allowed_hospital_ids=allowed_hospital_ids,
        aggregate=aggregate,
    )
    _collect_sales_from_dispense_logs(
        since=since,
        until=until,
        allowed_hospital_ids=allowed_hospital_ids,
        aggregate=aggregate,
    )
    _collect_sales_from_inventory_movements(
        since=since,
        until=until,
        allowed_hospital_ids=allowed_hospital_ids,
        aggregate=aggregate,
    )
    if include_baseline:
        _add_inventory_baseline_sales(hospitals=hospitals, aggregate=aggregate)

    rows = [
        {
            "date": date_str,
            "healthcare_id": healthcare_id,
            "medicine_name": medicine_name,
            "quantity_sold": quantity,
            "upazila": upazila,
        }
        for (date_str, healthcare_id, medicine_name, upazila), quantity in aggregate.items()
        if quantity > 0
    ]
    rows.sort(key=lambda row: (row["date"], row["healthcare_id"], row["medicine_name"]))
    return rows


def _infer_disease_signal(medicine_name: str) -> str:
    name = medicine_name.lower()
    signal_map = [
        (("dengue", "platelet"), "dengue"),
        (("malaria", "artemether", "chloroquine"), "malaria"),
        (("covid", "respir", "oxygen"), "respiratory"),
        (("insulin", "metformin", "glimepiride"), "diabetes"),
        (("amoxicillin", "azithromycin", "cef", "cipro"), "bacterial_infection"),
        (("paracetamol", "ibuprofen", "naproxen"), "fever_pain"),
    ]
    for keywords, signal in signal_map:
        if any(keyword in name for keyword in keywords):
            return signal
    return "general"


def _signal_to_multiplier(signal: str) -> str:
    mapping = {
        "dengue": Decimal("1.75"),
        "malaria": Decimal("1.60"),
        "respiratory": Decimal("1.45"),
        "diabetes": Decimal("1.15"),
        "bacterial_infection": Decimal("1.30"),
        "fever_pain": Decimal("1.20"),
        "general": Decimal("1.10"),
    }
    return str(mapping.get(signal, Decimal("1.10")))


def _build_medicines_rows(hospitals: list[Hospital], sales_rows: list[dict]) -> list[dict]:
    hospital_ids = [hospital.id for hospital in hospitals]
    medicine_names = set(
        ResourceCatalog.objects.filter(hospital_id__in=hospital_ids).values_list("name", flat=True)
    )

    sales_by_name_and_day: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in sales_rows:
        medicine_name = str(row["medicine_name"])
        sales_by_name_and_day[medicine_name][row["date"]] += int(row["quantity_sold"])
        medicine_names.add(medicine_name)

    rows = []
    for medicine_name in sorted(medicine_names):
        day_values = sales_by_name_and_day.get(medicine_name, {})
        total_sales = sum(day_values.values())
        day_count = len(day_values)
        base_daily = Decimal("0")
        if day_count > 0:
            base_daily = (Decimal(total_sales) / Decimal(day_count)).quantize(Decimal("0.01"))

        signal = _infer_disease_signal(medicine_name)
        rows.append(
            {
                "medicine_name": medicine_name,
                "base_daily_sales": str(base_daily),
                "outbreak_multiplier": _signal_to_multiplier(signal),
                "signals_disease": signal,
            }
        )
    return rows


def _csv_bytes(*, headers: list[str], rows: list[dict]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=headers)
    writer.writeheader()
    for row in rows:
        writer.writerow({header: row.get(header, "") for header in headers})
    return buffer.getvalue().encode("utf-8")


def _minio_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_ENDPOINT_URL,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        region_name=getattr(settings, "MINIO_REGION_NAME", "us-east-1"),
    )


def _ensure_bucket_exists(client, bucket_name: str) -> None:
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchBucket", "NotFound"}:
            client.create_bucket(Bucket=bucket_name)
        else:
            raise


def _object_exists(client, bucket_name: str, object_key: str) -> bool:
    try:
        client.head_object(Bucket=bucket_name, Key=object_key)
        return True
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def _upload_csv_object(
    *,
    client,
    bucket_name: str,
    object_key: str,
    file_name: str,
    content: bytes,
    row_count: int,
) -> dict:
    client.put_object(
        Bucket=bucket_name,
        Key=object_key,
        Body=content,
        ContentType="text/csv",
    )
    return {
        "file_name": file_name,
        "bucket": bucket_name,
        "object_key": object_key,
        "uri": f"minio://{bucket_name}/{object_key}",
        "row_count": row_count,
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def _snapshot_prefix(job: MLJob) -> str:
    prefix = str(getattr(settings, "ML_DATASET_PREFIX", "snapshots") or "snapshots").strip("/")
    attempt = max(1, int(job.retry_count or 0) + 1)
    return f"{prefix}/{job.id}/attempt-{attempt}"


def _training_snapshot_prefix(snapshot_id: str) -> str:
    prefix = str(getattr(settings, "ML_TRAINING_DATASET_PREFIX", "training-snapshots") or "training-snapshots").strip("/")
    return f"{prefix}/{snapshot_id}"


def generate_and_upload_ml_input_datasets(job: MLJob) -> dict:
    """Generate required ML CSV datasets from live DB and upload to MinIO."""
    if not job.facility_id:
        raise ValueError("Global ML jobs are not supported by the current dataset generator.")

    hospitals = _active_healthcares()
    sales_rows = _build_sales_rows(hospitals)
    medicines_rows = _build_medicines_rows(hospitals, sales_rows)
    healthcares_rows = _build_healthcares_rows(hospitals)

    sales_bytes = _csv_bytes(headers=SALES_HEADERS, rows=sales_rows)
    medicines_bytes = _csv_bytes(headers=MEDICINES_HEADERS, rows=medicines_rows)
    healthcares_bytes = _csv_bytes(headers=HEALTHCARES_HEADERS, rows=healthcares_rows)

    client = _minio_client()
    bucket_name = str(getattr(settings, "ML_DATASET_BUCKET_NAME", "ml-input")).strip()
    if not bucket_name:
        raise ValueError("ML_DATASET_BUCKET_NAME must be configured.")

    _ensure_bucket_exists(client, bucket_name)
    prefix = _snapshot_prefix(job)

    sales_artifact = _upload_csv_object(
        client=client,
        bucket_name=bucket_name,
        object_key=f"{prefix}/{SALES_FILE_NAME}",
        file_name=SALES_FILE_NAME,
        content=sales_bytes,
        row_count=len(sales_rows),
    )
    medicines_artifact = _upload_csv_object(
        client=client,
        bucket_name=bucket_name,
        object_key=f"{prefix}/{MEDICINES_FILE_NAME}",
        file_name=MEDICINES_FILE_NAME,
        content=medicines_bytes,
        row_count=len(medicines_rows),
    )
    healthcares_artifact = _upload_csv_object(
        client=client,
        bucket_name=bucket_name,
        object_key=f"{prefix}/{HEALTHCARES_FILE_NAME}",
        file_name=HEALTHCARES_FILE_NAME,
        content=healthcares_bytes,
        row_count=len(healthcares_rows),
    )

    ground_truth_key = str(getattr(settings, "ML_OUTBREAK_GROUND_TRUTH_OBJECT_KEY", "")).strip("/")
    ground_truth_uri = None
    if ground_truth_key and _object_exists(client, bucket_name, ground_truth_key):
        ground_truth_uri = f"minio://{bucket_name}/{ground_truth_key}"

    manifest = {
        "generated_at": timezone.now().isoformat(),
        "job_id": str(job.id),
        "facility_id": str(job.facility_id),
        "snapshot_prefix": prefix,
        "snapshot_attempt": max(1, int(job.retry_count or 0) + 1),
        "lookback_days": int(getattr(settings, "ML_DATASET_LOOKBACK_DAYS", 90)),
        "source_tables": [
            "hospital",
            "requests_deliveryevent",
            "ml_dispense_log",
            "resources_resourcetransaction",
            "resources_resourcecatalog",
            "resources_resourceinventory",
        ],
        "files": {
            SALES_FILE_NAME: sales_artifact,
            MEDICINES_FILE_NAME: medicines_artifact,
            HEALTHCARES_FILE_NAME: healthcares_artifact,
        },
        "outbreaks_ground_truth": {
            "uri": ground_truth_uri,
            "managed_by": "admin",
            "auto_generated": False,
        },
    }

    manifest_bytes = io.BytesIO()
    manifest_bytes.write(json.dumps(manifest, sort_keys=True).encode("utf-8"))
    client.put_object(
        Bucket=bucket_name,
        Key=f"{prefix}/manifest.json",
        Body=manifest_bytes.getvalue(),
        ContentType="application/json",
    )

    logger.info(
        "ML input datasets uploaded for job %s (sales=%s medicines=%s healthcares=%s)",
        job.id,
        len(sales_rows),
        len(medicines_rows),
        len(healthcares_rows),
    )
    return manifest


def generate_and_upload_training_datasets(
    *,
    snapshot_id: str,
    model_type: str,
    date_from,
    date_to,
    schema_version: str = "v1",
    parameters: dict | None = None,
) -> dict:
    """Generate ML training CSV datasets for a selected date range and upload to MinIO."""
    hospitals = _active_healthcares()
    sales_rows = _build_sales_rows(
        hospitals,
        date_from=date_from,
        date_to=date_to,
        include_baseline=False,
    )
    medicines_rows = _build_medicines_rows(hospitals, sales_rows)
    healthcares_rows = _build_healthcares_rows(hospitals)

    sales_bytes = _csv_bytes(headers=SALES_HEADERS, rows=sales_rows)
    medicines_bytes = _csv_bytes(headers=MEDICINES_HEADERS, rows=medicines_rows)
    healthcares_bytes = _csv_bytes(headers=HEALTHCARES_HEADERS, rows=healthcares_rows)

    client = _minio_client()
    bucket_name = str(getattr(settings, "ML_DATASET_BUCKET_NAME", "ml-input")).strip()
    if not bucket_name:
        raise ValueError("ML_DATASET_BUCKET_NAME must be configured.")

    _ensure_bucket_exists(client, bucket_name)
    prefix = _training_snapshot_prefix(snapshot_id)

    sales_artifact = _upload_csv_object(
        client=client,
        bucket_name=bucket_name,
        object_key=f"{prefix}/{SALES_FILE_NAME}",
        file_name=SALES_FILE_NAME,
        content=sales_bytes,
        row_count=len(sales_rows),
    )
    medicines_artifact = _upload_csv_object(
        client=client,
        bucket_name=bucket_name,
        object_key=f"{prefix}/{MEDICINES_FILE_NAME}",
        file_name=MEDICINES_FILE_NAME,
        content=medicines_bytes,
        row_count=len(medicines_rows),
    )
    healthcares_artifact = _upload_csv_object(
        client=client,
        bucket_name=bucket_name,
        object_key=f"{prefix}/{HEALTHCARES_FILE_NAME}",
        file_name=HEALTHCARES_FILE_NAME,
        content=healthcares_bytes,
        row_count=len(healthcares_rows),
    )

    ground_truth_key = str(getattr(settings, "ML_OUTBREAK_GROUND_TRUTH_OBJECT_KEY", "")).strip("/")
    ground_truth_uri = None
    if ground_truth_key and _object_exists(client, bucket_name, ground_truth_key):
        ground_truth_uri = f"minio://{bucket_name}/{ground_truth_key}"

    manifest = {
        "generated_at": timezone.now().isoformat(),
        "snapshot_id": str(snapshot_id),
        "model_type": model_type,
        "date_range": {
            "from": date_from.isoformat(),
            "to": date_to.isoformat(),
        },
        "schema_version": schema_version or "v1",
        "row_count": len(sales_rows),
        "parameters": parameters or {},
        "snapshot_prefix": prefix,
        "source_tables": [
            "hospital",
            "requests_deliveryevent",
            "ml_dispense_log",
            "resources_resourcetransaction",
            "resources_resourcecatalog",
            "resources_resourceinventory",
        ],
        "files": {
            SALES_FILE_NAME: sales_artifact,
            MEDICINES_FILE_NAME: medicines_artifact,
            HEALTHCARES_FILE_NAME: healthcares_artifact,
        },
        "outbreaks_ground_truth": {
            "uri": ground_truth_uri,
            "managed_by": "admin",
            "auto_generated": False,
        },
    }

    manifest_bytes = io.BytesIO()
    manifest_bytes.write(json.dumps(manifest, sort_keys=True).encode("utf-8"))
    client.put_object(
        Bucket=bucket_name,
        Key=f"{prefix}/manifest.json",
        Body=manifest_bytes.getvalue(),
        ContentType="application/json",
    )

    logger.info(
        "ML training datasets uploaded for snapshot %s (sales=%s medicines=%s healthcares=%s)",
        snapshot_id,
        len(sales_rows),
        len(medicines_rows),
        len(healthcares_rows),
    )
    return manifest
