"""Pytest configuration and shared fixtures for HRSP test suite."""
import pytest
from django.contrib.auth import get_user_model

UserAccount = get_user_model()


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
    role, _ = Role.objects.get_or_create(name="HOSPITAL_ADMIN", defaults={"description": "Hospital admin"})
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
    from apps.staff.models import Staff, UserRole
    # Super admin doesn't need a hospital
    user = UserAccount.objects.create_user(
        email="superadmin@hrsp.com",
        password="SuperAdmin123!",
    )
    UserRole.objects.create(user=user, role=super_admin_role, hospital=None)
    return user


@pytest.fixture
def hospital_admin_user(db, hospital, hospital_admin_role):
    from apps.staff.models import Staff, UserRole
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
    return user


@pytest.fixture
def pharmacist_user(db, hospital, pharmacist_role):
    from apps.staff.models import Staff, UserRole
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
    return user


@pytest.fixture
def hospital_b_admin_user(db, hospital_b, hospital_admin_role):
    """Hospital admin user belonging to hospital_b (the requesting hospital)."""
    from apps.staff.models import Staff, UserRole
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
    return user


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
    from apps.staff.models import Role, Staff, UserRole

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

    role, _ = Role.objects.get_or_create(name="HOSPITAL_ADMIN", defaults={"description": "Hospital admin"})
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
    from apps.staff.models import Staff, UserRole
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
    return user
