import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.hospitals.models import Hospital, HospitalOffboardingRequest


ADMIN_OFFBOARDING_URL = "/api/v1/admin/hospital-offboarding-requests/"


def hospital_offboarding_url(hospital_id):
    return f"/api/v1/hospitals/{hospital_id}/offboarding-request/"


def admin_offboarding_detail_url(request_id):
    return f"{ADMIN_OFFBOARDING_URL}{request_id}/"


def admin_offboarding_approve_url(request_id):
    return f"{ADMIN_OFFBOARDING_URL}{request_id}/approve/"


def admin_offboarding_reject_url(request_id):
    return f"{ADMIN_OFFBOARDING_URL}{request_id}/reject/"


@pytest.mark.django_db
class TestHospitalOffboardingSubmission:
    def test_hospital_admin_can_submit_for_own_hospital(self, auth_client, hospital):
        response = auth_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Service closure and merger with another provider."},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        payload = response.json()["data"]
        assert payload["status"] == HospitalOffboardingRequest.Status.PENDING
        assert payload["hospital"] == str(hospital.id)

    def test_hospital_admin_cannot_submit_for_other_hospital(self, auth_client, hospital_b):
        response = auth_client.post(
            hospital_offboarding_url(hospital_b.id),
            {"reason": "Unauthorized request."},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_super_admin_cannot_submit_offboarding_request(self, super_admin_client, hospital):
        response = super_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Should be hospital admin only."},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_duplicate_pending_request_is_blocked(self, auth_client, hospital):
        first = auth_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "First request."},
            format="json",
        )
        assert first.status_code == status.HTTP_201_CREATED

        second = auth_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Second request."},
            format="json",
        )
        assert second.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestAdminHospitalOffboardingReview:
    def test_super_admin_can_list_offboarding_requests(self, hospital_admin_user, super_admin_client, hospital):
        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_response = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Planned offboarding."},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED

        response = super_admin_client.get(ADMIN_OFFBOARDING_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["meta"]["total"] >= 1

    def test_non_super_admin_cannot_list_offboarding_requests(self, hospital_admin_user):
        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)
        response = hospital_admin_client.get(ADMIN_OFFBOARDING_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_super_admin_can_retrieve_offboarding_request(self, hospital_admin_user, super_admin_client, hospital):
        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_response = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Planned offboarding."},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        request_id = create_response.json()["data"]["id"]

        response = super_admin_client.get(admin_offboarding_detail_url(request_id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == request_id

    def test_super_admin_can_approve_and_offboard_hospital(
        self,
        hospital_admin_user,
        super_admin_client,
        hospital,
        pharmacist_user,
        resource_type,
    ):
        from apps.hospitals.models import HospitalAPIConfig
        from apps.resources.models import ResourceType

        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_response = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Hospital is shutting down operations."},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        request_id = create_response.json()["data"]["id"]

        resource_type_obj = ResourceType.objects.get(id=resource_type.id)
        HospitalAPIConfig.objects.create(
            hospital=hospital,
            resource_type=resource_type_obj,
            integration_type=HospitalAPIConfig.IntegrationType.API,
            api_endpoint="https://api.example.test/resources",
            auth_type=HospitalAPIConfig.AuthType.NONE,
            is_active=True,
        )

        approve_response = super_admin_client.post(
            admin_offboarding_approve_url(request_id),
            {"admin_notes": "Validated closure documents."},
            format="json",
        )
        assert approve_response.status_code == status.HTTP_200_OK
        assert approve_response.json()["data"]["status"] == HospitalOffboardingRequest.Status.APPROVED

        hospital.refresh_from_db()
        hospital_admin_user.refresh_from_db()
        pharmacist_user.refresh_from_db()

        assert hospital.verified_status == Hospital.VerifiedStatus.OFFBOARDED
        assert hospital_admin_user.is_active is False
        assert pharmacist_user.is_active is False
        assert not HospitalAPIConfig.objects.filter(hospital=hospital, is_active=True).exists()

    def test_approve_twice_is_rejected(self, hospital_admin_user, super_admin_client, hospital):
        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_response = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Hospital closure."},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        request_id = create_response.json()["data"]["id"]

        first_approve = super_admin_client.post(admin_offboarding_approve_url(request_id), {}, format="json")
        assert first_approve.status_code == status.HTTP_200_OK

        second_approve = super_admin_client.post(admin_offboarding_approve_url(request_id), {}, format="json")
        assert second_approve.status_code == status.HTTP_400_BAD_REQUEST

    def test_super_admin_can_reject_and_allow_resubmission(self, hospital_admin_user, super_admin_client, hospital):
        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_response = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Initial request."},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        request_id = create_response.json()["data"]["id"]

        reject_response = super_admin_client.post(
            admin_offboarding_reject_url(request_id),
            {"admin_notes": "Provide additional legal paperwork."},
            format="json",
        )
        assert reject_response.status_code == status.HTTP_200_OK
        assert reject_response.json()["data"]["status"] == HospitalOffboardingRequest.Status.REJECTED

        resubmit = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Resubmitted with required legal paperwork."},
            format="json",
        )
        assert resubmit.status_code == status.HTTP_201_CREATED

    def test_approve_is_blocked_when_unresolved_operations_exist(
        self,
        hospital_admin_user,
        super_admin_client,
        hospital,
        hospital_b,
        super_admin_user,
    ):
        from apps.shipments.models import Shipment

        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_response = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Planned closure."},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        request_id = create_response.json()["data"]["id"]

        Shipment.objects.create(
            origin_hospital=hospital,
            destination_hospital=hospital_b,
            status=Shipment.Status.PENDING,
            created_by=super_admin_user,
        )

        approve_response = super_admin_client.post(
            admin_offboarding_approve_url(request_id),
            {},
            format="json",
        )
        assert approve_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "unresolved" in approve_response.json()["error"]["details"]

    def test_offboarded_hospital_cannot_create_catalog_item(self, hospital_admin_user, super_admin_client, hospital):
        hospital_admin_client = APIClient()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_response = hospital_admin_client.post(
            hospital_offboarding_url(hospital.id),
            {"reason": "Hospital closure."},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        request_id = create_response.json()["data"]["id"]

        approve_response = super_admin_client.post(admin_offboarding_approve_url(request_id), {}, format="json")
        assert approve_response.status_code == status.HTTP_200_OK

        hospital_admin_user.refresh_from_db()
        hospital_admin_client.force_authenticate(user=hospital_admin_user)

        create_catalog = hospital_admin_client.post(
            "/api/v1/catalog/",
            {
                "resource_type": None,
                "name": "Offboarded hospital item",
                "unit_of_measure": "units",
                "is_shareable": True,
            },
            format="json",
        )

        assert create_catalog.status_code == status.HTTP_403_FORBIDDEN
