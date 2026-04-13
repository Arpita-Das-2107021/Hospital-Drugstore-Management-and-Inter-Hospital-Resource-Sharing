import csv
import json
from functools import lru_cache
from pathlib import Path

from django.http import JsonResponse
from django.views.decorators.http import require_GET

PROFILE_PATH = Path(__file__).resolve().parent / "data" / "hospital_profile.json"
SALES_PATH_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "sales.csv",
    Path(__file__).resolve().parents[2] / "sales.csv",
]


@lru_cache(maxsize=1)
def _load_profile():
    with PROFILE_PATH.open("r", encoding="utf-8") as profile_file:
        return json.load(profile_file)


def _get_profile_or_error():
    try:
        return _load_profile(), None
    except FileNotFoundError:
        return None, JsonResponse({"detail": "Hospital profile data not found"}, status=500)
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Hospital profile data is invalid"}, status=500)


def _get_sales_or_error(healthcare_id):
    sales_path = next((path for path in SALES_PATH_CANDIDATES if path.exists()), None)
    if sales_path is None:
        return None, JsonResponse({"detail": "Sales data not found"}, status=500)

    sales_rows = []
    try:
        with sales_path.open("r", encoding="utf-8", newline="") as sales_file:
            reader = csv.DictReader(sales_file)
            for row in reader:
                if row.get("healthcare_id", "").strip() != healthcare_id:
                    continue
                quantity_sold = int(row.get("quantity_sold", ""))
                if quantity_sold < 0:
                    raise ValueError
                sales_rows.append(
                    {
                        "date": row.get("date", "").strip(),
                        "healthcare_id": healthcare_id,
                        "medicine_name": row.get("medicine_name", "").strip(),
                        "quantity_sold": quantity_sold,
                        "upazila": row.get("upazila", "").strip(),
                    }
                )
    except (OSError, csv.Error):
        return None, JsonResponse({"detail": "Sales data is unreadable"}, status=500)
    except ValueError:
        return None, JsonResponse(
            {"detail": "Sales data contains invalid quantity_sold values"}, status=500
        )

    return sales_rows, None


@require_GET
def inventory_resources(request):
    profile, error = _get_profile_or_error()
    if error:
        return error
    return JsonResponse({"resources": profile.get("resources", [])})


@require_GET
def beds(request):
    profile, error = _get_profile_or_error()
    if error:
        return error
    return JsonResponse(profile.get("beds", {}))


@require_GET
def blood(request):
    profile, error = _get_profile_or_error()
    if error:
        return error
    return JsonResponse({"blood_units": profile.get("blood_units", [])})


@require_GET
def staff(request):
    profile, error = _get_profile_or_error()
    if error:
        return error
    return JsonResponse({"staff": profile.get("staff", [])})


@require_GET
def sales(request):
    profile, error = _get_profile_or_error()
    if error:
        return error
    healthcare_id = str(profile.get("hospital", {}).get("healthcare_id", "")).strip()
    if not healthcare_id:
        return JsonResponse({"detail": "Hospital healthcare_id is missing"}, status=500)
    sales_rows, error = _get_sales_or_error(healthcare_id)
    if error:
        return error
    return JsonResponse({"sales": sales_rows})
