from __future__ import annotations

import base64
import csv
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path


PATHS = [
    "/api/inventory/resources",
    "/api/beds",
    "/api/blood",
    "/api/staff",
    "/api/sales",
]

SALES_CSV_PATH = Path(__file__).resolve().parents[1] / "sales.csv"

HOSPITALS = [
    {
        "name": "city-general",
        "healthcare_id": "PH000",
        "base": "http://localhost:9001/mock-hospitals/city-general",
        "headers": {"X-API-Key": "city-general-api-key"},
        "auth_required": True,
    },
    {
        "name": "metro-medical",
        "healthcare_id": "PH005",
        "base": "http://localhost:9002/mock-hospitals/metro-medical",
        "headers": {"Authorization": "Bearer metro-medical-bearer-token"},
        "auth_required": True,
    },
    {
        "name": "sunrise-health",
        "healthcare_id": "PH011",
        "base": "http://localhost:9003/mock-hospitals/sunrise-health",
        "headers": {
            "Authorization": "Basic "
            + base64.b64encode(b"sunrise:password123").decode("ascii")
        },
        "auth_required": True,
    },
    {
        "name": "green-valley",
        "healthcare_id": "PH014",
        "base": "http://localhost:9004/mock-hospitals/green-valley",
        "headers": {},
        "auth_required": False,
    },
]


def fetch_json(url: str, headers: dict[str, str]) -> tuple[int, dict]:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = response.getcode()
            payload = json.loads(response.read().decode("utf-8"))
            return status, payload
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {"raw": body}
        return err.code, payload
    except urllib.error.URLError as err:
        reason = getattr(err, "reason", "unknown")
        return 0, {"detail": f"Connection error: {reason}"}


def parse_quantity(raw_value: str, context: str) -> int:
    try:
        quantity = int(raw_value)
    except (TypeError, ValueError) as err:
        raise ValueError(f"{context} has non-integer quantity_sold '{raw_value}'") from err
    if quantity < 0:
        raise ValueError(f"{context} has negative quantity_sold {quantity}")
    return quantity


def load_expected_sales() -> dict[str, list[dict[str, object]]]:
    required = ["date", "healthcare_id", "medicine_name", "quantity_sold", "upazila"]
    expected_by_healthcare: dict[str, list[dict[str, object]]] = {}

    try:
        with SALES_CSV_PATH.open("r", encoding="utf-8", newline="") as sales_file:
            reader = csv.DictReader(sales_file)
            fieldnames = reader.fieldnames or []
            missing = [field for field in required if field not in fieldnames]
            if missing:
                raise ValueError(f"sales.csv missing required columns: {', '.join(missing)}")

            for row_index, row in enumerate(reader, start=2):
                healthcare_id = row.get("healthcare_id", "").strip()
                quantity = parse_quantity(
                    row.get("quantity_sold", ""),
                    f"sales.csv line {row_index}",
                )
                normalized_row = {
                    "date": row.get("date", "").strip(),
                    "healthcare_id": healthcare_id,
                    "medicine_name": row.get("medicine_name", "").strip(),
                    "quantity_sold": quantity,
                    "upazila": row.get("upazila", "").strip(),
                }
                expected_by_healthcare.setdefault(healthcare_id, []).append(normalized_row)
    except OSError as err:
        raise ValueError(f"Unable to read sales.csv: {err}") from err
    except csv.Error as err:
        raise ValueError(f"Unable to parse sales.csv: {err}") from err

    return expected_by_healthcare


def has_fields(obj: dict, fields: list[str]) -> bool:
    return all(field in obj for field in fields)


def validate_inventory(payload: dict) -> bool:
    resources = payload.get("resources")
    if not isinstance(resources, list) or not resources:
        return False
    first = resources[0]
    required = ["code", "name", "category", "quantity_available", "unit", "last_updated"]
    if not isinstance(first, dict) or not has_fields(first, required):
        return False
    if not isinstance(first["quantity_available"], int):
        return False
    return first["quantity_available"] >= 0


def validate_beds(payload: dict) -> bool:
    required = ["bed_total", "bed_available", "icu_total", "icu_available", "last_updated"]
    if not has_fields(payload, required):
        return False
    int_fields = ["bed_total", "bed_available", "icu_total", "icu_available"]
    if not all(isinstance(payload[field], int) and payload[field] >= 0 for field in int_fields):
        return False
    if payload["bed_available"] > payload["bed_total"]:
        return False
    return payload["icu_available"] <= payload["icu_total"]


def validate_blood(payload: dict) -> bool:
    blood_units = payload.get("blood_units")
    if not isinstance(blood_units, list) or not blood_units:
        return False
    first = blood_units[0]
    required = ["blood_group", "units_available", "last_updated"]
    if not isinstance(first, dict) or not has_fields(first, required):
        return False
    return isinstance(first["units_available"], int) and first["units_available"] >= 0


def validate_staff(payload: dict) -> bool:
    staff = payload.get("staff")
    if not isinstance(staff, list) or not staff:
        return False
    first = staff[0]
    required = [
        "employee_id",
        "first_name",
        "last_name",
        "department",
        "position",
        "email",
        "phone",
        "status",
    ]
    return isinstance(first, dict) and has_fields(first, required)


def validate_sales(payload: dict) -> bool:
    sales = payload.get("sales")
    if not isinstance(sales, list) or not sales:
        return False

    required = ["date", "healthcare_id", "medicine_name", "quantity_sold", "upazila"]
    for row in sales:
        if not isinstance(row, dict) or not has_fields(row, required):
            return False
        if not isinstance(row["quantity_sold"], int) or row["quantity_sold"] < 0:
            return False
    return True


def normalize_sales_rows(rows: list[dict]) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for row in rows:
        normalized.append(
            {
                "date": str(row.get("date", "")).strip(),
                "healthcare_id": str(row.get("healthcare_id", "")).strip(),
                "medicine_name": str(row.get("medicine_name", "")).strip(),
                "quantity_sold": row.get("quantity_sold"),
                "upazila": str(row.get("upazila", "")).strip(),
            }
        )
    return normalized


def compare_sales_rows(
    expected_rows: list[dict[str, object]], actual_rows: list[dict[str, object]]
) -> tuple[bool, str]:
    if len(expected_rows) != len(actual_rows):
        return (
            False,
            f"expected {len(expected_rows)} rows, got {len(actual_rows)}",
        )

    for row_index, (expected, actual) in enumerate(zip(expected_rows, actual_rows), start=1):
        if expected != actual:
            return (
                False,
                f"row {row_index} mismatch expected={expected} actual={actual}",
            )

    return True, ""


def validate_payload(path: str, payload: dict) -> bool:
    if path == "/api/inventory/resources":
        return validate_inventory(payload)
    if path == "/api/beds":
        return validate_beds(payload)
    if path == "/api/blood":
        return validate_blood(payload)
    if path == "/api/staff":
        return validate_staff(payload)
    if path == "/api/sales":
        return validate_sales(payload)
    return False


def main() -> int:
    failures: list[str] = []
    passed: list[str] = []
    try:
        expected_sales_by_healthcare = load_expected_sales()
    except ValueError as err:
        print("API contract validation summary")
        print("passed=0")
        print("failed=1")
        print(f"FAIL: {err}")
        return 1

    for hospital in HOSPITALS:
        expected_sales = expected_sales_by_healthcare.get(hospital["healthcare_id"], [])
        if not expected_sales:
            failures.append(
                f"{hospital['name']}: no sales rows found in sales.csv for {hospital['healthcare_id']}"
            )

        for path in PATHS:
            url = f"{hospital['base']}{path}"
            if hospital["auth_required"]:
                status, _ = fetch_json(url, {})
                if status != 401:
                    failures.append(f"{hospital['name']} {path}: expected 401 without auth, got {status}")
                else:
                    passed.append(f"401 no-auth check {hospital['name']} {path}")

            status, payload = fetch_json(url, hospital["headers"])
            if status != 200:
                failures.append(f"{hospital['name']} {path}: expected 200 with auth, got {status}")
                continue

            if not validate_payload(path, payload):
                failures.append(f"{hospital['name']} {path}: schema validation failed")
                continue

            if path == "/api/sales":
                actual_sales = normalize_sales_rows(payload.get("sales", []))
                matched, details = compare_sales_rows(expected_sales, actual_sales)
                if not matched:
                    failures.append(f"{hospital['name']} {path}: {details}")
                    continue
                passed.append(f"200/schema/data check {hospital['name']} {path}")
                continue

            passed.append(f"200/schema check {hospital['name']} {path}")

    print("API contract validation summary")
    print(f"passed={len(passed)}")
    print(f"failed={len(failures)}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1

    for item in passed:
        print(f"PASS: {item}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
