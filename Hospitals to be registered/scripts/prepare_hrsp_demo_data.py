from __future__ import annotations

import csv
import json
import math
import random
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class ApiHospitalConfig:
    slug: str
    hospital_name: str
    healthcare_id: str
    auth_type: str
    auth_details: str
    code_prefix: str
    stock_days: int
    bed_pressure: float
    staff_multiplier: float


ROOT = Path(__file__).resolve().parents[1]

MEDICINES_PATH = ROOT / "medicines.csv"
HEALTHCARES_PATH = ROOT / "healthcares.csv"
SALES_PATH = ROOT / "sales.csv"

CSV_CLIENTS_DIR = ROOT / "generated" / "csv_clients"
REPORTS_DIR = ROOT / "generated" / "reports"

API_HOSPITALS = [
    ApiHospitalConfig(
        slug="city-general",
        hospital_name="City General Hospital",
        healthcare_id="PH000",
        auth_type="api_key",
        auth_details="X-API-Key: city-general-api-key",
        code_prefix="CGH",
        stock_days=11,
        bed_pressure=1.08,
        staff_multiplier=1.12,
    ),
    ApiHospitalConfig(
        slug="metro-medical",
        hospital_name="Metro Medical Center",
        healthcare_id="PH005",
        auth_type="bearer",
        auth_details="Authorization: Bearer metro-medical-bearer-token",
        code_prefix="MMC",
        stock_days=12,
        bed_pressure=1.15,
        staff_multiplier=1.16,
    ),
    ApiHospitalConfig(
        slug="sunrise-health",
        hospital_name="Sunrise Health Hospital",
        healthcare_id="PH011",
        auth_type="basic",
        auth_details="username=sunrise, password=password123",
        code_prefix="SHH",
        stock_days=10,
        bed_pressure=1.02,
        staff_multiplier=1.05,
    ),
    ApiHospitalConfig(
        slug="green-valley",
        hospital_name="Green Valley Clinic",
        healthcare_id="PH014",
        auth_type="none",
        auth_details="No authentication",
        code_prefix="GVC",
        stock_days=9,
        bed_pressure=0.94,
        staff_multiplier=0.98,
    ),
]

BLOOD_GROUP_WEIGHTS = {
    "A+": 0.26,
    "A-": 0.05,
    "B+": 0.22,
    "B-": 0.04,
    "O+": 0.29,
    "O-": 0.06,
    "AB+": 0.07,
    "AB-": 0.01,
}

FIRST_NAMES = [
    "Nadia",
    "Fahim",
    "Tasnia",
    "Arif",
    "Iffat",
    "Tanvir",
    "Nafisa",
    "Jamil",
    "Farzana",
    "Maliha",
    "Rashed",
    "Samiha",
    "Adnan",
    "Lamia",
    "Shahriar",
    "Mehnaz",
    "Tariq",
    "Sadia",
    "Rafi",
    "Munira",
    "Ayman",
    "Jannat",
    "Nabil",
    "Tahsin",
    "Nusrat",
    "Rashid",
    "Afsana",
    "Rabbi",
    "Sharmeen",
    "Ishraq",
]

LAST_NAMES = [
    "Rahman",
    "Sarker",
    "Anwar",
    "Mahmud",
    "Karim",
    "Hasan",
    "Huq",
    "Hossain",
    "Kabir",
    "Jahan",
    "Imam",
    "Noor",
    "Chowdhury",
    "Khan",
    "Siddique",
    "Ahmed",
    "Islam",
    "Arefin",
    "Morshed",
    "Akter",
]

DEPARTMENT_ROLES = {
    "city-general": {
        "Emergency": ["Emergency Medical Officer", "Trauma Consultant"],
        "Internal Medicine": ["Consultant Physician", "Resident Doctor"],
        "Healthcare": ["Clinical Pharmacist", "Inventory Pharmacist"],
        "Logistics": ["Supply Chain Coordinator", "Procurement Officer"],
    },
    "metro-medical": {
        "Cardiology": ["Consultant Cardiologist", "Cardiac Registrar"],
        "Nephrology": ["Dialysis Supervisor", "Renal Medical Officer"],
        "Radiology": ["Imaging Specialist", "Radiology Technologist"],
        "Critical Care": ["ICU Consultant", "Critical Care Nurse"],
    },
    "sunrise-health": {
        "Neonatology": ["NICU Registrar", "Neonatal Specialist"],
        "Endocrinology": ["Endocrine Consultant", "Diabetes Educator"],
        "Pediatrics": ["Pediatric Medical Officer", "Pediatric Nurse"],
        "Biomedical": ["Biomedical Engineer", "Device Safety Officer"],
    },
    "green-valley": {
        "Family Medicine": ["Family Physician", "General Medical Officer"],
        "Outpatient": ["OPD Coordinator", "Duty Medical Officer"],
        "Healthcare": ["Dispensing Pharmacist", "Healthcare Assistant"],
        "Administration": ["Clinic Coordinator", "Admin Officer"],
    },
}


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def require_columns(file_path: Path, rows: list[dict[str, str]], required: list[str]) -> None:
    if not rows:
        raise ValueError(f"{file_path.name} is empty")
    missing = [col for col in required if col not in rows[0]]
    if missing:
        raise ValueError(f"{file_path.name} missing required columns: {', '.join(missing)}")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def medicine_code(name: str, index: int) -> str:
    compact = re.sub(r"[^A-Z0-9]", "", name.upper())
    return f"MED-{index:03d}-{compact[:6]}"


def infer_unit(medicine_name: str) -> str:
    lower = medicine_name.lower()
    if "sachet" in lower:
        return "sachet"
    if "syrup" in lower:
        return "bottle"
    if "vial" in lower or "injection" in lower:
        return "vial"
    if "capsule" in lower:
        return "capsule"
    return "tablet"


def parse_float(raw: str) -> float:
    return float(raw.strip())


def parse_int(raw: str) -> int:
    return int(raw.strip())


def last_updated_from_dates(dates: set[date]) -> str:
    if not dates:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    max_date = max(dates)
    return datetime(max_date.year, max_date.month, max_date.day, 23, 59, 59, tzinfo=timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )


def build_sales_indexes(
    sales_rows: list[dict[str, str]],
) -> tuple[
    dict[str, list[dict[str, str]]],
    dict[str, dict[str, list[int]]],
    dict[str, set[date]],
    dict[str, str],
]:
    sales_by_healthcare: dict[str, list[dict[str, str]]] = defaultdict(list)
    quantities_by_healthcare_medicine: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    dates_by_healthcare: dict[str, set[date]] = defaultdict(set)
    sales_zone_by_healthcare: dict[str, str] = {}

    for row in sales_rows:
        healthcare_id = row["healthcare_id"].strip()
        medicine_name = row["medicine_name"].strip()
        qty = parse_int(row["quantity_sold"])
        sale_date = datetime.strptime(row["date"].strip(), "%Y-%m-%d").date()

        sales_by_healthcare[healthcare_id].append(row)
        quantities_by_healthcare_medicine[healthcare_id][medicine_name].append(qty)
        dates_by_healthcare[healthcare_id].add(sale_date)
        sales_zone_by_healthcare.setdefault(healthcare_id, row["upazila"].strip())

    return sales_by_healthcare, quantities_by_healthcare_medicine, dates_by_healthcare, sales_zone_by_healthcare


def build_resource_and_inventory_rows(
    medicines_rows: list[dict[str, str]],
    medicine_quantities: dict[str, list[int]],
    day_count: int,
    stock_days: int,
    last_updated: str,
) -> tuple[list[dict[str, object]], list[dict[str, object]], float]:
    resources: list[dict[str, object]] = []
    inventory_rows: list[dict[str, object]] = []
    total_avg_daily = 0.0

    for idx, med in enumerate(medicines_rows, start=1):
        medicine_name = med["medicine_name"].strip()
        quantities = medicine_quantities.get(medicine_name, [])
        total_sold = sum(quantities)
        avg_daily = total_sold / day_count if day_count else 0.0

        base_daily = parse_float(med["base_daily_sales"])
        outbreak_multiplier = parse_float(med["outbreak_multiplier"])
        demand_blend = (avg_daily * 0.75) + (base_daily * 0.25)
        quantity_available = max(0, int(round(demand_blend * stock_days + (outbreak_multiplier * 2.0))))

        unit = infer_unit(medicine_name)
        code = medicine_code(medicine_name, idx)

        resources.append(
            {
                "code": code,
                "name": medicine_name,
                "category": "medicine",
                "quantity_available": quantity_available,
                "unit": unit,
                "last_updated": last_updated,
            }
        )

        inventory_rows.append(
            {
                "resource_code": code,
                "medicine_name": medicine_name,
                "category": "medicine",
                "unit": unit,
                "quantity_available": quantity_available,
                "avg_daily_demand": f"{avg_daily:.2f}",
                "total_quantity_sold": total_sold,
                "base_daily_sales": med["base_daily_sales"],
                "outbreak_multiplier": med["outbreak_multiplier"],
                "signals_disease": med["signals_disease"],
                "last_updated": last_updated,
            }
        )

        total_avg_daily += avg_daily

    return resources, inventory_rows, total_avg_daily


def build_beds(last_updated: str, demand_index: float, config: ApiHospitalConfig) -> dict[str, object]:
    base_total = 72 + (demand_index * 1.1 * config.bed_pressure) + (config.staff_multiplier * 22)
    bed_total = max(70, int(round(base_total)))
    icu_total = max(8, int(round(bed_total * 0.16)))

    rng = random.Random(f"{config.slug}-beds")
    bed_availability_ratio = 0.12 + (rng.random() * 0.14)
    icu_availability_ratio = max(0.08, bed_availability_ratio - 0.04)

    bed_available = min(bed_total, max(0, int(round(bed_total * bed_availability_ratio))))
    icu_available = min(icu_total, max(0, int(round(icu_total * icu_availability_ratio))))

    return {
        "bed_total": bed_total,
        "bed_available": bed_available,
        "icu_total": icu_total,
        "icu_available": icu_available,
        "last_updated": last_updated,
    }


def build_blood_units(last_updated: str, demand_index: float, config: ApiHospitalConfig) -> list[dict[str, object]]:
    rng = random.Random(f"{config.slug}-blood")
    total_units = int(round(42 + (demand_index * 0.35) + (config.staff_multiplier * 6)))

    blood_rows: list[dict[str, object]] = []
    for blood_group, weight in BLOOD_GROUP_WEIGHTS.items():
        variance = 0.92 + (rng.random() * 0.16)
        units = max(0, int(round(total_units * weight * variance)))
        blood_rows.append(
            {
                "blood_group": blood_group,
                "units_available": units,
                "last_updated": last_updated,
            }
        )

    return blood_rows


def build_staff(last_updated: str, config: ApiHospitalConfig, demand_index: float) -> list[dict[str, object]]:
    role_map = DEPARTMENT_ROLES[config.slug]
    departments = list(role_map.keys())

    staff_target = max(10, int(round(10 + (demand_index / 26.0) + (config.staff_multiplier * 3))))
    rng = random.Random(f"{config.slug}-staff")

    staff_rows: list[dict[str, object]] = []
    for idx in range(staff_target):
        department = departments[idx % len(departments)]
        positions = role_map[department]
        position = positions[(idx // len(departments)) % len(positions)]

        first_name = FIRST_NAMES[(idx + rng.randint(0, len(FIRST_NAMES) - 1)) % len(FIRST_NAMES)]
        last_name = LAST_NAMES[(idx * 2 + rng.randint(0, len(LAST_NAMES) - 1)) % len(LAST_NAMES)]

        status_roll = rng.random()
        if status_roll < 0.78:
            status = "active"
        elif status_roll < 0.91:
            status = "on_leave"
        else:
            status = "inactive"

        employee_id = f"{config.code_prefix}-EMP-{1001 + idx}"
        email = f"{first_name.lower()}.{last_name.lower()}.{idx + 1}@{config.slug}.hrsp.local"
        phone_suffix = 1000 + rng.randint(0, 8999)
        phone = f"+88017{phone_suffix:04d}{(idx + 1) % 10}"

        staff_rows.append(
            {
                "employee_id": employee_id,
                "first_name": first_name,
                "last_name": last_name,
                "department": department,
                "position": position,
                "email": email,
                "phone": phone,
                "status": status,
            }
        )

    return staff_rows


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: dict | list) -> None:
    ensure_directory(path.parent)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    ensure_directory(path.parent)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def generate_outputs() -> dict[str, object]:
    medicines_rows = read_csv_rows(MEDICINES_PATH)
    healthcares_rows = read_csv_rows(HEALTHCARES_PATH)
    sales_rows = read_csv_rows(SALES_PATH)

    require_columns(
        MEDICINES_PATH,
        medicines_rows,
        ["medicine_name", "base_daily_sales", "outbreak_multiplier", "signals_disease"],
    )
    require_columns(HEALTHCARES_PATH, healthcares_rows, ["healthcare_id", "name", "upazila", "lat", "lon"])
    require_columns(SALES_PATH, sales_rows, ["date", "healthcare_id", "medicine_name", "quantity_sold", "upazila"])

    healthcare_map = {row["healthcare_id"].strip(): row for row in healthcares_rows}

    (
        sales_by_healthcare,
        qty_by_healthcare_medicine,
        dates_by_healthcare,
        sales_zone_by_healthcare,
    ) = build_sales_indexes(sales_rows)

    api_hospital_ids = {cfg.healthcare_id for cfg in API_HOSPITALS}
    all_healthcare_ids = {row["healthcare_id"].strip() for row in healthcares_rows}

    unassigned_healthcares = sorted(all_healthcare_ids - api_hospital_ids)

    generated_api_profiles: dict[str, dict[str, object]] = {}

    for config in API_HOSPITALS:
        if config.healthcare_id not in healthcare_map:
            raise ValueError(f"Configured healthcare_id {config.healthcare_id} not found in healthcares.csv")

        healthcare = healthcare_map[config.healthcare_id]
        healthcare_sales_rows = sales_by_healthcare.get(config.healthcare_id, [])
        healthcare_dates = dates_by_healthcare.get(config.healthcare_id, set())
        day_count = max(1, len(healthcare_dates))
        last_updated = last_updated_from_dates(healthcare_dates)

        resources, _inventory_rows, demand_index = build_resource_and_inventory_rows(
            medicines_rows,
            qty_by_healthcare_medicine.get(config.healthcare_id, {}),
            day_count,
            config.stock_days,
            last_updated,
        )

        beds = build_beds(last_updated, demand_index, config)
        blood_units = build_blood_units(last_updated, demand_index, config)
        staff = build_staff(last_updated, config, demand_index)

        profile = {
            "hospital": {
                "name": config.hospital_name,
                "slug": config.slug,
                "healthcare_id": config.healthcare_id,
                "healthcare_name": healthcare["name"],
                "source_upazila": healthcare["upazila"],
                "sales_zone_upazila": sales_zone_by_healthcare.get(config.healthcare_id, ""),
                "auth_type": config.auth_type,
                "auth_details": config.auth_details,
            },
            "resources": resources,
            "beds": beds,
            "blood_units": blood_units,
            "staff": staff,
            "meta": {
                "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                "source_sales_rows": len(healthcare_sales_rows),
                "source_unique_days": day_count,
                "source_medicine_count": len(medicines_rows),
            },
        }

        profile_path = ROOT / config.slug / "hospital_api" / "data" / "hospital_profile.json"
        write_json(profile_path, profile)
        generated_api_profiles[config.slug] = profile

    generated_csv_clients: list[dict[str, object]] = []

    for idx, healthcare_id in enumerate(sorted(unassigned_healthcares), start=1):
        healthcare = healthcare_map[healthcare_id]
        healthcare_sales_rows = sales_by_healthcare.get(healthcare_id, [])
        healthcare_dates = dates_by_healthcare.get(healthcare_id, set())
        day_count = max(1, len(healthcare_dates))
        last_updated = last_updated_from_dates(healthcare_dates)

        stock_days = 8 + ((idx - 1) % 5)
        _resources, inventory_rows, _demand_index = build_resource_and_inventory_rows(
            medicines_rows,
            qty_by_healthcare_medicine.get(healthcare_id, {}),
            day_count,
            stock_days,
            last_updated,
        )

        client_slug = f"{healthcare_id.lower()}-{slugify(healthcare['name'])}"
        client_dir = CSV_CLIENTS_DIR / client_slug

        write_csv(
            client_dir / "inventory.csv",
            [
                "resource_code",
                "medicine_name",
                "category",
                "unit",
                "quantity_available",
                "avg_daily_demand",
                "total_quantity_sold",
                "base_daily_sales",
                "outbreak_multiplier",
                "signals_disease",
                "last_updated",
            ],
            inventory_rows,
        )

        write_csv(
            client_dir / "sales.csv",
            ["date", "healthcare_id", "medicine_name", "quantity_sold", "upazila"],
            healthcare_sales_rows,
        )

        metadata_row = {
            "hospital_id": f"HOSP-{healthcare_id}",
            "hospital_name": f"{healthcare['name']} Hospital",
            "source_healthcare_id": healthcare_id,
            "source_healthcare_name": healthcare["name"],
            "source_upazila": healthcare["upazila"],
            "sales_zone_upazila": sales_zone_by_healthcare.get(healthcare_id, ""),
            "lat": healthcare["lat"],
            "lon": healthcare["lon"],
            "data_start_date": min(healthcare_dates).isoformat() if healthcare_dates else "",
            "data_end_date": max(healthcare_dates).isoformat() if healthcare_dates else "",
            "source_sales_rows": len(healthcare_sales_rows),
            "source_medicine_count": len(medicines_rows),
        }

        write_csv(client_dir / "metadata.csv", list(metadata_row.keys()), [metadata_row])

        generated_csv_clients.append(
            {
                "client_slug": client_slug,
                "healthcare_id": healthcare_id,
                "hospital_name": metadata_row["hospital_name"],
                "sales_rows": len(healthcare_sales_rows),
            }
        )

    mapping_rows = []
    for cfg in API_HOSPITALS:
        healthcare = healthcare_map[cfg.healthcare_id]
        mapping_rows.append(
            {
                "hospital_slug": cfg.slug,
                "hospital_name": cfg.hospital_name,
                "healthcare_id": cfg.healthcare_id,
                "healthcare_name": healthcare["name"],
                "source_upazila": healthcare["upazila"],
                "sales_zone_upazila": sales_zone_by_healthcare.get(cfg.healthcare_id, ""),
                "auth_type": cfg.auth_type,
                "auth_details": cfg.auth_details,
            }
        )

    write_csv(
        REPORTS_DIR / "api_hospital_mapping.csv",
        [
            "hospital_slug",
            "hospital_name",
            "healthcare_id",
            "healthcare_name",
            "source_upazila",
            "sales_zone_upazila",
            "auth_type",
            "auth_details",
        ],
        mapping_rows,
    )

    generation_report = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": {
            "medicines_rows": len(medicines_rows),
            "healthcares_rows": len(healthcares_rows),
            "sales_rows": len(sales_rows),
        },
        "api_hospitals": mapping_rows,
        "csv_clients": generated_csv_clients,
    }

    write_json(REPORTS_DIR / "generation_report.json", generation_report)

    return {
        "all_healthcare_ids": all_healthcare_ids,
        "api_hospital_ids": api_hospital_ids,
        "csv_hospital_ids": set(unassigned_healthcares),
        "sales_by_healthcare": sales_by_healthcare,
        "generated_api_profiles": generated_api_profiles,
        "medicines_rows": medicines_rows,
    }


def validate_outputs(ctx: dict[str, object]) -> dict[str, object]:
    all_healthcare_ids: set[str] = ctx["all_healthcare_ids"]
    api_hospital_ids: set[str] = ctx["api_hospital_ids"]
    csv_hospital_ids: set[str] = ctx["csv_hospital_ids"]
    sales_by_healthcare: dict[str, list[dict[str, str]]] = ctx["sales_by_healthcare"]
    generated_api_profiles: dict[str, dict[str, object]] = ctx["generated_api_profiles"]
    medicines_rows: list[dict[str, str]] = ctx["medicines_rows"]

    overlap = sorted(api_hospital_ids & csv_hospital_ids)
    uncovered = sorted(all_healthcare_ids - (api_hospital_ids | csv_hospital_ids))

    leakage_issues: list[str] = []
    for folder in sorted(CSV_CLIENTS_DIR.glob("*/")):
        sales_path = folder / "sales.csv"
        if not sales_path.exists():
            leakage_issues.append(f"Missing sales.csv in {folder.name}")
            continue

        rows = read_csv_rows(sales_path)
        if not rows:
            leakage_issues.append(f"Empty sales.csv in {folder.name}")
            continue

        folder_healthcare_id = folder.name.split("-", 1)[0].upper()
        wrong_rows = [r for r in rows if r["healthcare_id"].strip() != folder_healthcare_id]
        if wrong_rows:
            leakage_issues.append(f"Data leakage in {folder.name}: {len(wrong_rows)} mismatched rows")

    medicine_names = {m["medicine_name"].strip() for m in medicines_rows}
    api_profile_issues: list[str] = []
    for slug, profile in generated_api_profiles.items():
        resources = profile["resources"]
        if len(resources) != len(medicine_names):
            api_profile_issues.append(f"{slug} has {len(resources)} resources; expected {len(medicine_names)}")

        invalid_names = [r["name"] for r in resources if r["name"] not in medicine_names]
        if invalid_names:
            api_profile_issues.append(f"{slug} has unknown medicines: {', '.join(invalid_names)}")

        beds = profile["beds"]
        if beds["bed_available"] > beds["bed_total"]:
            api_profile_issues.append(f"{slug} invalid beds availability")
        if beds["icu_available"] > beds["icu_total"]:
            api_profile_issues.append(f"{slug} invalid ICU availability")

    sales_rows_api = sum(len(sales_by_healthcare[pid]) for pid in api_hospital_ids)
    sales_rows_csv = sum(len(sales_by_healthcare[pid]) for pid in csv_hospital_ids)
    sales_rows_total = sum(len(rows) for rows in sales_by_healthcare.values())

    checks = {
        "healthcare_overlap": len(overlap) == 0,
        "all_healthcares_covered": len(uncovered) == 0,
        "csv_no_leakage": len(leakage_issues) == 0,
        "api_profile_schema_consistent": len(api_profile_issues) == 0,
        "sales_row_partition_consistent": sales_rows_total == (sales_rows_api + sales_rows_csv),
    }

    validation_report = {
        "validated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "checks": checks,
        "details": {
            "api_hospital_ids": sorted(api_hospital_ids),
            "csv_hospital_ids": sorted(csv_hospital_ids),
            "overlap": overlap,
            "uncovered": uncovered,
            "leakage_issues": leakage_issues,
            "api_profile_issues": api_profile_issues,
            "sales_rows": {
                "total": sales_rows_total,
                "api_hospitals": sales_rows_api,
                "csv_hospitals": sales_rows_csv,
            },
        },
        "valid": all(checks.values()),
    }

    write_json(REPORTS_DIR / "validation_report.json", validation_report)

    if not validation_report["valid"]:
        problems = []
        for key, value in checks.items():
            if not value:
                problems.append(key)
        raise RuntimeError(f"Validation failed: {', '.join(problems)}")

    return validation_report


def main() -> None:
    ensure_directory(CSV_CLIENTS_DIR)
    ensure_directory(REPORTS_DIR)

    context = generate_outputs()
    validate_outputs(context)

    print("HRSP demo data generation completed successfully.")
    print(f"API profiles generated: {len(API_HOSPITALS)}")
    print(f"CSV client groups generated: {len(context['csv_hospital_ids'])}")
    print(f"Reports: {(REPORTS_DIR / 'generation_report.json').as_posix()}")
    print(f"Validation: {(REPORTS_DIR / 'validation_report.json').as_posix()}")


if __name__ == "__main__":
    main()
