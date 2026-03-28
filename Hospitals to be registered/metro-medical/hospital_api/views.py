from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt

import jwt
import datetime
import json

# API user credentials used to obtain a JWT
API_USERNAME = "apiuser"
API_PASSWORD = "apipass"

# Secret for signing JWTs (development only)
JWT_SECRET = "metro-medical-jwt-secret"
JWT_ALGORITHM = "HS256"
JWT_EXP_SECONDS = 3600

RESOURCES = [
    {
        "code": "MED-ENX-40",
        "name": "Enoxaparin 40mg",
        "category": "medicine",
        "quantity_available": 190,
        "unit": "syringe",
        "last_updated": "2026-03-15T11:35:00Z",
    },
    {
        "code": "MED-ATV-20",
        "name": "Atorvastatin 20mg",
        "category": "medicine",
        "quantity_available": 760,
        "unit": "tablet",
        "last_updated": "2026-03-15T11:35:00Z",
    },
    {
        "code": "EQP-CT-128",
        "name": "CT Scanner 128-slice",
        "category": "equipment",
        "quantity_available": 2,
        "unit": "unit",
        "last_updated": "2026-03-15T11:35:00Z",
    },
    {
        "code": "EQP-DIA-20",
        "name": "Dialysis Machine",
        "category": "equipment",
        "quantity_available": 18,
        "unit": "unit",
        "last_updated": "2026-03-15T11:35:00Z",
    },
    {
        "code": "CON-SUT-3.0",
        "name": "Absorbable Sutures 3-0",
        "category": "consumable",
        "quantity_available": 980,
        "unit": "pack",
        "last_updated": "2026-03-15T11:35:00Z",
    },
    {
        "code": "DEV-DEF-AUTO",
        "name": "Automated External Defibrillator",
        "category": "device",
        "quantity_available": 11,
        "unit": "unit",
        "last_updated": "2026-03-15T11:35:00Z",
    },
]

BEDS = {
    "bed_total": 260,
    "bed_available": 33,
    "icu_total": 36,
    "icu_available": 5,
    "last_updated": "2026-03-15T11:35:00Z",
}

BLOOD_UNITS = [
    {"blood_group": "A+", "units_available": 14, "last_updated": "2026-03-15T11:35:00Z"},
    {"blood_group": "A-", "units_available": 3, "last_updated": "2026-03-15T11:35:00Z"},
    {"blood_group": "B+", "units_available": 18, "last_updated": "2026-03-15T11:35:00Z"},
    {"blood_group": "B-", "units_available": 4, "last_updated": "2026-03-15T11:35:00Z"},
    {"blood_group": "O+", "units_available": 29, "last_updated": "2026-03-15T11:35:00Z"},
    {"blood_group": "O-", "units_available": 6, "last_updated": "2026-03-15T11:35:00Z"},
    {"blood_group": "AB+", "units_available": 5, "last_updated": "2026-03-15T11:35:00Z"},
]

STAFF = [
    {
        "employee_id": "MMC-EMP-3101",
        "first_name": "Arif",
        "last_name": "Mahmud",
        "department": "Cardiology",
        "position": "Consultant Cardiologist",
        "email": "arif.mahmud@metromedical.example",
        "phone": "+8801700003101",
        "status": "active",
    },
    {
        "employee_id": "MMC-EMP-3102",
        "first_name": "Iffat",
        "last_name": "Karim",
        "department": "Nephrology",
        "position": "Dialysis Supervisor",
        "email": "iffat.karim@metromedical.example",
        "phone": "+8801700003102",
        "status": "active",
    },
    {
        "employee_id": "MMC-EMP-3103",
        "first_name": "Tanvir",
        "last_name": "Hasan",
        "department": "Radiology",
        "position": "Imaging Technologist",
        "email": "tanvir.hasan@metromedical.example",
        "phone": "+8801700003103",
        "status": "on_leave",
    },
]


def _is_authorized(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return False
    token = auth_header.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False
    # Optionally check subject
    return payload.get("sub") == API_USERNAME


def _unauthorized_response():
    return JsonResponse({"detail": "Unauthorized"}, status=401)


@csrf_exempt
@require_POST
def token(request):
    """Token endpoint: accepts JSON body {"username":"...","password":"..."}
    and returns a JWT access token when credentials match `API_USERNAME`/`API_PASSWORD`.
    """
    try:
        body = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"detail": "Invalid JSON"}, status=400)
    username = body.get("username")
    password = body.get("password")
    if username != API_USERNAME or password != API_PASSWORD:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)

    now = datetime.datetime.now(datetime.UTC)
    exp = now + datetime.timedelta(seconds=JWT_EXP_SECONDS)
    payload = {
        "sub": username,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return JsonResponse({"access_token": token, "token_type": "bearer", "expires_in": JWT_EXP_SECONDS})


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
