from django.http import JsonResponse
from django.views.decorators.http import require_GET

API_KEY = "city-general-api-key"

RESOURCES = [
    {
        "code": "MED-PCM-500",
        "name": "Paracetamol 500mg",
        "category": "medicine",
        "quantity_available": 1600,
        "unit": "tablet",
        "last_updated": "2026-03-15T11:50:00Z",
    },
    {
        "code": "MED-CTR-1G",
        "name": "Ceftriaxone 1g Injection",
        "category": "medicine",
        "quantity_available": 420,
        "unit": "vial",
        "last_updated": "2026-03-15T11:50:00Z",
    },
    {
        "code": "EQP-VNT-ICU",
        "name": "ICU Ventilator - Servo Air",
        "category": "equipment",
        "quantity_available": 14,
        "unit": "unit",
        "last_updated": "2026-03-15T11:50:00Z",
    },
    {
        "code": "EQP-INF-500",
        "name": "Infusion Pump",
        "category": "equipment",
        "quantity_available": 37,
        "unit": "unit",
        "last_updated": "2026-03-15T11:50:00Z",
    },
    {
        "code": "CON-N95-REG",
        "name": "N95 Respirator Mask",
        "category": "consumable",
        "quantity_available": 2800,
        "unit": "piece",
        "last_updated": "2026-03-15T11:50:00Z",
    },
    {
        "code": "DEV-USG-POC",
        "name": "Portable Ultrasound Scanner",
        "category": "device",
        "quantity_available": 6,
        "unit": "unit",
        "last_updated": "2026-03-15T11:50:00Z",
    },
]

BEDS = {
    "bed_total": 320,
    "bed_available": 46,
    "icu_total": 48,
    "icu_available": 9,
    "last_updated": "2026-03-15T11:50:00Z",
}

BLOOD_UNITS = [
    {"blood_group": "A+", "units_available": 19, "last_updated": "2026-03-15T11:50:00Z"},
    {"blood_group": "A-", "units_available": 4, "last_updated": "2026-03-15T11:50:00Z"},
    {"blood_group": "B+", "units_available": 26, "last_updated": "2026-03-15T11:50:00Z"},
    {"blood_group": "B-", "units_available": 6, "last_updated": "2026-03-15T11:50:00Z"},
    {"blood_group": "O+", "units_available": 38, "last_updated": "2026-03-15T11:50:00Z"},
    {"blood_group": "O-", "units_available": 8, "last_updated": "2026-03-15T11:50:00Z"},
    {"blood_group": "AB+", "units_available": 7, "last_updated": "2026-03-15T11:50:00Z"},
    {"blood_group": "AB-", "units_available": 2, "last_updated": "2026-03-15T11:50:00Z"},
]

STAFF = [
    {
        "employee_id": "CGH-EMP-1101",
        "first_name": "Nadia",
        "last_name": "Rahman",
        "department": "Pharmacy",
        "position": "Inventory Manager",
        "email": "nadia.rahman@citygeneral.example",
        "phone": "+8801700001101",
        "status": "active",
    },
    {
        "employee_id": "CGH-EMP-1102",
        "first_name": "Fahim",
        "last_name": "Sarker",
        "department": "Critical Care",
        "position": "ICU Charge Nurse",
        "email": "fahim.sarker@citygeneral.example",
        "phone": "+8801700001102",
        "status": "active",
    },
    {
        "employee_id": "CGH-EMP-1103",
        "first_name": "Tasnia",
        "last_name": "Anwar",
        "department": "Logistics",
        "position": "Supply Chain Coordinator",
        "email": "tasnia.anwar@citygeneral.example",
        "phone": "+8801700001103",
        "status": "on_leave",
    },
]


def _is_authorized(request):
    return request.headers.get("X-API-Key") == API_KEY or request.headers.get("X-API-KEY") == API_KEY


def _unauthorized_response():
    return JsonResponse({"detail": "Unauthorized"}, status=401)


@require_GET
def inventory_resources(request):
    if not _is_authorized(request):
        return _unauthorized_response()
    return JsonResponse({"resources": RESOURCES})


@require_GET
def beds(request):
    if not _is_authorized(request):
        return _unauthorized_response()
    return JsonResponse(BEDS)


@require_GET
def blood(request):
    if not _is_authorized(request):
        return _unauthorized_response()
    return JsonResponse({"blood_units": BLOOD_UNITS})


@require_GET
def staff(request):
    if not _is_authorized(request):
        return _unauthorized_response()
    return JsonResponse({"staff": STAFF})
