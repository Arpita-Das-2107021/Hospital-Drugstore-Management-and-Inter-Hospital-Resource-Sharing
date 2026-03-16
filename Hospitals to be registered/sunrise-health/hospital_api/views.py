import base64

from django.http import JsonResponse
from django.views.decorators.http import require_GET

BASIC_USERNAME = "sunrise"
BASIC_PASSWORD = "password123"

RESOURCES = [
    {
        "code": "MED-OMZ-20",
        "name": "Omeprazole 20mg",
        "category": "medicine",
        "quantity_available": 620,
        "unit": "capsule",
        "last_updated": "2026-03-15T11:45:00Z",
    },
    {
        "code": "MED-INS-LANT",
        "name": "Insulin Glargine",
        "category": "medicine",
        "quantity_available": 140,
        "unit": "pen",
        "last_updated": "2026-03-15T11:45:00Z",
    },
    {
        "code": "EQP-VNT-NICU",
        "name": "Neonatal Ventilator",
        "category": "equipment",
        "quantity_available": 5,
        "unit": "unit",
        "last_updated": "2026-03-15T11:45:00Z",
    },
    {
        "code": "EQP-INF-SMRT",
        "name": "Smart Infusion Pump",
        "category": "equipment",
        "quantity_available": 24,
        "unit": "unit",
        "last_updated": "2026-03-15T11:45:00Z",
    },
    {
        "code": "CON-IVC-18G",
        "name": "IV Cannula 18G",
        "category": "consumable",
        "quantity_available": 1300,
        "unit": "piece",
        "last_updated": "2026-03-15T11:45:00Z",
    },
    {
        "code": "DEV-POC-GLU",
        "name": "Point-of-Care Glucose Meter",
        "category": "device",
        "quantity_available": 30,
        "unit": "unit",
        "last_updated": "2026-03-15T11:45:00Z",
    },
]

BEDS = {
    "bed_total": 210,
    "bed_available": 31,
    "icu_total": 30,
    "icu_available": 6,
    "last_updated": "2026-03-15T11:45:00Z",
}

BLOOD_UNITS = [
    {"blood_group": "A+", "units_available": 16, "last_updated": "2026-03-15T11:45:00Z"},
    {"blood_group": "A-", "units_available": 2, "last_updated": "2026-03-15T11:45:00Z"},
    {"blood_group": "B+", "units_available": 19, "last_updated": "2026-03-15T11:45:00Z"},
    {"blood_group": "B-", "units_available": 5, "last_updated": "2026-03-15T11:45:00Z"},
    {"blood_group": "O+", "units_available": 33, "last_updated": "2026-03-15T11:45:00Z"},
    {"blood_group": "O-", "units_available": 7, "last_updated": "2026-03-15T11:45:00Z"},
    {"blood_group": "AB+", "units_available": 6, "last_updated": "2026-03-15T11:45:00Z"},
    {"blood_group": "AB-", "units_available": 2, "last_updated": "2026-03-15T11:45:00Z"},
]

STAFF = [
    {
        "employee_id": "SHH-EMP-4101",
        "first_name": "Nafisa",
        "last_name": "Huq",
        "department": "Neonatology",
        "position": "NICU Registrar",
        "email": "nafisa.huq@sunrisehealth.example",
        "phone": "+8801700004101",
        "status": "active",
    },
    {
        "employee_id": "SHH-EMP-4102",
        "first_name": "Jamil",
        "last_name": "Hossain",
        "department": "Biomedical",
        "position": "Biomedical Engineer",
        "email": "jamil.hossain@sunrisehealth.example",
        "phone": "+8801700004102",
        "status": "active",
    },
    {
        "employee_id": "SHH-EMP-4103",
        "first_name": "Farzana",
        "last_name": "Kabir",
        "department": "Pharmacy",
        "position": "Clinical Pharmacist",
        "email": "farzana.kabir@sunrisehealth.example",
        "phone": "+8801700004103",
        "status": "inactive",
    },
]


def _is_authorized(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Basic "):
        return False
    token = auth_header.split(" ", 1)[1].strip()
    try:
        decoded = base64.b64decode(token).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return False
    return decoded == f"{BASIC_USERNAME}:{BASIC_PASSWORD}"


def _unauthorized_response():
    response = JsonResponse({"detail": "Unauthorized"}, status=401)
    response["WWW-Authenticate"] = "Basic realm=\"Sunrise Health\""
    return response


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
