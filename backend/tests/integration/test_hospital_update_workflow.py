"""Integration tests for hospital-admin profile updates and sensitive change review workflow."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from apps.notifications.models import Notification


HOSPITALS_URL = "/api/v1/hospitals/"
MY_HOSPITAL_URL = "/api/v1/hospitals/my-hospital/"
MY_HOSPITAL_PROFILE_PICTURE_URL = "/api/v1/hospitals/my-hospital/profile-picture/"
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


def tiny_gif_upload(name="tiny.gif"):
    gif = (
        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
        b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00"
        b"\x00\x00\x01\x00\x01\x00\x00\x02\x02L\x01\x00;"
    )
    return SimpleUploadedFile(name, gif, content_type="image/gif")


@pytest.mark.django_db
class TestMyHospitalEndpoints:
    def test_hospital_admin_can_get_my_hospital(self, auth_client, hospital):
        response = auth_client.get(MY_HOSPITAL_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(hospital.id)

    def test_hospital_admin_can_patch_non_sensitive_fields_directly(self, auth_client, hospital):
        payload = {
            "needs_inventory_dashboard": True,
            "inventory_source_type": "CSV",
            "inventory_last_sync_source": "manual_patch",
        }
        response = auth_client.patch(MY_HOSPITAL_URL, payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["needs_inventory_dashboard"] is True
        assert data["inventory_source_type"] == "CSV"
        assert data["inventory_last_sync_source"] == "manual_patch"
        assert data["requiresApproval"] is False
        assert "pending_update_request" not in data

        hospital.refresh_from_db()
        assert hospital.needs_inventory_dashboard is True
        assert hospital.inventory_source_type == "CSV"

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
        assert data["requiresApproval"] is True
        assert data["status"] == "Pending"
        assert "pending_update_request" in data
        assert data["pending_update_request"]["status"] == "pending"

        hospital.refresh_from_db()
        assert hospital.email != "new-hospital-email@hospital.com"

    def test_hospital_admin_city_change_requires_approval(self, auth_client, hospital):
        response = auth_client.patch(MY_HOSPITAL_URL, {"city": "Requires Approval City"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["requiresApproval"] is True
        assert data["status"] == "Pending"
        assert "pending_update_request" in data

        hospital.refresh_from_db()
        assert hospital.city != "Requires Approval City"

    def test_invalid_latitude_rejected(self, auth_client):
        response = auth_client.patch(MY_HOSPITAL_URL, {"latitude": "95.000000"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "latitude" in response.json()["error"]["details"]

    def test_hospital_admin_cannot_patch_other_hospital_record(self, auth_client, hospital_b):
        response = auth_client.patch(hospital_url(hospital_b.id), {"city": "Blocked"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_hospital_admin_can_upload_profile_picture(self, auth_client, hospital):
        response = auth_client.post(
            MY_HOSPITAL_PROFILE_PICTURE_URL,
            {"logo": tiny_gif_upload()},
            format="multipart",
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()["data"]
        assert payload["logo"]
        assert payload["logo_url"]
        assert "minio:9000" not in payload["logo"]
        assert "minio:9000" not in payload["logo_url"]

        hospital.refresh_from_db()
        assert hospital.logo
        assert hospital.logo.name.startswith("hospitals/logos/")

    def test_hospital_admin_can_delete_profile_picture(self, auth_client, hospital):
        auth_client.post(
            MY_HOSPITAL_PROFILE_PICTURE_URL,
            {"logo": tiny_gif_upload()},
            format="multipart",
        )

        response = auth_client.delete(MY_HOSPITAL_PROFILE_PICTURE_URL)

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()["data"]
        assert payload["logo"] is None
        assert payload["logo_url"] is None

        hospital.refresh_from_db()
        assert not hospital.logo

    def test_hospital_profile_picture_upload_rejects_invalid_file(self, auth_client):
        bad_file = SimpleUploadedFile("not-image.txt", b"not-an-image", content_type="text/plain")
        response = auth_client.post(
            MY_HOSPITAL_PROFILE_PICTURE_URL,
            {"logo": bad_file},
            format="multipart",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "logo" in response.json()["error"]["details"]

    def test_unauthenticated_user_cannot_upload_hospital_profile_picture(self, api_client):
        response = api_client.post(
            MY_HOSPITAL_PROFILE_PICTURE_URL,
            {"logo": tiny_gif_upload()},
            format="multipart",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


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
        list_payload = list_response.json()["data"]
        ids = [item["id"] for item in list_payload]
        assert request_id in ids

        request_row = next(item for item in list_payload if item["id"] == request_id)
        assert request_row["current_requested_values"]["email"] == hospital.email
        assert request_row["current_requested_values"]["registration_number"] == hospital.registration_number

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

    def test_hospital_admin_can_list_and_retrieve_own_update_requests(
        self,
        hospital_admin_user,
        mocker,
    ):
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        submit_response = hospital_admin_client.patch(
            MY_HOSPITAL_URL,
            {
                "email": "history-own-view@hospital.com",
            },
            format="json",
        )
        assert submit_response.status_code == status.HTTP_200_OK
        request_id = submit_response.json()["data"]["pending_update_request"]["id"]

        list_response = hospital_admin_client.get(ADMIN_UPDATE_REQUESTS_URL)
        assert list_response.status_code == status.HTTP_200_OK
        ids = [item["id"] for item in list_response.json()["data"]]
        assert request_id in ids

        retrieve_response = hospital_admin_client.get(admin_update_request_url(request_id))
        assert retrieve_response.status_code == status.HTTP_200_OK
        assert retrieve_response.json()["data"]["id"] == request_id

    def test_hospital_admin_list_is_scoped_to_own_hospital(
        self,
        hospital_admin_user,
        hospital_b_admin_user,
        mocker,
    ):
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)
        hospital_b_admin_client = APIClient()
        hospital_b_admin_client.force_authenticate(user=hospital_b_admin_user)

        own_submit = hospital_admin_client.patch(
            MY_HOSPITAL_URL,
            {"email": "own-scope-update@hospital.com"},
            format="json",
        )
        assert own_submit.status_code == status.HTTP_200_OK
        own_request_id = own_submit.json()["data"]["pending_update_request"]["id"]

        other_submit = hospital_b_admin_client.patch(
            MY_HOSPITAL_URL,
            {"email": "other-scope-update@hospital.com"},
            format="json",
        )
        assert other_submit.status_code == status.HTTP_200_OK
        other_request_id = other_submit.json()["data"]["pending_update_request"]["id"]

        list_response = hospital_admin_client.get(ADMIN_UPDATE_REQUESTS_URL)
        assert list_response.status_code == status.HTTP_200_OK
        ids = [item["id"] for item in list_response.json()["data"]]
        assert own_request_id in ids
        assert other_request_id not in ids

        cross_hospital_retrieve = hospital_admin_client.get(admin_update_request_url(other_request_id))
        assert cross_hospital_retrieve.status_code == status.HTTP_404_NOT_FOUND

    def test_hospital_admin_cannot_approve_or_reject_update_request(
        self,
        hospital_admin_user,
        mocker,
    ):
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        submit_response = hospital_admin_client.patch(
            MY_HOSPITAL_URL,
            {
                "email": "cannot-review-own-request@hospital.com",
            },
            format="json",
        )
        assert submit_response.status_code == status.HTTP_200_OK
        request_id = submit_response.json()["data"]["pending_update_request"]["id"]

        approve_response = hospital_admin_client.post(admin_approve_url(request_id), {}, format="json")
        assert approve_response.status_code == status.HTTP_403_FORBIDDEN

        reject_response = hospital_admin_client.post(
            admin_reject_url(request_id),
            {"rejection_reason": "Not allowed"},
            format="json",
        )
        assert reject_response.status_code == status.HTTP_403_FORBIDDEN

    def test_non_hospital_admin_staff_cannot_access_admin_update_requests(self, staff_user):
        staff_client = APIClient()
        staff_client.force_authenticate(user=staff_user)

        response = staff_client.get(ADMIN_UPDATE_REQUESTS_URL)
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
