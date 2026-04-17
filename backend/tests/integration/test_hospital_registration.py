"""
Integration tests for the two-step hospital registration and onboarding workflow.

Coverage:
    - POST /api/v1/hospital-registration/         (public, no auth)
    - GET  /api/v1/admin/hospital-registrations/  (SUPER_ADMIN)
    - GET  /api/v1/admin/hospital-registrations/{id}/
    - POST /api/v1/admin/hospital-registrations/{id}/approve/
    - POST /api/v1/admin/hospital-registrations/{id}/reject/
    - Full workflow: submit → approve → hospital created
    - Full workflow: submit → reject
    - Access gate: non-admin cannot access admin endpoints
    - Sync tasks dispatch for ACTIVE registrations
"""
import pytest
from rest_framework import status

REGISTRATION_URL = "/api/v1/hospital-registration/"
ADMIN_REGISTRATIONS_URL = "/api/v1/admin/hospital-registrations/"


def admin_registration_url(pk):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/"


def approve_url(pk):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/approve/"


def reject_url(pk):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/reject/"


def send_review_email_url(pk):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/send-review-email/"


def review_email_history_url(pk):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/review-email-history/"


def check_api_url(pk):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/check-api/"


def check_single_api_url(pk, api_name):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/check-api/{api_name}/"


def api_check_results_url(pk):
    return f"{ADMIN_REGISTRATIONS_URL}{pk}/api-check-results/"


VALID_REGISTRATION_PAYLOAD = {
    "name": "Integration Test Hospital",
    "registration_number": "REG-INT-0001",
    "email": "integ@registration.test",
    "admin_name": "Integration Admin",
    "admin_email": "integ-admin@registration.test",
    "phone": "+15550000001",
    "address": "42 Integration Ave",
    "city": "Test City",
    "state": "TC",
    "country": "US",
    "hospital_type": "general",
}


# ──────────────────────────────────────────────
# Step 1: Public Registration Submission
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestHospitalRegistrationSubmission:
    def test_unauthenticated_can_submit(self, api_client):
        response = api_client.post(REGISTRATION_URL, VALID_REGISTRATION_PAYLOAD, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["data"]["status"] == "pending_approval"
        assert data["data"]["name"] == VALID_REGISTRATION_PAYLOAD["name"]

    def test_authenticated_user_can_also_submit(self, auth_client):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": "REG-INT-AUTH-001",
            "email": "auth@submit.test",
            "admin_email": "auth-admin@submit.test",
        }
        response = auth_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_submission_returns_id_and_submitted_at(self, api_client):
        response = api_client.post(REGISTRATION_URL, VALID_REGISTRATION_PAYLOAD, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()["data"]
        assert "id" in data
        assert "submitted_at" in data

    def test_pending_registration_number_rejected_with_clear_message(self, api_client, hospital_registration_request):
        payload = {**VALID_REGISTRATION_PAYLOAD, "registration_number": hospital_registration_request.registration_number}
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        details = response.json()["error"]["details"]
        assert "registration_number" in details
        assert "already pending review" in str(details["registration_number"])

    def test_pending_admin_email_rejected_with_clear_message(self, api_client, hospital_registration_request):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "admin_email": hospital_registration_request.admin_email,
            "registration_number": "REG-NEWNUM-001",
        }
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        details = response.json()["error"]["details"]
        assert "admin_email" in details
        assert "already pending review" in str(details["admin_email"])

    def test_rejected_request_can_resubmit_same_email_and_registration_number(self, api_client, super_admin_client):
        initial_payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": "REG-REJECT-RESUBMIT-001",
            "email": "resubmit@registration.test",
            "admin_email": "resubmit-admin@registration.test",
        }
        submit_response = api_client.post(REGISTRATION_URL, initial_payload, format="json")
        assert submit_response.status_code == status.HTTP_201_CREATED

        registration_id = submit_response.json()["data"]["id"]
        reject_response = super_admin_client.post(
            reject_url(registration_id),
            {"rejection_reason": "Missing certificate"},
            format="json",
        )
        assert reject_response.status_code == status.HTTP_200_OK

        resubmit_response = api_client.post(REGISTRATION_URL, initial_payload, format="json")
        assert resubmit_response.status_code == status.HTTP_201_CREATED
        assert resubmit_response.json()["data"]["status"] == "pending_approval"

    def test_existing_hospital_registration_number_rejected_with_clear_message(self, api_client, hospital):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": hospital.registration_number,
            "email": "new-hospital-email@registration.test",
            "admin_email": "new-hospital-admin@registration.test",
        }
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        details = response.json()["error"]["details"]
        assert "registration_number" in details
        assert "already exists in the platform" in str(details["registration_number"])

    def test_missing_required_fields_rejected(self, api_client):
        response = api_client.post(REGISTRATION_URL, {"name": "Incomplete"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_submission_with_api_fields(self, api_client):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": "REG-API-INT-001",
            "email": "apiint@registration.test",
            "admin_email": "apiint-admin@registration.test",
            "api_base_url": "https://api.testhosp.com",
            "api_auth_type": "bearer",
        }
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["data"]["api_base_url"] == "https://api.testhosp.com"

    def test_submission_with_location_fields(self, api_client):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": "REG-LOC-001",
            "email": "loc@registration.test",
            "admin_email": "loc-admin@registration.test",
            "latitude": "23.810331",
            "longitude": "90.412521",
        }
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()["data"]
        assert data["latitude"] == "23.810331"
        assert data["longitude"] == "90.412521"

    def test_submission_with_location_fields_in_multipart(self, api_client):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": "REG-LOC-MP-001",
            "email": "loc-mp@registration.test",
            "admin_email": "loc-mp-admin@registration.test",
            "address": "Dhaka, Bangladesh",
            "latitude": "23.810331",
            "longitude": "90.412521",
        }
        response = api_client.post(REGISTRATION_URL, payload, format="multipart")
        assert response.status_code == status.HTTP_201_CREATED

        data = response.json()["data"]
        assert data["address"] == "Dhaka, Bangladesh"
        assert data["latitude"] == "23.810331"
        assert data["longitude"] == "90.412521"

    def test_submission_rejects_invalid_latitude(self, api_client):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": "REG-LAT-INVALID-001",
            "email": "lat-invalid@registration.test",
            "admin_email": "lat-invalid-admin@registration.test",
            "latitude": "120.000000",
        }
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "latitude" in response.json()["error"]["details"]

    def test_submission_rejects_invalid_longitude(self, api_client):
        payload = {
            **VALID_REGISTRATION_PAYLOAD,
            "registration_number": "REG-LON-INVALID-001",
            "email": "lon-invalid@registration.test",
            "admin_email": "lon-invalid-admin@registration.test",
            "longitude": "190.000000",
        }
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "longitude" in response.json()["error"]["details"]

    def test_cannot_get_list_via_registration_endpoint(self, api_client):
        """The public registration endpoint should not expose a list of registrations."""
        response = api_client.get(REGISTRATION_URL)
        # Either 405 (method not allowed) or 401 (if list requires auth)
        assert response.status_code in (status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


# ──────────────────────────────────────────────
# Step 2: Admin Review — List
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestAdminRegistrationList:
    def test_super_admin_can_list(self, super_admin_client, hospital_registration_request):
        response = super_admin_client.get(ADMIN_REGISTRATIONS_URL)
        assert response.status_code == status.HTTP_200_OK
        ids = [r["id"] for r in response.json()["data"]]
        assert str(hospital_registration_request.id) in ids

    def test_unauthenticated_cannot_list(self, api_client):
        response = api_client.get(ADMIN_REGISTRATIONS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_super_admin_cannot_list(self, auth_client):
        response = auth_client.get(ADMIN_REGISTRATIONS_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_filter_by_status(self, super_admin_client, hospital_registration_request):
        response = super_admin_client.get(ADMIN_REGISTRATIONS_URL + "?status=pending_approval")
        assert response.status_code == status.HTTP_200_OK
        results = response.json()["data"]
        for r in results:
            assert r["status"] == "pending_approval"

    def test_filter_by_active_status(self, super_admin_client, hospital_registration_request, super_admin_user):
        from apps.hospitals.services import approve_registration_request
        approve_registration_request(hospital_registration_request, super_admin_user)
        response = super_admin_client.get(ADMIN_REGISTRATIONS_URL + "?status=active")
        assert response.status_code == status.HTTP_200_OK
        results = response.json()["data"]
        for r in results:
            assert r["status"] == "active"


@pytest.mark.django_db
class TestAdminRegistrationRetrieve:
    def test_super_admin_can_retrieve(self, super_admin_client, hospital_registration_request):
        response = super_admin_client.get(admin_registration_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(hospital_registration_request.id)

    def test_non_super_admin_cannot_retrieve(self, auth_client, hospital_registration_request):
        response = auth_client.get(admin_registration_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_api_credentials_masked_in_response(self, super_admin_client, hospital_registration_request_with_api):
        response = super_admin_client.get(admin_registration_url(hospital_registration_request_with_api.id))
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        if data.get("api_key"):
            assert data["api_key"] == "***"


# ──────────────────────────────────────────────
# Step 2: Admin Review — Approve
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestAdminApproveRegistration:
    def test_super_admin_can_approve(self, super_admin_client, hospital_registration_request):
        response = super_admin_client.post(approve_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["registration_request"]["status"] == "active"
        assert "hospital" in data
        assert data["hospital"]["name"] == hospital_registration_request.name

    def test_approve_creates_hospital_record(self, super_admin_client, hospital_registration_request):
        from apps.hospitals.models import Hospital
        assert not Hospital.objects.filter(registration_number=hospital_registration_request.registration_number).exists()
        super_admin_client.post(approve_url(hospital_registration_request.id))
        assert Hospital.objects.filter(registration_number=hospital_registration_request.registration_number).exists()

    def test_approve_creates_hospital_capacity(self, super_admin_client, hospital_registration_request):
        from apps.hospitals.models import Hospital, HospitalCapacity
        super_admin_client.post(approve_url(hospital_registration_request.id))
        hospital = Hospital.objects.get(registration_number=hospital_registration_request.registration_number)
        assert HospitalCapacity.objects.filter(hospital=hospital).exists()

    def test_approve_creates_hospital_admin_user_with_role(self, super_admin_client, hospital_registration_request):
        from apps.authentication.models import UserAccount
        from apps.hospitals.models import Hospital
        from apps.staff.models import UserHospitalRole

        super_admin_client.post(approve_url(hospital_registration_request.id))

        hospital = Hospital.objects.get(registration_number=hospital_registration_request.registration_number)
        admin_user = UserAccount.objects.get(email=hospital_registration_request.admin_email)
        assert admin_user.staff is not None
        assert admin_user.staff.hospital_id == hospital.id
        assert not admin_user.has_usable_password()
        assignment = UserHospitalRole.objects.filter(user=admin_user).select_related("hospital_role", "hospital").first()
        assert assignment is not None
        assert assignment.hospital_id == hospital.id
        assert assignment.hospital_role.name == "HEALTHCARE_ADMIN"

    def test_approve_does_not_grant_hospital_admin_ml_permissions(self, super_admin_client, hospital_registration_request):
        from apps.hospitals.models import Hospital
        from apps.staff.models import HospitalRole

        super_admin_client.post(approve_url(hospital_registration_request.id))

        hospital = Hospital.objects.get(registration_number=hospital_registration_request.registration_number)
        admin_role = HospitalRole.objects.get(hospital=hospital, name="HEALTHCARE_ADMIN")
        assigned_codes = set(admin_role.role_permissions.values_list("permission__code", flat=True))

        assert {
            "ml:forecast.view",
            "ml:outbreak.view",
            "ml:schedule.manage",
            "ml:job.view",
            "ml:job.manage",
            "ml:facility.settings.manage",
            "ml:dataset.review",
            "ml:training.manage",
            "ml:model_version.manage",
            "ml:model_version.activate",
        }.isdisjoint(assigned_codes)

    def test_approve_grants_hospital_admin_request_and_transport_permissions(
        self,
        super_admin_client,
        hospital_registration_request,
    ):
        from apps.hospitals.models import Hospital
        from apps.staff.models import HospitalRole

        super_admin_client.post(approve_url(hospital_registration_request.id))

        hospital = Hospital.objects.get(registration_number=hospital_registration_request.registration_number)
        admin_role = HospitalRole.objects.get(hospital=hospital, name="HEALTHCARE_ADMIN")
        assigned_codes = set(admin_role.role_permissions.values_list("permission__code", flat=True))

        assert {
            "hospital:request.dispatch",
            "hospital:request.reserve",
            "hospital:request.transfer.confirm",
            "hospital:request.delivery.confirm",
            "hospital:request.return.verify",
            "hospital:request.expire",
            "hospital:transport.view",
            "hospital:transport.create",
            "hospital:transport.update",
            "hospital:transport.assign",
            "hospital:transport.track",
            "share.request.create",
            "share.request.approve",
            "inventory.batch.view",
            "inventory.cost.view",
        }.issubset(assigned_codes)

    def test_approve_creates_default_staff_role_template(self, super_admin_client, hospital_registration_request):
        from apps.hospitals.models import Hospital
        from apps.staff.models import HospitalRole

        super_admin_client.post(approve_url(hospital_registration_request.id))

        hospital = Hospital.objects.get(registration_number=hospital_registration_request.registration_number)
        staff_role = HospitalRole.objects.filter(hospital=hospital, name="STAFF").first()
        assert staff_role is not None

        assigned_codes = set(staff_role.role_permissions.values_list("permission__code", flat=True))
        assert assigned_codes == {
            "hospital:inventory.view",
            "hospital:resource_share.view",
            "communication:chat.view",
            "communication:conversation.view",
        }

    def test_approve_sends_password_setup_email_with_frontend_reset_link(
        self,
        super_admin_client,
        hospital_registration_request,
        settings,
        mocker,
        django_capture_on_commit_callbacks,
    ):
        settings.FRONTEND_URL = "http://localhost:3000"
        mocked_send = mocker.patch("apps.authentication.services.send_email", return_value=True)

        with django_capture_on_commit_callbacks(execute=True):
            response = super_admin_client.post(approve_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_200_OK
        assert mocked_send.called

        _, kwargs = mocked_send.call_args
        assert kwargs["recipient_list"] == [hospital_registration_request.admin_email]
        assert "Your hospital registration is approved" in kwargs["subject"]
        assert "http://localhost:3000/reset-password?token=" in kwargs["message"]

    def test_approve_with_api_fields_still_succeeds(self, super_admin_client, hospital_registration_request_with_api):
        """Approval with api fields should succeed; sync happens via background tasks."""
        from apps.hospitals.models import Hospital
        response = super_admin_client.post(approve_url(hospital_registration_request_with_api.id))
        assert response.status_code == status.HTTP_200_OK
        assert Hospital.objects.filter(registration_number=hospital_registration_request_with_api.registration_number).exists()
        hospital_payload = response.json()["data"]["hospital"]
        assert hospital_payload["advanced_integration_eligible"] is False
        assert hospital_payload["schema_contract_status"] == "unchecked"

    def test_approve_after_successful_contract_check_marks_hospital_advanced_eligible(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        class _Response:
            def __init__(self, payload, status_code=200):
                self._payload = payload
                self.status_code = status_code

            def json(self):
                return self._payload

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception("http error")

        payload_by_url = {
            "https://api.fixture.example.com/healthcheck": {"status": "ok"},
            "https://api.fixture.example.com/api/resources": {"resources": []},
            "https://api.fixture.example.com/api/beds": {"bed_total": 40, "bed_available": 8},
            "https://api.fixture.example.com/api/resources/blood": {"blood_units": []},
            "https://api.fixture.example.com/api/staff": {"staff": []},
            "https://api.fixture.example.com/api/sales": {"sales": []},
        }

        def _fake_get(url, headers=None, timeout=15, auth=None):  # noqa: ARG001
            if url not in payload_by_url:
                raise AssertionError(f"Unexpected url: {url}")
            return _Response(payload_by_url[url])

        mocker.patch("requests.get", side_effect=_fake_get)

        check_response = super_admin_client.post(
            check_api_url(hospital_registration_request_with_api.id),
            {},
            format="json",
        )
        assert check_response.status_code == status.HTTP_200_OK
        assert check_response.json()["data"]["contract_enforcement"]["status"] == "passed"

        approve_response = super_admin_client.post(approve_url(hospital_registration_request_with_api.id))
        assert approve_response.status_code == status.HTTP_200_OK
        hospital_payload = approve_response.json()["data"]["hospital"]
        assert hospital_payload["advanced_integration_eligible"] is True
        assert hospital_payload["schema_contract_status"] == "passed"

    def test_approve_copies_location_fields_to_hospital(self, super_admin_client, hospital_registration_request):
        from apps.hospitals.models import Hospital

        hospital_registration_request.latitude = "23.810331"
        hospital_registration_request.longitude = "90.412521"
        hospital_registration_request.save(
            update_fields=[
                "latitude",
                "longitude",
                "updated_at",
            ]
        )

        response = super_admin_client.post(approve_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_200_OK

        hospital = Hospital.objects.get(registration_number=hospital_registration_request.registration_number)
        assert str(hospital.latitude) == "23.810331"
        assert str(hospital.longitude) == "90.412521"

    def test_approve_already_approved_returns_error(self, super_admin_client, hospital_registration_request):
        super_admin_client.post(approve_url(hospital_registration_request.id))
        response = super_admin_client.post(approve_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_approve_rejected_request_returns_error(self, super_admin_client, hospital_registration_request):
        super_admin_client.post(reject_url(hospital_registration_request.id), {"rejection_reason": "bad"}, format="json")
        response = super_admin_client.post(approve_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_super_admin_cannot_approve(self, auth_client, hospital_registration_request):
        response = auth_client.post(approve_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_cannot_approve(self, api_client, hospital_registration_request):
        response = api_client.post(approve_url(hospital_registration_request.id))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ──────────────────────────────────────────────
# Step 2: Admin Review — Reject
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestAdminRejectRegistration:
    def test_super_admin_can_reject(self, super_admin_client, hospital_registration_request):
        response = super_admin_client.post(
            reject_url(hospital_registration_request.id),
            {"rejection_reason": "Missing required certifications."},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["status"] == "rejected"
        assert data["rejection_reason"] == "Missing required certifications."

    def test_reject_without_reason_still_works(self, super_admin_client, hospital_registration_request):
        response = super_admin_client.post(reject_url(hospital_registration_request.id), {}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["status"] == "rejected"

    def test_reject_does_not_create_hospital(self, super_admin_client, hospital_registration_request):
        from apps.hospitals.models import Hospital
        super_admin_client.post(
            reject_url(hospital_registration_request.id),
            {"rejection_reason": "Rejected"},
            format="json",
        )
        assert not Hospital.objects.filter(registration_number=hospital_registration_request.registration_number).exists()

    def test_reject_already_rejected_returns_error(self, super_admin_client, hospital_registration_request):
        super_admin_client.post(reject_url(hospital_registration_request.id), {}, format="json")
        response = super_admin_client.post(reject_url(hospital_registration_request.id), {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reject_approved_request_returns_error(self, super_admin_client, hospital_registration_request):
        super_admin_client.post(approve_url(hospital_registration_request.id))
        response = super_admin_client.post(reject_url(hospital_registration_request.id), {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_super_admin_cannot_reject(self, auth_client, hospital_registration_request):
        response = auth_client.post(reject_url(hospital_registration_request.id), {}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_cannot_reject(self, api_client, hospital_registration_request):
        response = api_client.post(reject_url(hospital_registration_request.id), {}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ──────────────────────────────────────────────
# Step 2: Admin Review - Send Review Email
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestAdminRegistrationReviewEmail:
    def test_super_admin_can_send_review_email(self, super_admin_client, hospital_registration_request, mocker):
        mocked_send = mocker.patch("apps.hospitals.services.send_email", return_value=True)

        payload = {
            "subject": "Registration Review Required",
            "message": "Your Staff API is not responding correctly. Please update and resubmit.",
            "issue_type": "API_VALIDATION",
            "failed_apis": ["staff", "sales"],
            "mark_changes_requested": True,
        }
        response = super_admin_client.post(
            send_review_email_url(hospital_registration_request.id),
            payload,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["review_email"]["recipient_email"] == hospital_registration_request.admin_email
        assert data["review_email"]["issue_type"] == "API_VALIDATION"
        assert data["review_email"]["failed_apis"] == ["staff", "sales"]
        assert data["review_email"]["changes_requested_marked"] is True

        mocked_send.assert_called_once()
        assert mocked_send.call_args.kwargs["recipient_list"] == [hospital_registration_request.admin_email]

        hospital_registration_request.refresh_from_db()
        assert hospital_registration_request.status == "pending_approval"
        assert hospital_registration_request.rejection_reason == payload["message"]
        assert hospital_registration_request.reviewed_at is not None

    def test_non_super_admin_cannot_send_review_email(self, auth_client, hospital_registration_request):
        response = auth_client.post(
            send_review_email_url(hospital_registration_request.id),
            {
                "subject": "Review",
                "message": "Fix endpoint",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_cannot_send_review_email_for_active_registration(
        self,
        super_admin_client,
        hospital_registration_request,
        super_admin_user,
        mocker,
    ):
        from apps.hospitals.services import approve_registration_request

        mocker.patch("apps.authentication.services.send_email", return_value=True)
        approve_registration_request(hospital_registration_request, super_admin_user)

        response = super_admin_client.post(
            send_review_email_url(hospital_registration_request.id),
            {
                "subject": "Review",
                "message": "Fix endpoint",
                "issue_type": "GENERAL",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_super_admin_can_get_review_email_history(self, super_admin_client, hospital_registration_request, mocker):
        mocked_send = mocker.patch("apps.hospitals.services.send_email", return_value=True)

        response = super_admin_client.post(
            send_review_email_url(hospital_registration_request.id),
            {
                "subject": "Registration Review Required",
                "message": "Resources API is not responding.",
                "issue_type": "API_VALIDATION",
                "failed_apis": ["resources"],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert mocked_send.called

        history_response = super_admin_client.get(review_email_history_url(hospital_registration_request.id))
        assert history_response.status_code == status.HTTP_200_OK
        history = history_response.json()["data"]["history"]
        assert len(history) >= 1
        assert history[0]["event_type"] == "registration_review_email_sent"
        assert history[0]["metadata"]["issue_type"] == "API_VALIDATION"


@pytest.mark.django_db
class TestAdminRegistrationApiChecks:
    def test_super_admin_can_check_all_registration_apis(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        class _Response:
            def __init__(self, payload, status_code=200):
                self._payload = payload
                self.status_code = status_code

            def json(self):
                return self._payload

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception("http error")

        payload_by_url = {
            "https://api.fixture.example.com/healthcheck": {"status": "ok", "build": "2026.04.01"},
            "https://api.fixture.example.com/api/resources": {"resources": [], "custom_tracking_key": "v1"},
            "https://api.fixture.example.com/api/beds": {"bed_total": 40, "bed_available": 8},
            "https://api.fixture.example.com/api/resources/blood": {"blood_units": []},
            "https://api.fixture.example.com/api/staff": {"staff": []},
            "https://api.fixture.example.com/api/sales": {"sales": []},
        }

        def _fake_get(url, headers=None, timeout=15, auth=None):  # noqa: ARG001
            if url not in payload_by_url:
                raise AssertionError(f"Unexpected url: {url}")
            return _Response(payload_by_url[url])

        mocker.patch("requests.get", side_effect=_fake_get)

        response = super_admin_client.post(
            check_api_url(hospital_registration_request_with_api.id),
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["summary"]["total"] == 6
        assert data["summary"]["failed"] == 0
        assert data["summary"]["schema_failed"] == 0
        assert data["summary"]["connectivity_failed"] == 0
        assert data["failed_apis"] == []
        assert data["schema_failed_apis"] == []
        assert data["connectivity_failed_apis"] == []
        assert data["contract_enforcement"]["status"] == "passed"
        assert data["contract_enforcement"]["eligible"] is True
        assert set(data["results"].keys()) == {"healthcheck", "resources", "bed", "blood", "staff", "sales"}
        assert data["results"]["resources"]["column_validation"]["columns_ok"] is True
        assert data["results"]["resources"]["column_validation"]["additional_columns_allowed"] is True
        assert "custom_tracking_key" in data["results"]["resources"]["column_validation"]["container"]["additional_columns"]

        hospital_registration_request_with_api.refresh_from_db()
        assert hospital_registration_request_with_api.api_check_last_checked_at is not None
        assert set(hospital_registration_request_with_api.api_check_results.keys()) == {
            "healthcheck",
            "resources",
            "bed",
            "blood",
            "staff",
            "sales",
        }
        assert (
            hospital_registration_request_with_api.schema_contract_status
            == hospital_registration_request_with_api.SchemaContractStatus.PASSED
        )
        assert hospital_registration_request_with_api.schema_contract_failed_apis == []

    def test_healthcheck_single_api_is_skipped(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        requests_get = mocker.patch("requests.get")

        response = super_admin_client.post(
            check_single_api_url(hospital_registration_request_with_api.id, "healthcheck"),
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["checked_apis"] == []
        assert data["results"] == {}
        assert data["skipped_apis"] == ["healthcheck"]
        assert data["summary"]["total"] == 0
        requests_get.assert_not_called()

    def test_healthcheck_single_api_skip_uses_existing_contract_state(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        class _StaffResponse:
            status_code = 200

            def json(self):
                return {"staff": []}

            def raise_for_status(self):
                return None

        mocker.patch("requests.get", return_value=_StaffResponse())

        staff_response = super_admin_client.post(
            check_single_api_url(hospital_registration_request_with_api.id, "staff"),
            {},
            format="json",
        )
        assert staff_response.status_code == status.HTTP_200_OK

        requests_get = mocker.patch("requests.get")

        response = super_admin_client.post(
            check_single_api_url(hospital_registration_request_with_api.id, "healthcheck"),
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["checked_apis"] == []
        assert data["skipped_apis"] == ["healthcheck"]
        assert data["contract_enforcement"]["status"] == "unchecked"
        assert "healthcheck" in data["contract_enforcement"]["missing_apis"]
        requests_get.assert_not_called()

    def test_super_admin_can_check_single_api_and_fetch_stored_result(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        class _Response:
            status_code = 200

            def json(self):
                return {"staff": []}

            def raise_for_status(self):
                return None

        mocker.patch("requests.get", return_value=_Response())

        response = super_admin_client.post(
            check_single_api_url(hospital_registration_request_with_api.id, "staff"),
            {"timeout_seconds": 10},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["checked_apis"] == ["staff"]
        assert list(data["results"].keys()) == ["staff"]
        assert data["results"]["staff"]["status"] == "success"
        assert data["results"]["staff"]["column_validation"]["columns_ok"] is True
        assert data["contract_enforcement"]["status"] == "unchecked"
        assert "healthcheck" in data["contract_enforcement"]["missing_apis"]

        persisted = super_admin_client.get(api_check_results_url(hospital_registration_request_with_api.id))
        assert persisted.status_code == status.HTTP_200_OK
        persisted_data = persisted.json()["data"]
        assert persisted_data["results"]["staff"]["status"] == "success"
        assert persisted_data["contract_enforcement"]["status"] == "unchecked"

    def test_check_single_api_without_trailing_slash_returns_json(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        class _Response:
            status_code = 200

            def json(self):
                return {"staff": []}

            def raise_for_status(self):
                return None

        mocker.patch("requests.get", return_value=_Response())

        response = super_admin_client.post(
            check_single_api_url(hospital_registration_request_with_api.id, "staff").rstrip("/"),
            {"timeout_seconds": 10},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["checked_apis"] == ["staff"]
        assert data["results"]["staff"]["status"] == "success"

    def test_check_single_api_handles_timeout(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        import requests

        def _fake_get(url, headers=None, timeout=15, auth=None):  # noqa: ARG001
            raise requests.Timeout("timed out")

        mocker.patch("requests.get", side_effect=_fake_get)

        response = super_admin_client.post(
            check_single_api_url(hospital_registration_request_with_api.id, "staff"),
            {"timeout_seconds": 1},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["results"]["staff"]["status"] == "failed"
        assert data["results"]["staff"]["error"] == "timeout"
        assert data["failed_apis"] == ["staff"]
        assert data["connectivity_failed_apis"] == ["staff"]

    def test_check_single_api_handles_non_2xx_response(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        import requests

        class _Response:
            def __init__(self, status_code=500):
                self.status_code = status_code

            def raise_for_status(self):
                raise requests.HTTPError("server error", response=self)

        mocker.patch("requests.get", return_value=_Response(status_code=500))

        response = super_admin_client.post(
            check_single_api_url(hospital_registration_request_with_api.id, "sales"),
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["results"]["sales"]["status"] == "failed"
        assert data["results"]["sales"]["status_code"] == 500
        assert data["results"]["sales"]["error"] == "http_500"
        assert data["connectivity_failed_apis"] == ["sales"]

    def test_check_api_marks_missing_required_columns_as_failed(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        class _Response:
            def __init__(self, payload, status_code=200):
                self._payload = payload
                self.status_code = status_code

            def json(self):
                return self._payload

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception("http error")

        payload_by_url = {
            "https://api.fixture.example.com/healthcheck": {"status": "ok"},
            "https://api.fixture.example.com/api/resources": {"resources": []},
            # Missing required bed keys (bed_total/bed_available alternatives)
            "https://api.fixture.example.com/api/beds": {"unknown_capacity_field": 12},
            "https://api.fixture.example.com/api/resources/blood": {"blood_units": []},
            "https://api.fixture.example.com/api/staff": {"staff": []},
            "https://api.fixture.example.com/api/sales": {"sales": []},
        }

        def _fake_get(url, headers=None, timeout=15, auth=None):  # noqa: ARG001
            if url not in payload_by_url:
                raise AssertionError(f"Unexpected url: {url}")
            return _Response(payload_by_url[url])

        mocker.patch("requests.get", side_effect=_fake_get)

        response = super_admin_client.post(
            check_api_url(hospital_registration_request_with_api.id),
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        data = response.json()["data"]
        assert "bed" in data["failed_apis"]
        assert "bed" in data["schema_failed_apis"]
        assert data["results"]["bed"]["status"] == "failed"
        assert data["results"]["bed"]["error"] == "missing_required_columns"
        assert data["results"]["bed"]["column_validation"]["container"]["columns_ok"] is False
        assert data["summary"]["schema_failed"] >= 1

    def test_non_super_admin_cannot_check_registration_apis(
        self,
        auth_client,
        hospital_registration_request_with_api,
    ):
        response = auth_client.post(
            check_api_url(hospital_registration_request_with_api.id),
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

        response = auth_client.get(api_check_results_url(hospital_registration_request_with_api.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_cannot_check_registration_apis(
        self,
        api_client,
        hospital_registration_request_with_api,
    ):
        response = api_client.post(
            check_api_url(hospital_registration_request_with_api.id),
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

        response = api_client.get(api_check_results_url(hospital_registration_request_with_api.id))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_failed_apis_from_check_api_are_compatible_with_review_email(
        self,
        super_admin_client,
        hospital_registration_request_with_api,
        mocker,
    ):
        import requests

        class _Response:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return {}

        def _fake_get(url, headers=None, timeout=15, auth=None):  # noqa: ARG001
            if url.endswith("/api/staff") or url.endswith("/staff"):
                raise requests.Timeout("staff timeout")
            return _Response()

        mocker.patch("requests.get", side_effect=_fake_get)
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        check_response = super_admin_client.post(
            check_api_url(hospital_registration_request_with_api.id),
            {},
            format="json",
        )
        assert check_response.status_code == status.HTTP_200_OK
        failed_apis = check_response.json()["data"]["failed_apis"]
        assert "staff" in failed_apis
        assert "staff" in check_response.json()["data"]["connectivity_failed_apis"]

        review_response = super_admin_client.post(
            send_review_email_url(hospital_registration_request_with_api.id),
            {
                "subject": "Registration Review Required",
                "message": "Please fix the failing API endpoints and re-submit.",
                "issue_type": "API_VALIDATION",
                "failed_apis": failed_apis,
                "mark_changes_requested": True,
            },
            format="json",
        )
        assert review_response.status_code == status.HTTP_200_OK
        review_data = review_response.json()["data"]["review_email"]
        assert "staff" in review_data["failed_apis"]


# ──────────────────────────────────────────────
# Full Workflow: End-to-End Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestFullOnboardingWorkflow:
    """End-to-end workflow tests: submit → approve/reject → verify state."""

    PAYLOAD = {
        "name": "E2E Workflow Hospital",
        "registration_number": "REG-E2E-001",
        "email": "e2e@workflow.test",
        "admin_name": "E2E Admin",
        "admin_email": "e2e-admin@workflow.test",
        "phone": "+15550002222",
        "address": "1 E2E Street",
        "city": "Workflow City",
        "state": "WF",
        "country": "US",
        "hospital_type": "teaching",
    }

    def test_full_approve_workflow(self, api_client, super_admin_client):
        from apps.hospitals.models import Hospital, HospitalRegistrationRequest

        # Step 1: Submit (no auth)
        response = api_client.post(REGISTRATION_URL, self.PAYLOAD, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        registration_id = response.json()["data"]["id"]

        # Verify: pending
        reg = HospitalRegistrationRequest.objects.get(id=registration_id)
        assert reg.status == HospitalRegistrationRequest.Status.PENDING_APPROVAL
        assert not Hospital.objects.filter(registration_number=self.PAYLOAD["registration_number"]).exists()

        # Step 2: Admin approves
        response = super_admin_client.post(approve_url(registration_id))
        assert response.status_code == status.HTTP_200_OK

        # Verify: active, hospital created
        reg.refresh_from_db()
        assert reg.status == HospitalRegistrationRequest.Status.ACTIVE
        assert reg.reviewed_at is not None
        assert Hospital.objects.filter(registration_number=self.PAYLOAD["registration_number"]).exists()

    def test_full_reject_workflow(self, api_client, super_admin_client):
        from apps.hospitals.models import Hospital, HospitalRegistrationRequest
        payload = {
            **self.PAYLOAD,
            "registration_number": "REG-E2E-REJECT-001",
            "email": "e2e_reject@workflow.test",
            "admin_email": "e2e_reject_admin@workflow.test",
        }

        # Step 1: Submit
        response = api_client.post(REGISTRATION_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        registration_id = response.json()["data"]["id"]

        # Step 2: Admin rejects
        response = super_admin_client.post(
            reject_url(registration_id),
            {"rejection_reason": "License not verified."},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        # Verify: rejected, no hospital
        reg = HospitalRegistrationRequest.objects.get(id=registration_id)
        assert reg.status == HospitalRegistrationRequest.Status.REJECTED
        assert reg.rejection_reason == "License not verified."
        assert not Hospital.objects.filter(registration_number=payload["registration_number"]).exists()

    def test_approved_request_appears_in_active_filter(self, api_client, super_admin_client):
        payload = {
            **self.PAYLOAD,
            "registration_number": "REG-E2E-ACT-001",
            "email": "e2e_act@workflow.test",
            "admin_email": "e2e_act_admin@workflow.test",
        }

        submit_resp = api_client.post(REGISTRATION_URL, payload, format="json")
        registration_id = submit_resp.json()["data"]["id"]
        super_admin_client.post(approve_url(registration_id))

        response = super_admin_client.get(ADMIN_REGISTRATIONS_URL + "?status=active")
        ids = [r["id"] for r in response.json()["data"]]
        assert str(registration_id) in ids

    def test_rejected_request_does_not_appear_in_pending_filter(self, api_client, super_admin_client):
        payload = {
            **self.PAYLOAD,
            "registration_number": "REG-E2E-REJ-002",
            "email": "e2e_rej2@workflow.test",
            "admin_email": "e2e_rej2_admin@workflow.test",
        }

        submit_resp = api_client.post(REGISTRATION_URL, payload, format="json")
        registration_id = submit_resp.json()["data"]["id"]
        super_admin_client.post(reject_url(registration_id), {}, format="json")

        response = super_admin_client.get(ADMIN_REGISTRATIONS_URL + "?status=pending_approval")
        ids = [r["id"] for r in response.json()["data"]]
        assert str(registration_id) not in ids


# ──────────────────────────────────────────────
# Celery Tasks
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestSyncTasks:
    def test_sync_all_active_dispatches_only_active_with_api_url(self, db):
        from apps.hospitals.models import Hospital, HospitalCapacity, HospitalRegistrationRequest
        from apps.hospitals.tasks import sync_all_active_hospitals_task

        # Create an active registration with api_base_url
        active_with_api = HospitalRegistrationRequest.objects.create(
            name="Active API Hosp",
            registration_number="REG-SYNC-001",
            email="sync001@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="https://api.synctest.com",
        )
        HospitalCapacity.objects.create(
            hospital=Hospital.objects.create(
                name=active_with_api.name,
                registration_number=active_with_api.registration_number,
                email=active_with_api.email,
                hospital_type=active_with_api.hospital_type,
                verified_status=Hospital.VerifiedStatus.VERIFIED,
            )
        )

        # Create an active registration WITHOUT api_base_url
        active_no_api = HospitalRegistrationRequest.objects.create(
            name="Active No API",
            registration_number="REG-SYNC-002",
            email="sync002@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="",
        )
        HospitalCapacity.objects.create(
            hospital=Hospital.objects.create(
                name=active_no_api.name,
                registration_number=active_no_api.registration_number,
                email=active_no_api.email,
                hospital_type=active_no_api.hospital_type,
                verified_status=Hospital.VerifiedStatus.VERIFIED,
            )
        )

        # Create a pending registration with api_base_url (should NOT be synced)
        HospitalRegistrationRequest.objects.create(
            name="Pending API",
            registration_number="REG-SYNC-003",
            email="sync003@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.PENDING_APPROVAL,
            api_base_url="https://api.pending.com",
        )

        result = sync_all_active_hospitals_task.apply()
        assert result.result["dispatched"] == 1  # Only the active one with api_base_url

    def test_sync_registration_task_marks_failed_on_error(self, db):
        from unittest.mock import patch
        from apps.hospitals.models import Hospital, HospitalCapacity, HospitalRegistrationRequest
        from apps.hospitals.tasks import sync_registration_request_api_task

        active_reg = HospitalRegistrationRequest.objects.create(
            name="Sync Fail Hospital",
            registration_number="REG-FAIL-001",
            email="fail001@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="https://api.failtest.com",
        )
        HospitalCapacity.objects.create(
            hospital=Hospital.objects.create(
                name=active_reg.name,
                registration_number=active_reg.registration_number,
                email=active_reg.email,
                hospital_type=active_reg.hospital_type,
                verified_status=Hospital.VerifiedStatus.VERIFIED,
            )
        )

        with patch("apps.hospitals.services.sync_hospital_data") as mock_sync:
            mock_sync.side_effect = Exception("Connection refused")
            # Apply with raise_exception=False to test retry behavior
            result = sync_registration_request_api_task.apply(args=[str(active_reg.id)], throw=False)
            # Task should fail (not succeed)
            assert result.state in ("FAILURE", "RETRY")

    def test_sync_nonexistent_registration_returns_skipped(self, db):
        import uuid
        from apps.hospitals.tasks import sync_registration_request_api_task
        result = sync_registration_request_api_task.apply(args=[str(uuid.uuid4())])
        assert result.result["status"] == "skipped"

    def test_sync_pending_registration_returns_skipped(self, db, hospital_registration_request):
        from apps.hospitals.tasks import sync_registration_request_api_task
        result = sync_registration_request_api_task.apply(args=[str(hospital_registration_request.id)])
        assert result.result["status"] == "skipped"


@pytest.mark.django_db
class TestHospitalDataSyncPersistence:
    def test_sync_hospital_data_persists_inventory_capacity_blood_staff(self, db):
        from unittest.mock import patch

        from apps.authentication.models import UserAccount
        from apps.hospitals.models import Hospital, HospitalCapacity, HospitalRegistrationRequest
        from apps.hospitals.services import sync_hospital_data
        from apps.resources.models import ResourceCatalog, ResourceInventory
        from apps.staff.models import Staff

        reg = HospitalRegistrationRequest.objects.create(
            name="Sync Persist Hospital",
            registration_number="REG-SYNC-PERSIST-001",
            email="persist-sync@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="https://api.persist.example",
            api_auth_type=HospitalRegistrationRequest.ApiAuthType.NONE,
        )
        hospital = Hospital.objects.create(
            name=reg.name,
            registration_number=reg.registration_number,
            email=reg.email,
            hospital_type=reg.hospital_type,
            verified_status=Hospital.VerifiedStatus.VERIFIED,
        )
        HospitalCapacity.objects.create(hospital=hospital)

        payloads = {
            "https://api.persist.example/inventory/resources": {
                "resources": [
                    {
                        "name": "Paracetamol 500mg",
                        "category": "Medication",
                        "quantity_available": 120,
                        "unit": "tablet",
                        "last_updated": "2026-03-13T12:00:00Z",
                    }
                ]
            },
            "https://api.persist.example/beds": {
                "bed_total": 300,
                "bed_available": 27,
                "icu_total": 40,
                "icu_available": 5,
            },
            "https://api.persist.example/blood": {
                "blood_units": [
                    {"name": "Blood A+", "category": "Blood", "quantity_available": 16, "unit": "unit"}
                ]
            },
            "https://api.persist.example/staff": {
                "staff": [
                    {
                        "employee_id": "EMP-SYNC-001",
                        "first_name": "Nadia",
                        "last_name": "Rahman",
                        "department": "Pharmacy",
                        "position": "Inventory Manager",
                        "phone": "+880100000001",
                        "status": "active",
                    }
                ]
            },
        }

        class _Response:
            def __init__(self, data, status_code=200):
                self._data = data
                self.status_code = status_code

            def json(self):
                return self._data

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception("http error")

        def _fake_get(url, headers=None, timeout=30):  # noqa: ARG001
            return _Response(payloads[url])

        with patch("requests.get", side_effect=_fake_get):
            result = sync_hospital_data(str(hospital.id))

        assert result["status"] == "ok"

        capacity = HospitalCapacity.objects.get(hospital=hospital)
        assert capacity.bed_total == 300
        assert capacity.bed_available == 27
        assert capacity.icu_total == 40
        assert capacity.icu_available == 5

        assert ResourceCatalog.objects.filter(hospital=hospital, name="Paracetamol 500mg").exists()
        med_inventory = ResourceInventory.objects.get(catalog_item__hospital=hospital, catalog_item__name="Paracetamol 500mg")
        assert med_inventory.quantity_available == 120

        assert ResourceCatalog.objects.filter(hospital=hospital, name="Blood A+").exists()

        synced_staff = Staff.objects.get(hospital=hospital, employee_id="EMP-SYNC-001")
        assert synced_staff.first_name == "Nadia"
        assert not hasattr(synced_staff, "user_account")
        assert not UserAccount.objects.filter(staff=synced_staff).exists()

    def test_sync_hospital_data_persists_sales_signals(self, db):
        from unittest.mock import patch

        from apps.hospitals.models import Hospital, HospitalCapacity, HospitalRegistrationRequest
        from apps.hospitals.services import sync_hospital_data
        from apps.ml.models import MLDispenseLog

        reg = HospitalRegistrationRequest.objects.create(
            name="Sync Sales Hospital",
            registration_number="REG-SYNC-SALES-001",
            email="sales-sync@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="https://api.sales.example",
            api_auth_type=HospitalRegistrationRequest.ApiAuthType.NONE,
        )
        hospital = Hospital.objects.create(
            name=reg.name,
            registration_number=reg.registration_number,
            email=reg.email,
            hospital_type=reg.hospital_type,
            verified_status=Hospital.VerifiedStatus.VERIFIED,
        )
        HospitalCapacity.objects.create(hospital=hospital)

        payloads = {
            "https://api.sales.example/api/resources": {
                "resources": [
                    {
                        "name": "Paracetamol 500mg",
                        "category": "Medication",
                        "quantity_available": 120,
                        "unit": "tablet",
                    }
                ]
            },
            "https://api.sales.example/api/beds": {
                "bed_total": 80,
                "bed_available": 10,
                "icu_total": 8,
                "icu_available": 2,
            },
            "https://api.sales.example/api/resources/blood": {"blood_units": []},
            "https://api.sales.example/api/staff": {"staff": []},
            "https://api.sales.example/api/sales": {
                "sales": [
                    {
                        "event_id": "sale-001",
                        "medicine_name": "Paracetamol 500mg",
                        "quantity_sold": 14,
                        "date": "2026-03-31",
                    },
                    {
                        "movement_id": "mv-002",
                        "name": "ORS Sachet",
                        "quantity_delta": -6,
                        "movement_type": "stock_out",
                        "event_time": "2026-03-31T08:00:00Z",
                    },
                    {
                        "movement_id": "mv-skip",
                        "name": "Paracetamol 500mg",
                        "quantity_delta": 5,
                        "movement_type": "stock_in",
                        "event_time": "2026-03-31T09:00:00Z",
                    },
                ]
            },
        }

        class _Response:
            def __init__(self, data, status_code=200):
                self._data = data
                self.status_code = status_code

            def json(self):
                return self._data

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception("http error")

        def _fake_get(url, headers=None, timeout=30):  # noqa: ARG001
            return _Response(payloads[url])

        with patch("requests.get", side_effect=_fake_get):
            result = sync_hospital_data(str(hospital.id))

        assert result["status"] == "ok"
        assert result["persisted"]["sales_signals"]["upserted"] == 2
        assert MLDispenseLog.objects.filter(facility=hospital).count() == 2

        api_sale = MLDispenseLog.objects.get(facility=hospital, external_event_id="sale-001")
        assert api_sale.quantity_sold == 14
        assert api_sale.event_date.isoformat() == "2026-03-31"

        movement_sale = MLDispenseLog.objects.get(facility=hospital, external_event_id="mv-002")
        assert movement_sale.quantity_sold == 6
        assert movement_sale.resource_catalog.name == "ORS Sachet"

    def test_sync_hospital_data_creates_staff_profile_without_user(self, db):
        from unittest.mock import patch

        from apps.authentication.models import UserAccount
        from apps.hospitals.models import Hospital, HospitalCapacity, HospitalRegistrationRequest
        from apps.hospitals.services import sync_hospital_data
        from apps.staff.models import Staff

        reg = HospitalRegistrationRequest.objects.create(
            name="Staff Sync Hospital",
            registration_number="REG-SYNC-STAFF-001",
            email="staff-sync@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="https://api.staffsync.example",
            api_auth_type=HospitalRegistrationRequest.ApiAuthType.NONE,
        )
        hospital = Hospital.objects.create(
            name=reg.name,
            registration_number=reg.registration_number,
            email=reg.email,
            hospital_type=reg.hospital_type,
            verified_status=Hospital.VerifiedStatus.VERIFIED,
        )
        HospitalCapacity.objects.create(hospital=hospital)

        endpoint_data = {
            "/inventory/resources": {"resources": []},
            "/beds": {"bed_total": 10, "bed_available": 8, "icu_total": 2, "icu_available": 1},
            "/blood": {"blood_units": []},
            "/staff": {"staff": [{"name": "Tariq Ahmed", "department": "ER", "position": "Nurse"}]},
        }

        class _Response:
            def __init__(self, data):
                self._data = data
                self.status_code = 200

            def json(self):
                return self._data

            def raise_for_status(self):
                return None

        def _fake_get(url, headers=None, timeout=30):  # noqa: ARG001
            for suffix, payload in endpoint_data.items():
                if url.endswith(suffix):
                    return _Response(payload)
            raise AssertionError(f"Unexpected URL: {url}")

        with patch("requests.get", side_effect=_fake_get):
            result = sync_hospital_data(str(hospital.id))

        assert result["status"] == "ok"
        assert Staff.objects.filter(hospital=hospital).count() == 1
        synced_staff = Staff.objects.get(hospital=hospital)
        assert synced_staff.employee_id.startswith("EXT-")
        assert not UserAccount.objects.filter(staff=synced_staff).exists()

    def test_sync_hospital_data_supports_mock_api_resources_shape(self, db):
        from unittest.mock import patch

        from apps.hospitals.models import Hospital, HospitalCapacity, HospitalRegistrationRequest
        from apps.hospitals.services import sync_hospital_data
        from apps.resources.models import ResourceInventory

        reg = HospitalRegistrationRequest.objects.create(
            name="Green Valley Clinic",
            registration_number="REG-GREEN-001",
            email="green@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="http://localhost:9004/mock-hospitals/green-valley",
            api_auth_type=HospitalRegistrationRequest.ApiAuthType.NONE,
        )
        hospital = Hospital.objects.create(
            name=reg.name,
            registration_number=reg.registration_number,
            email=reg.email,
            hospital_type=reg.hospital_type,
            verified_status=Hospital.VerifiedStatus.VERIFIED,
        )
        HospitalCapacity.objects.create(hospital=hospital)

        class _Response:
            def __init__(self, data, status_code=200):
                self._data = data
                self.status_code = status_code

            def json(self):
                return self._data

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception("http error")

        def _fake_get(url, headers=None, auth=None, timeout=30):  # noqa: ARG001
            if url.endswith("/api/resources"):
                return _Response(
                    {
                        "hospital": "Green Valley Clinic",
                        "resources": [
                            {
                                "id": "res-1",
                                "name": "Paracetamol",
                                "category": "medicines",
                                "available_quantity": 130,
                            }
                        ],
                    }
                )
            raise Exception("not found")

        with patch("requests.get", side_effect=_fake_get):
            result = sync_hospital_data(str(hospital.id))

        assert result["status"] == "ok_with_warnings"
        inv = ResourceInventory.objects.get(catalog_item__hospital=hospital, catalog_item__name="Paracetamol")
        assert inv.quantity_available == 130
