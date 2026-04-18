"""Pytest configuration and shared fixtures for HRSP test suite."""
import itertools

import pytest
from django.contrib.auth import get_user_model

UserAccount = get_user_model()

STRICT_HOSPITAL_PERMISSION_CODES = (
    "hospital:update_request.submit",
    "hospital:update_request.view",
    "hospital:offboarding.request",
    "hospital:request.view",
    "hospital:resource_share.view",
    "hospital:payment.confirm",
    "hospital:payment.initiate",
    "hospital:payment.refund.initiate",
    "hospital:payment.refund.confirm",
    "hospital:payment.report.view",
    "hospital:payment.reconcile.manage",
    "hospital:request.expire",
    "share.request.create",
    "share.request.approve",
    "inventory.view",
    "inventory.batch.view",
    "inventory.cost.view",
    "sale.create",
    "sale.history.view",
)

STRICT_PLATFORM_PERMISSION_CODES = STRICT_HOSPITAL_PERMISSION_CODES + (
    "platform:hospital.manage",
    "platform:hospital.update.review",
    "platform:hospital.offboarding.review",
    "ml:training.manage",
    "ml:dataset.review",
    "ml:model_version.manage",
    "ml:model_version.activate",
)


def _permission_defaults(code: str) -> dict:
    return {
        "name": code,
        "description": f"Auto-seeded test permission for {code}",
    }


def _assign_hospital_role_permissions(hospital_role, permission_codes):
    from apps.staff.models import HospitalRolePermission, Permission

    for code in permission_codes:
        permission, _ = Permission.objects.get_or_create(code=code, defaults=_permission_defaults(code))
        HospitalRolePermission.objects.get_or_create(hospital_role=hospital_role, permission=permission)


def _assign_platform_role_permissions(platform_role, permission_codes):
    from apps.staff.models import Permission, PlatformRolePermission

    for code in permission_codes:
        permission, _ = Permission.objects.get_or_create(code=code, defaults=_permission_defaults(code))
        PlatformRolePermission.objects.get_or_create(platform_role=platform_role, permission=permission)


@pytest.fixture(autouse=True)
def sslcommerz_test_stubs(monkeypatch, settings):
    """Stub SSLCommerz network calls for deterministic, offline test execution."""
    settings.SSLCZ_STORE_ID = "test_store"
    settings.SSLCZ_STORE_PASSWORD = "test_password"
    settings.SSLCZ_TESTMODE = True
    settings.SSLCZ_LOCALHOST = "host.docker.internal"
    settings.SSLCZ_CALLBACK_BASE_URL = "http://backend:8080"
    settings.SSLCZ_REQUEST_TIMEOUT_SECONDS = 5

    from apps.requests import services as request_services

    counter = itertools.count(1)

    def _fake_create_session(payment, req, return_url="", cancel_url="", callback_base_url=""):
        idx = next(counter)
        tran_id = f"TESTTRAN{idx:04d}"
        redirect_url = f"https://sandbox.sslcommerz.com/session/{tran_id}"
        return {
            "tran_id": tran_id,
            "session_key": f"session-{tran_id.lower()}",
            "redirect_url": redirect_url,
            "request_payload": {
                "tran_id": tran_id,
                "return_url": return_url,
                "cancel_url": cancel_url,
                "callback_base_url": callback_base_url,
                "request_id": str(req.id),
                "payment_id": str(payment.id),
            },
            "response_payload": {
                "status": "SUCCESS",
                "GatewayPageURL": redirect_url,
                "sessionkey": f"session-{tran_id.lower()}",
            },
        }

    def _fake_validate_session(val_id):
        return {
            "status": "VALID",
            "val_id": str(val_id),
        }

    monkeypatch.setattr(request_services, "_sslcommerz_create_session", _fake_create_session)
    monkeypatch.setattr(request_services, "_sslcommerz_validate_session", _fake_validate_session)


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def hospital(db):
    from apps.hospitals.models import Hospital, HospitalCapacity
    h = Hospital.objects.create(
        name="Test Hospital",
        hospital_type="general",
        registration_number="REG-001",
        address="123 Main St",
        city="Test City",
        country="TC",
        email="test@hospital.com",
        phone="+1234567890",
        verified_status=Hospital.VerifiedStatus.VERIFIED,
    )
    HospitalCapacity.objects.create(hospital=h)
    return h


@pytest.fixture
def hospital_b(db):
    from apps.hospitals.models import Hospital, HospitalCapacity
    h = Hospital.objects.create(
        name="Second Hospital",
        hospital_type="general",
        registration_number="REG-002",
        address="456 Other St",
        city="Other City",
        country="TC",
        email="second@hospital.com",
        phone="+0987654321",
        verified_status=Hospital.VerifiedStatus.VERIFIED,
    )
    HospitalCapacity.objects.create(hospital=h)
    return h


@pytest.fixture
def pending_hospital(db):
    from apps.hospitals.models import Hospital, HospitalCapacity
    h = Hospital.objects.create(
        name="Pending Hospital",
        hospital_type="general",
        registration_number="REG-PENDING",
        address="789 Pending St",
        city="Test City",
        country="TC",
        email="pending@hospital.com",
        phone="+1111111111",
        verified_status=Hospital.VerifiedStatus.PENDING,
    )
    HospitalCapacity.objects.create(hospital=h)
    return h


@pytest.fixture
def super_admin_role(db):
    from apps.staff.models import Role
    role, _ = Role.objects.get_or_create(name="SUPER_ADMIN", defaults={"description": "Super admin"})
    return role


@pytest.fixture
def hospital_admin_role(db):
    from apps.staff.models import Role
    role, _ = Role.objects.get_or_create(name="HEALTHCARE_ADMIN", defaults={"description": "Healthcare admin"})
    return role


@pytest.fixture
def pharmacist_role(db):
    from apps.staff.models import Role
    role, _ = Role.objects.get_or_create(name="PHARMACIST", defaults={"description": "Pharmacist"})
    return role


@pytest.fixture
def logistics_role(db):
    from apps.staff.models import Role
    role, _ = Role.objects.get_or_create(name="LOGISTICS_STAFF", defaults={"description": "Logistics"})
    return role


@pytest.fixture
def role_assign_permission(db):
    from apps.staff.models import Permission

    permission, _ = Permission.objects.get_or_create(
        code="ROLE_ASSIGN",
        defaults={
            "name": "Assign Roles",
            "description": "Assign and revoke user roles.",
        },
    )
    return permission


@pytest.fixture
def role_permission_manage_permission(db):
    from apps.staff.models import Permission

    permission, _ = Permission.objects.get_or_create(
        code="ROLE_PERMISSION_MANAGE",
        defaults={
            "name": "Manage Role Permissions",
            "description": "Assign and revoke permissions for roles.",
        },
    )
    return permission


@pytest.fixture
def user_effective_permission_view_permission(db):
    from apps.staff.models import Permission

    permission, _ = Permission.objects.get_or_create(
        code="USER_EFFECTIVE_PERMISSION_VIEW",
        defaults={
            "name": "View Effective Permissions",
            "description": "View effective permissions for a user.",
        },
    )
    return permission


@pytest.fixture
def staff_member(db, hospital):
    from apps.staff.models import Staff
    return Staff.objects.create(
        hospital=hospital,
        first_name="John",
        last_name="Doe",
        employee_id="EMP-001",
        department="Pharmacy",
        position="Head Pharmacist",
    )


@pytest.fixture
def super_admin_user(db, super_admin_role):
    from apps.staff.models import PlatformRole, UserPlatformRole, UserRole
    # Super admin doesn't need a hospital
    user = UserAccount.objects.create_user(
        email="superadmin@hrsp.com",
        password="SuperAdmin123!",
        is_superuser=True,
        is_staff=True,
    )
    UserRole.objects.create(user=user, role=super_admin_role, hospital=None)
    platform_role, _ = PlatformRole.objects.get_or_create(
        name="SUPER_ADMIN",
        defaults={"description": "Super admin"},
    )
    UserPlatformRole.objects.get_or_create(user=user, platform_role=platform_role)
    _assign_platform_role_permissions(platform_role, STRICT_PLATFORM_PERMISSION_CODES)
    return user


@pytest.fixture
def hospital_admin_user(db, hospital, hospital_admin_role):
    from apps.staff.models import HospitalRole, Staff, UserHospitalRole, UserRole
    staff = Staff.objects.create(
        hospital=hospital,
        first_name="Admin",
        last_name="User",
        employee_id="ADM-001",
    )
    user = UserAccount.objects.create_user(
        email="admin@hospital.com",
        password="Admin123!",
        staff=staff,
    )
    UserRole.objects.create(user=user, role=hospital_admin_role, hospital=hospital)
    hospital_role, _ = HospitalRole.objects.get_or_create(
        hospital=hospital,
        name="HEALTHCARE_ADMIN",
        defaults={"description": "Healthcare admin"},
    )
    UserHospitalRole.objects.update_or_create(
        user=user,
        defaults={
            "hospital": hospital,
            "hospital_role": hospital_role,
            "assigned_by": None,
        },
    )
    _assign_hospital_role_permissions(hospital_role, STRICT_HOSPITAL_PERMISSION_CODES)
    return user


@pytest.fixture
def pharmacist_user(db, hospital, pharmacist_role):
    from apps.staff.models import HospitalRole, Staff, UserHospitalRole, UserRole
    staff = Staff.objects.create(
        hospital=hospital,
        first_name="Pharma",
        last_name="Cist",
        employee_id="PHR-001",
    )
    user = UserAccount.objects.create_user(
        email="pharmacist@hospital.com",
        password="Pharma123!",
        staff=staff,
    )
    UserRole.objects.create(user=user, role=pharmacist_role, hospital=hospital)
    hospital_role, _ = HospitalRole.objects.get_or_create(
        hospital=hospital,
        name="PHARMACIST",
        defaults={"description": "Pharmacist"},
    )
    UserHospitalRole.objects.update_or_create(
        user=user,
        defaults={
            "hospital": hospital,
            "hospital_role": hospital_role,
            "assigned_by": None,
        },
    )
    return user


@pytest.fixture
def hospital_b_admin_user(db, hospital_b, hospital_admin_role):
    """Hospital admin user belonging to hospital_b (the requesting hospital)."""
    from apps.staff.models import HospitalRole, Staff, UserHospitalRole, UserRole
    staff = Staff.objects.create(
        hospital=hospital_b,
        first_name="BAdmin",
        last_name="User",
        employee_id="ADM-002",
    )
    user = UserAccount.objects.create_user(
        email="admin@hospitalb.com",
        password="Admin123!",
        staff=staff,
    )
    UserRole.objects.create(user=user, role=hospital_admin_role, hospital=hospital_b)
    hospital_role, _ = HospitalRole.objects.get_or_create(
        hospital=hospital_b,
        name="HEALTHCARE_ADMIN",
        defaults={"description": "Healthcare admin"},
    )
    UserHospitalRole.objects.update_or_create(
        user=user,
        defaults={
            "hospital": hospital_b,
            "hospital_role": hospital_role,
            "assigned_by": None,
        },
    )
    _assign_hospital_role_permissions(hospital_role, STRICT_HOSPITAL_PERMISSION_CODES)
    return user


@pytest.fixture
def ml_engineer_user(db, hospital):
    from apps.staff.models import PlatformRole, Staff, UserPlatformRole

    staff = Staff.objects.create(
        hospital=hospital,
        first_name="Ml",
        last_name="Engineer",
        employee_id="ML-001",
    )
    user = UserAccount.objects.create_user(
        email="ml.engineer@hospital.com",
        password="MlEngineer123!",
        staff=staff,
    )

    ml_engineer_role, _ = PlatformRole.objects.get_or_create(
        name="ML_ENGINEER",
        defaults={"description": "ML engineer"},
    )
    UserPlatformRole.objects.get_or_create(user=user, platform_role=ml_engineer_role)

    return user


@pytest.fixture
def ml_engineer_client(ml_engineer_user):
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user=ml_engineer_user)
    return client


@pytest.fixture
def auth_client(api_client, hospital_admin_user):
    """API client authenticated as hospital admin (hospital)."""
    api_client.force_authenticate(user=hospital_admin_user)
    return api_client


@pytest.fixture
def hospital_b_auth_client(db):
    """API client authenticated as hospital_b admin — for cross-hospital requests."""
    from rest_framework.test import APIClient
    from apps.hospitals.models import Hospital, HospitalCapacity
    from apps.staff.models import HospitalRole, Role, Staff, UserHospitalRole, UserRole

    h_b = Hospital.objects.create(
        name="Requesting Hospital B",
        hospital_type="general",
        registration_number="REQ-B-001",
        address="789 Request St",
        city="Request City",
        country="TC",
        email="reqb@hospital.com",
        phone="+1112223333",
        verified_status=Hospital.VerifiedStatus.VERIFIED,
    )
    HospitalCapacity.objects.create(hospital=h_b)

    role, _ = Role.objects.get_or_create(name="HEALTHCARE_ADMIN", defaults={"description": "Healthcare admin"})
    staff = Staff.objects.create(
        hospital=h_b,
        first_name="RequesterB",
        last_name="Admin",
        employee_id="REQ-B-001",
    )
    user = UserAccount.objects.create_user(
        email="reqb_admin@hospital.com",
        password="Admin123!",
        staff=staff,
    )
    UserRole.objects.create(user=user, role=role, hospital=h_b)
    dual_role, _ = HospitalRole.objects.get_or_create(
        hospital=h_b,
        name="HEALTHCARE_ADMIN",
        defaults={"description": "Healthcare admin"},
    )
    UserHospitalRole.objects.update_or_create(
        user=user,
        defaults={
            "hospital": h_b,
            "hospital_role": dual_role,
            "assigned_by": None,
        },
    )
    _assign_hospital_role_permissions(dual_role, STRICT_HOSPITAL_PERMISSION_CODES)

    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def super_admin_client(api_client, super_admin_user):
    """API client authenticated as super admin."""
    api_client.force_authenticate(user=super_admin_user)
    return api_client


@pytest.fixture
def resource_type(db):
    from apps.resources.models import ResourceType
    rt, _ = ResourceType.objects.get_or_create(
        name="Medication",
        defaults={"description": "Drugs", "unit_of_measure": "units"},
    )
    return rt


@pytest.fixture
def hospital_registration_request(db):
    """A pending hospital registration request for testing the onboarding workflow."""
    from apps.hospitals.models import HospitalRegistrationRequest
    return HospitalRegistrationRequest.objects.create(
        name="Pending Reg Hospital",
        registration_number="REG-FIXTURE-001",
        email="fixture@regtest.com",
        admin_name="Fixture Admin",
        admin_email="fixture-admin@regtest.com",
        phone="+9999999999",
        address="1 Fixture Lane",
        city="Fixture City",
        state="FC",
        country="US",
        hospital_type="general",
    )


@pytest.fixture
def hospital_registration_request_with_api(db):
    """A pending hospital registration request with API integration fields."""
    from apps.hospitals.models import HospitalRegistrationRequest
    return HospitalRegistrationRequest.objects.create(
        name="API Reg Hospital",
        registration_number="REG-API-001",
        email="apifix@regtest.com",
        admin_name="API Fixture Admin",
        admin_email="api-fixture-admin@regtest.com",
        hospital_type="teaching",
        api_base_url="https://api.fixture.example.com",
        api_auth_type="none",
        api_key="",
    )



@pytest.fixture
def catalog_item(db, hospital, resource_type):
    from apps.resources.models import ResourceCatalog, ResourceInventory
    item = ResourceCatalog.objects.create(
        hospital=hospital,
        resource_type=resource_type,
        name="Amoxicillin 500mg",
        unit_of_measure="units",
        is_shareable=True,
    )
    ResourceInventory.objects.create(catalog_item=item, quantity_available=100)
    return item


@pytest.fixture
def resource_inventory(catalog_item):
    """Get the resource inventory associated with catalog_item."""
    return catalog_item.inventory


@pytest.fixture
def resource_share(db, hospital, catalog_item):
    """Create a resource share for the catalog item."""
    from apps.resources.models import ResourceShare
    return ResourceShare.objects.create(
        hospital=hospital,
        catalog_item=catalog_item,
        quantity_offered=50,
        status=ResourceShare.Status.ACTIVE,
    )


@pytest.fixture
def staff_user(db, hospital, pharmacist_role):
    """Create a non-admin staff user (e.g. pharmacist) for permission tests."""
    from apps.staff.models import HospitalRole, Staff, UserHospitalRole, UserRole
    staff = Staff.objects.create(
        hospital=hospital,
        first_name="Staff",
        last_name="Member",
        employee_id="STF-001",
    )
    user = UserAccount.objects.create_user(
        email="staff@hospital.com",
        password="Test@1234",
        staff=staff,
    )
    UserRole.objects.create(user=user, role=pharmacist_role, hospital=hospital)
    hospital_role, _ = HospitalRole.objects.get_or_create(
        hospital=hospital,
        name="PHARMACIST",
        defaults={"description": "Pharmacist"},
    )
    UserHospitalRole.objects.update_or_create(
        user=user,
        defaults={
            "hospital": hospital,
            "hospital_role": hospital_role,
            "assigned_by": None,
        },
    )
    return user
