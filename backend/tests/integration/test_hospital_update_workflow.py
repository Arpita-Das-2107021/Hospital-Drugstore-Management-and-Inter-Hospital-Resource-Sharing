"""Integration tests for hospital-admin profile updates and sensitive change review workflow."""
import pytest
from rest_framework.test import APIClient
from rest_framework import status

from apps.notifications.models import Notification


HOSPITALS_URL = "/api/v1/hospitals/"
MY_HOSPITAL_URL = "/api/v1/hospitals/my-hospital/"
MAP_URL = "/api/v1/hospitals/map/"
ADMIN_UPDATE_REQUESTS_URL = "/api/v1/admin/hospital-update-requests/"


def hospital_url(pk):
    return f"{HOSPITALS_URL}{pk}/"


def admin_update_request_url(pk):
    return f"{ADMIN_UPDATE_REQUESTS_URL}{pk}/"


def admin_approve_url(pk):
    return f"{ADMIN_UPDATE_REQUESTS_URL}{pk}/approve/"


def admin_reject_url(pk):
    return f"{ADMIN_UPDATE_REQUESTS_URL}{pk}/reject/"


@pytest.mark.django_db
class TestMyHospitalEndpoints:
    def test_hospital_admin_can_get_my_hospital(self, auth_client, hospital):
        response = auth_client.get(MY_HOSPITAL_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(hospital.id)

    def test_hospital_admin_can_patch_non_sensitive_fields_directly(self, auth_client, hospital):
        payload = {
            "phone": "+19995551212",
            "city": "Updated City",
            "latitude": "23.810331",
            "longitude": "90.412521",
        }
        response = auth_client.patch(MY_HOSPITAL_URL, payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["city"] == "Updated City"
        assert data["phone"] == "+19995551212"
        assert "pending_update_request" not in data

        hospital.refresh_from_db()
        assert hospital.city == "Updated City"
        assert str(hospital.latitude) == "23.810331"

    def test_hospital_admin_sensitive_changes_create_pending_request(self, auth_client, hospital):
        payload = {
            "email": "new-hospital-email@hospital.com",
            "api_base_url": "https://integration.new-hospital.example",
            "api_auth_type": "api_key",
            "api_key": "sensitive-token",
        }
        response = auth_client.patch(MY_HOSPITAL_URL, payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["email"] == hospital.email
        assert "pending_update_request" in data
        assert data["pending_update_request"]["status"] == "pending"

        hospital.refresh_from_db()
        assert hospital.email != "new-hospital-email@hospital.com"

    def test_invalid_latitude_rejected(self, auth_client):
        response = auth_client.patch(MY_HOSPITAL_URL, {"latitude": "95.000000"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "latitude" in response.json()["error"]["details"]

    def test_hospital_admin_cannot_patch_other_hospital_record(self, auth_client, hospital_b):
        response = auth_client.patch(hospital_url(hospital_b.id), {"city": "Blocked"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAdminHospitalUpdateReview:
    def test_super_admin_can_list_and_approve_update_request(
        self,
        hospital_admin_user,
        super_admin_user,
        hospital,
        mocker,
    ):
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)
        super_admin_client = APIClient()
        super_admin_client.force_authenticate(user=super_admin_user)

        submit_response = hospital_admin_client.patch(
            MY_HOSPITAL_URL,
            {
                "email": "approved-email@hospital.com",
                "registration_number": "REG-APPROVE-100",
            },
            format="json",
        )
        assert submit_response.status_code == status.HTTP_200_OK
        request_id = submit_response.json()["data"]["pending_update_request"]["id"]

        list_response = super_admin_client.get(ADMIN_UPDATE_REQUESTS_URL)
        assert list_response.status_code == status.HTTP_200_OK
        ids = [item["id"] for item in list_response.json()["data"]]
        assert request_id in ids

        approve_response = super_admin_client.post(admin_approve_url(request_id))
        assert approve_response.status_code == status.HTTP_200_OK
        assert approve_response.json()["data"]["status"] == "approved"

        hospital.refresh_from_db()
        assert hospital.email == "approved-email@hospital.com"
        assert hospital.registration_number == "REG-APPROVE-100"

        assert Notification.objects.filter(
            user=hospital_admin_user,
            notification_type=Notification.NotificationType.SYSTEM,
            data__hospital_update_request_id=request_id,
        ).exists()

    def test_super_admin_can_reject_update_request_with_reason(
        self,
        hospital_admin_user,
        super_admin_user,
        hospital,
        mocker,
    ):
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)
        super_admin_client = APIClient()
        super_admin_client.force_authenticate(user=super_admin_user)

        submit_response = hospital_admin_client.patch(
            MY_HOSPITAL_URL,
            {"email": "will-not-apply@hospital.com"},
            format="json",
        )
        assert submit_response.status_code == status.HTTP_200_OK
        request_id = submit_response.json()["data"]["pending_update_request"]["id"]

        reject_response = super_admin_client.post(
            admin_reject_url(request_id),
            {"rejection_reason": "Domain ownership verification failed."},
            format="json",
        )
        assert reject_response.status_code == status.HTTP_200_OK
        assert reject_response.json()["data"]["status"] == "rejected"
        assert "Domain ownership verification failed." in reject_response.json()["data"]["rejection_reason"]

        hospital.refresh_from_db()
        assert hospital.email != "will-not-apply@hospital.com"

        assert Notification.objects.filter(
            user=hospital_admin_user,
            notification_type=Notification.NotificationType.SYSTEM,
            data__hospital_update_request_id=request_id,
        ).exists()

    def test_non_super_admin_cannot_access_admin_update_requests(self, auth_client):
        response = auth_client.get(ADMIN_UPDATE_REQUESTS_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestMapEndpoint:
    def test_map_returns_minimal_hospital_fields(self, auth_client, hospital):
        hospital.latitude = "23.700000"
        hospital.longitude = "90.400000"
        hospital.save(update_fields=["latitude", "longitude", "updated_at"])

        response = auth_client.get(MAP_URL)
        assert response.status_code == status.HTTP_200_OK
        first = response.json()["data"][0]
        assert set(first.keys()) == {"id", "name", "latitude", "longitude", "logo"}

    def test_map_excludes_hospitals_without_coordinates(self, auth_client, hospital):
        hospital.latitude = None
        hospital.longitude = None
        hospital.save(update_fields=["latitude", "longitude", "updated_at"])

        response = auth_client.get(MAP_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"] == []
