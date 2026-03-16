"""Integration tests for the hospitals API."""
import pytest
from rest_framework import status

HOSPITALS_URL = "/api/v1/hospitals/"


def hospital_url(pk):
    return f"{HOSPITALS_URL}{pk}/"


def verify_url(pk):
    return f"{HOSPITALS_URL}{pk}/verify/"


def suspend_url(pk):
    return f"{HOSPITALS_URL}{pk}/suspend/"


@pytest.mark.django_db
class TestHospitalList:
    def test_unauthenticated_cannot_list(self, api_client):
        response = api_client.get(HOSPITALS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_can_list(self, auth_client, hospital):
        response = auth_client.get(HOSPITALS_URL)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data

    def test_list_contains_created_hospital(self, auth_client, hospital):
        response = auth_client.get(HOSPITALS_URL)
        ids = [h["id"] for h in response.json()["data"]]
        assert str(hospital.id) in ids


@pytest.mark.django_db
class TestHospitalRetrieve:
    def test_retrieve_existing_hospital(self, auth_client, hospital):
        response = auth_client.get(hospital_url(hospital.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(hospital.id)

    def test_retrieve_nonexistent_hospital(self, auth_client):
        import uuid
        response = auth_client.get(hospital_url(uuid.uuid4()))
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestHospitalCreate:
    payload = {
        "name": "Integration Test Hospital",
        "registration_number": "INTEG-001",
        "hospital_type": "general",
        "email": "integ@hospital.com",
        "phone": "+15550001111",
        "address": "1 Test Ave",
        "city": "Testville",
        "state": "TS",
        "country": "US",
        "postal_code": "00001",
    }

    def test_super_admin_can_create(self, super_admin_client):
        response = super_admin_client.post(HOSPITALS_URL, self.payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["data"]["name"] == self.payload["name"]

    def test_non_super_admin_cannot_create(self, auth_client):
        response = auth_client.post(HOSPITALS_URL, self.payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_cannot_create(self, api_client):
        response = api_client.post(HOSPITALS_URL, self.payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestHospitalVerify:
    def test_super_admin_can_verify(self, super_admin_client, pending_hospital):
        response = super_admin_client.post(verify_url(pending_hospital.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["verified_status"] == "verified"

    def test_non_super_admin_cannot_verify(self, auth_client, hospital):
        response = auth_client.post(verify_url(hospital.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_verify_already_verified_returns_400(self, super_admin_client, hospital):
        super_admin_client.post(verify_url(hospital.id))
        response = super_admin_client.post(verify_url(hospital.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestHospitalSuspend:
    def test_super_admin_can_suspend(self, super_admin_client, hospital):
        response = super_admin_client.post(suspend_url(hospital.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["verified_status"] == "suspended"

    def test_non_super_admin_cannot_suspend(self, auth_client, hospital):
        response = auth_client.post(suspend_url(hospital.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestHospitalUpdate:
    def test_hospital_admin_can_update(self, auth_client, hospital):
        response = auth_client.patch(hospital_url(hospital.id), {"city": "UpdatedCity"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["city"] == "UpdatedCity"

    def test_super_admin_can_update(self, super_admin_client, hospital):
        response = super_admin_client.patch(hospital_url(hospital.id), {"city": "SACityUpdate"}, format="json")
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestHospitalCapacity:
    def test_get_capacity(self, auth_client, hospital):
        response = auth_client.get(f"{hospital_url(hospital.id)}capacity/")
        assert response.status_code == status.HTTP_200_OK
        assert "data" in response.json()

    def test_put_capacity(self, auth_client, hospital):
        response = auth_client.put(
            f"{hospital_url(hospital.id)}capacity/",
            {"bed_total": 200, "icu_total": 30},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["bed_total"] == 200


@pytest.mark.django_db
class TestHospitalStaffList:
    def test_list_hospital_staff(self, auth_client, hospital, staff_member):
        response = auth_client.get(f"{hospital_url(hospital.id)}staff/")
        assert response.status_code == status.HTTP_200_OK
        ids = [s["id"] for s in response.json()["data"]]
        assert str(staff_member.id) in ids

    def test_unauthenticated_denied(self, api_client, hospital):
        response = api_client.get(f"{hospital_url(hospital.id)}staff/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
