from django.http import JsonResponse
from django.views.decorators.http import require_GET

RESOURCES = [
    {
        "code": "MED-SAL-NS500",
        "name": "Normal Saline 500ml",
        "category": "medicine",
        "quantity_available": 540,
        "unit": "bag",
        "last_updated": "2026-03-15T11:40:00Z",
    },
    {
        "code": "MED-AZM-500",
        "name": "Azithromycin 500mg",
        "category": "medicine",
        "quantity_available": 230,
        "unit": "tablet",
        "last_updated": "2026-03-15T11:40:00Z",
    },
    {
        "code": "EQP-NEB-200",
        "name": "Nebulizer Machine",
        "category": "equipment",
        "quantity_available": 9,
        "unit": "unit",
        "last_updated": "2026-03-15T11:40:00Z",
    },
    {
        "code": "EQP-ECG-12L",
        "name": "12-Lead ECG Monitor",
        "category": "equipment",
        "quantity_available": 4,
        "unit": "unit",
        "last_updated": "2026-03-15T11:40:00Z",
    },
    {
        "code": "CON-GLV-STER",
        "name": "Sterile Surgical Gloves",
        "category": "consumable",
        "quantity_available": 1800,
        "unit": "pair",
        "last_updated": "2026-03-15T11:40:00Z",
    },
    {
        "code": "DEV-PUL-OX2",
        "name": "Pulse Oximeter",
        "category": "device",
        "quantity_available": 42,
        "unit": "unit",
        "last_updated": "2026-03-15T11:40:00Z",
    },
]

BEDS = {
    "bed_total": 140,
    "bed_available": 28,
    "icu_total": 20,
    "icu_available": 4,
    "last_updated": "2026-03-15T11:40:00Z",
}

BLOOD_UNITS = [
    {"blood_group": "A+", "units_available": 11, "last_updated": "2026-03-15T11:40:00Z"},
    {"blood_group": "A-", "units_available": 2, "last_updated": "2026-03-15T11:40:00Z"},
    {"blood_group": "B+", "units_available": 15, "last_updated": "2026-03-15T11:40:00Z"},
    {"blood_group": "B-", "units_available": 3, "last_updated": "2026-03-15T11:40:00Z"},
    {"blood_group": "O+", "units_available": 22, "last_updated": "2026-03-15T11:40:00Z"},
    {"blood_group": "O-", "units_available": 5, "last_updated": "2026-03-15T11:40:00Z"},
    {"blood_group": "AB+", "units_available": 4, "last_updated": "2026-03-15T11:40:00Z"},
    {"blood_group": "AB-", "units_available": 1, "last_updated": "2026-03-15T11:40:00Z"},
]

STAFF = [
    {
        "employee_id": "GVC-EMP-2101",
        "first_name": "Maliha",
        "last_name": "Jahan",
        "department": "Emergency",
        "position": "Duty Medical Officer",
        "email": "maliha.jahan@greenvalley.example",
        "phone": "+8801700002101",
        "status": "active",
    },
    {
        "employee_id": "GVC-EMP-2102",
        "first_name": "Rashed",
        "last_name": "Imam",
        "department": "Laboratory",
        "position": "Lab Technologist",
        "email": "rashed.imam@greenvalley.example",
        "phone": "+8801700002102",
        "status": "active",
    },
    {
        "employee_id": "GVC-EMP-2103",
        "first_name": "Samiha",
        "last_name": "Noor",
        "department": "Administration",
        "position": "Hospital Coordinator",
        "email": "samiha.noor@greenvalley.example",
        "phone": "+8801700002103",
        "status": "inactive",
    },
]


@require_GET
def inventory_resources(request):
    return JsonResponse({"resources": RESOURCES})


@require_GET
def beds(request):
    return JsonResponse(BEDS)


@require_GET
def blood(request):
    return JsonResponse({"blood_units": BLOOD_UNITS})


@require_GET
def staff(request):
    return JsonResponse({"staff": STAFF})
