"""Unit tests for Hospital model and services."""
import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.hospitals.models import (
    Hospital,
    HospitalCapacity,
    HospitalOffboardingRequest,
    HospitalPartnership,
    HospitalRegistrationRequest,
    HospitalUpdateRequest,
)
from apps.hospitals.serializers import HospitalRegistrationRequestSerializer
from apps.hospitals.services import (
    approve_hospital_offboarding_request,
    approve_registration_request,
    create_hospital,
    create_partnership,
    approve_hospital_update_request,
    reject_hospital_offboarding_request,
    reject_hospital_update_request,
    reject_registration_request,
    request_hospital_offboarding,
    submit_hospital_update,
    submit_registration_request,
    suspend_hospital,
    notify_hospital_inventory_update,
    verify_hospital,
)


@pytest.mark.django_db
class TestHospitalRegistrationRequestModel:
    def test_default_status_is_pending(self, db):
        reg = HospitalRegistrationRequest.objects.create(
            name="Test Reg Hospital",
            registration_number="REG-UNIT-001",
            email="unit@regtest.com",
            admin_name="Unit Admin",
            admin_email="unit-admin@regtest.com",
            hospital_type="general",
        )
        assert reg.status == HospitalRegistrationRequest.Status.PENDING_APPROVAL

    def test_str_representation(self, db):
        reg = HospitalRegistrationRequest.objects.create(
            name="Str Test Hospital",
            registration_number="REG-STR-001",
            email="str@regtest.com",
            admin_name="Str Admin",
            admin_email="str-admin@regtest.com",
            hospital_type="general",
        )
        assert "Str Test Hospital" in str(reg)
        assert "pending_approval" in str(reg)

    def test_pending_duplicate_registration_number_blocked_by_serializer(self, db):
        HospitalRegistrationRequest.objects.create(
            name="First",
            registration_number="REG-DUP-001",
            email="first@regtest.com",
            admin_name="First Admin",
            admin_email="first-admin@regtest.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.PENDING_APPROVAL,
        )
        serializer = HospitalRegistrationRequestSerializer(
            data={
                "name": "Second",
                "registration_number": "REG-DUP-001",
                "email": "second@regtest.com",
                "admin_name": "Second Admin",
                "admin_email": "second-admin@regtest.com",
                "hospital_type": "general",
            }
        )
        assert not serializer.is_valid()
        assert "registration_number" in serializer.errors

    def test_rejected_duplicate_admin_email_allowed_by_serializer(self, db):
        HospitalRegistrationRequest.objects.create(
            name="First",
            registration_number="REG-MAIL-001",
            email="unique@regtest.com",
            admin_name="First Admin",
            admin_email="unique-admin@regtest.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.REJECTED,
        )
        serializer = HospitalRegistrationRequestSerializer(
            data={
                "name": "Second",
                "registration_number": "REG-MAIL-002",
                "email": "unique@regtest.com",
                "admin_name": "Second Admin",
                "admin_email": "unique-admin@regtest.com",
                "hospital_type": "general",
            }
        )
        assert serializer.is_valid(), serializer.errors


@pytest.mark.django_db
class TestRegistrationRequestServices:
    def _make_data(self, suffix="A"):
        return {
            "name": f"Service Test Hospital {suffix}",
            "registration_number": f"REG-SVC-{suffix}",
            "email": f"svc{suffix.lower()}@test.com",
            "admin_name": f"Service Admin {suffix}",
            "admin_email": f"svc-admin{suffix.lower()}@test.com",
            "hospital_type": "general",
            "city": "Test City",
            "country": "US",
        }

    def test_submit_registration_request_creates_pending_record(self, db):
        data = self._make_data("S1")
        reg = submit_registration_request(data)
        assert reg.pk is not None
        assert reg.status == HospitalRegistrationRequest.Status.PENDING_APPROVAL
        assert reg.name == data["name"]

    def test_approve_creates_hospital_and_capacity(self, db, super_admin_user):
        data = self._make_data("S2")
        reg = submit_registration_request(data)
        result = approve_registration_request(reg, super_admin_user)
        assert result["registration_request"].status == HospitalRegistrationRequest.Status.ACTIVE
        hospital = result["hospital"]
        assert Hospital.objects.filter(id=hospital.id).exists()
        assert HospitalCapacity.objects.filter(hospital=hospital).exists()

    def test_approve_sets_reviewed_fields(self, db, super_admin_user):
        data = self._make_data("S3")
        reg = submit_registration_request(data)
        result = approve_registration_request(reg, super_admin_user)
        reg_updated = result["registration_request"]
        assert reg_updated.reviewed_at is not None

    def test_approve_already_active_raises(self, db, super_admin_user):
        data = self._make_data("S4")
        reg = submit_registration_request(data)
        approve_registration_request(reg, super_admin_user)
        reg.refresh_from_db()
        with pytest.raises(ValidationError):
            approve_registration_request(reg, super_admin_user)

    def test_approve_rejected_raises(self, db, super_admin_user):
        data = self._make_data("S5")
        reg = submit_registration_request(data)
        reject_registration_request(reg, super_admin_user, "test reason")
        reg.refresh_from_db()
        with pytest.raises(ValidationError):
            approve_registration_request(reg, super_admin_user)

    def test_reject_sets_rejected_status(self, db, super_admin_user):
        data = self._make_data("S6")
        reg = submit_registration_request(data)
        updated = reject_registration_request(reg, super_admin_user, "Incomplete docs")
        assert updated.status == HospitalRegistrationRequest.Status.REJECTED
        assert updated.rejection_reason == "Incomplete docs"
        assert updated.reviewed_at is not None

    def test_reject_already_rejected_raises(self, db, super_admin_user):
        data = self._make_data("S7")
        reg = submit_registration_request(data)
        reject_registration_request(reg, super_admin_user)
        reg.refresh_from_db()
        with pytest.raises(ValidationError):
            reject_registration_request(reg, super_admin_user)

    def test_approve_with_api_base_url_still_succeeds(self, db, super_admin_user):
        """Approval succeeds even when api_base_url is provided;
        sync happens via background tasks on HospitalRegistrationRequest."""
        data = self._make_data("S8")
        data["api_base_url"] = "https://api.example.com"
        data["api_auth_type"] = "bearer"
        reg = submit_registration_request(data)
        result = approve_registration_request(reg, super_admin_user)
        assert result["registration_request"].status == HospitalRegistrationRequest.Status.ACTIVE
        assert result["hospital"] is not None
        assert result["hospital"].advanced_integration_eligible is False

    def test_approve_with_passed_schema_contract_marks_hospital_advanced_eligible(self, db, super_admin_user):
        data = self._make_data("S8C")
        data["api_base_url"] = "https://api.example.com"
        data["api_auth_type"] = "none"
        reg = submit_registration_request(data)
        reg.schema_contract_status = HospitalRegistrationRequest.SchemaContractStatus.PASSED
        reg.schema_contract_failed_apis = []
        reg.schema_contract_checked_at = timezone.now()
        reg.save(
            update_fields=[
                "schema_contract_status",
                "schema_contract_failed_apis",
                "schema_contract_checked_at",
                "updated_at",
            ]
        )

        result = approve_registration_request(reg, super_admin_user)
        assert result["hospital"].advanced_integration_eligible is True
        assert result["hospital"].schema_contract_status == Hospital.SchemaContractStatus.PASSED

    def test_approve_without_api_url_also_succeeds(self, db, super_admin_user):
        data = self._make_data("S9")
        reg = submit_registration_request(data)
        result = approve_registration_request(reg, super_admin_user)
        assert result["registration_request"].status == HospitalRegistrationRequest.Status.ACTIVE

    def test_approve_copies_inventory_source_fields(self, db, super_admin_user):
        data = self._make_data("S9B")
        data.update(
            {
                "needs_inventory_dashboard": True,
                "inventory_source_type": HospitalRegistrationRequest.InventorySourceType.CSV,
                "inventory_last_sync_source": "registration_seed",
            }
        )
        reg = submit_registration_request(data)

        result = approve_registration_request(reg, super_admin_user)
        hospital = result["hospital"]

        assert hospital.needs_inventory_dashboard is True
        assert hospital.inventory_source_type == Hospital.InventorySourceType.CSV
        assert hospital.inventory_last_sync_source == "registration_seed"

    def test_approve_sends_hospital_approval_password_setup_email(self, db, super_admin_user, mocker):
        mocker.patch("apps.hospitals.services.transaction.on_commit", side_effect=lambda cb: cb())
        mocked_send = mocker.patch("apps.authentication.services.send_email", return_value=True)
        data = self._make_data("S10")
        reg = submit_registration_request(data)
        approve_registration_request(reg, super_admin_user)
        assert mocked_send.called

    def test_approve_still_succeeds_when_password_setup_dispatch_fails(self, db, super_admin_user, mocker):
        mocker.patch("apps.hospitals.services.transaction.on_commit", side_effect=lambda cb: cb())
        mocker.patch("apps.hospitals.services.initiate_password_reset", side_effect=Exception("SMTP down"))
        data = self._make_data("S11")
        reg = submit_registration_request(data)
        result = approve_registration_request(reg, super_admin_user)
        assert result["registration_request"].status == HospitalRegistrationRequest.Status.ACTIVE
        assert Hospital.objects.filter(registration_number=data["registration_number"]).exists()


@pytest.mark.django_db
class TestHospitalModel:
    def test_hospital_creation(self, hospital):
        assert hospital.pk is not None
        assert hospital.verified_status == Hospital.VerifiedStatus.VERIFIED

    def test_hospital_capacity_auto_created(self, hospital):
        assert HospitalCapacity.objects.filter(hospital=hospital).exists()

    def test_hospital_str(self, hospital):
        assert "Test Hospital" in str(hospital)


@pytest.mark.django_db
class TestHospitalServices:
    def test_verify_hospital(self, hospital, super_admin_user):
        hospital.verified_status = Hospital.VerifiedStatus.PENDING
        hospital.save()
        result = verify_hospital(hospital, super_admin_user)
        assert result.verified_status == Hospital.VerifiedStatus.VERIFIED

    def test_verify_already_verified(self, hospital, super_admin_user):
        with pytest.raises(ValidationError):
            verify_hospital(hospital, super_admin_user)

    def test_suspend_hospital(self, hospital, super_admin_user):
        result = suspend_hospital(hospital, super_admin_user)
        assert result.verified_status == Hospital.VerifiedStatus.SUSPENDED

    def test_create_partnership(self, hospital, hospital_b, super_admin_user):
        partner = create_partnership(hospital.id, hospital_b.id, super_admin_user)
        assert partner.pk is not None
        # Canonical ordering: hospital_a.id <= hospital_b.id
        assert str(partner.hospital_a.id) < str(partner.hospital_b.id) or str(partner.hospital_a.id) == str(partner.hospital_b.id)

    def test_duplicate_partnership_raises(self, hospital, hospital_b, super_admin_user):
        create_partnership(hospital.id, hospital_b.id, super_admin_user)
        with pytest.raises(ValidationError):
            create_partnership(hospital.id, hospital_b.id, super_admin_user)


@pytest.mark.django_db
class TestHospitalUpdateWorkflowServices:
    def test_hospital_admin_direct_update_applies_immediately(self, hospital, hospital_admin_user):
        result = submit_hospital_update(
            hospital=hospital,
            actor=hospital_admin_user,
            validated_data={
                "needs_inventory_dashboard": True,
                "inventory_source_type": Hospital.InventorySourceType.CSV,
                "inventory_last_sync_source": "manual_ops",
            },
        )

        hospital.refresh_from_db()
        assert hospital.needs_inventory_dashboard is True
        assert hospital.inventory_source_type == Hospital.InventorySourceType.CSV
        assert hospital.inventory_last_sync_source == "manual_ops"
        assert result["update_request"] is None

    def test_hospital_admin_sensitive_update_creates_pending_request(self, hospital, hospital_admin_user):
        result = submit_hospital_update(
            hospital=hospital,
            actor=hospital_admin_user,
            validated_data={"email": "pending-apply@hospital.com"},
        )

        hospital.refresh_from_db()
        assert hospital.email != "pending-apply@hospital.com"
        assert result["update_request"] is not None
        assert result["update_request"].status == HospitalUpdateRequest.Status.PENDING

    def test_super_admin_sensitive_update_applies_immediately(self, hospital, super_admin_user):
        result = submit_hospital_update(
            hospital=hospital,
            actor=super_admin_user,
            validated_data={"email": "superadmin-updated@hospital.com"},
        )

        hospital.refresh_from_db()
        assert hospital.email == "superadmin-updated@hospital.com"
        assert result["update_request"] is None

    def test_approve_hospital_update_request_applies_change(self, hospital, hospital_admin_user, super_admin_user, mocker):
        mocker.patch("apps.hospitals.services.transaction.on_commit", side_effect=lambda cb: cb())
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        submitted = submit_hospital_update(
            hospital=hospital,
            actor=hospital_admin_user,
            validated_data={"registration_number": "REG-APPROVED-UNIT"},
        )
        update_request = submitted["update_request"]
        approve_hospital_update_request(update_request, super_admin_user)

        hospital.refresh_from_db()
        update_request.refresh_from_db()
        assert hospital.registration_number == "REG-APPROVED-UNIT"
        assert update_request.status == HospitalUpdateRequest.Status.APPROVED

    def test_reject_hospital_update_request_keeps_hospital_unchanged(self, hospital, hospital_admin_user, super_admin_user, mocker):
        mocker.patch("apps.hospitals.services.transaction.on_commit", side_effect=lambda cb: cb())
        mocker.patch("apps.hospitals.services.send_email", return_value=True)

        original_email = hospital.email
        submitted = submit_hospital_update(
            hospital=hospital,
            actor=hospital_admin_user,
            validated_data={"email": "reject-me@hospital.com"},
        )
        update_request = submitted["update_request"]
        reject_hospital_update_request(update_request, super_admin_user, "Invalid domain ownership")

        hospital.refresh_from_db()
        update_request.refresh_from_db()
        assert hospital.email == original_email
        assert update_request.status == HospitalUpdateRequest.Status.REJECTED
        assert update_request.rejection_reason == "Invalid domain ownership"

    def test_duplicate_pending_approval_request_is_blocked(self, hospital, hospital_admin_user):
        submit_hospital_update(
            hospital=hospital,
            actor=hospital_admin_user,
            validated_data={"email": "first-pending@hospital.com"},
        )

        with pytest.raises(ValidationError) as exc_info:
            submit_hospital_update(
                hospital=hospital,
                actor=hospital_admin_user,
                validated_data={"name": "Blocked While Pending"},
            )

        assert "Existing update request already pending approval" in str(exc_info.value.detail)

    def test_direct_inventory_source_update_mirrors_active_registration(self, hospital, hospital_admin_user):
        active_registration = HospitalRegistrationRequest.objects.create(
            name=hospital.name,
            registration_number=hospital.registration_number,
            email=hospital.email,
            admin_name="Mirror Admin",
            admin_email="mirror-admin@test.com",
            hospital_type=hospital.hospital_type,
            status=HospitalRegistrationRequest.Status.ACTIVE,
            needs_inventory_dashboard=False,
            inventory_source_type=HospitalRegistrationRequest.InventorySourceType.API,
            inventory_last_sync_source="bootstrap",
        )

        submit_hospital_update(
            hospital=hospital,
            actor=hospital_admin_user,
            validated_data={
                "needs_inventory_dashboard": True,
                "inventory_source_type": Hospital.InventorySourceType.HYBRID,
                "inventory_last_sync_source": "manual_update",
            },
        )

        hospital.refresh_from_db()
        active_registration.refresh_from_db()

        assert hospital.needs_inventory_dashboard is True
        assert hospital.inventory_source_type == Hospital.InventorySourceType.HYBRID
        assert hospital.inventory_last_sync_source == "manual_update"

        assert active_registration.needs_inventory_dashboard is True
        assert active_registration.inventory_source_type == HospitalRegistrationRequest.InventorySourceType.HYBRID
        assert active_registration.inventory_last_sync_source == "manual_update"


@pytest.mark.django_db
class TestSyncRegistrationRequestApi:
    """Tests for the sync_registration_request_api service."""

    def test_no_api_url_returns_skipped(self, hospital_registration_request):
        from apps.hospitals.services import sync_registration_request_api
        result = sync_registration_request_api(hospital_registration_request)
        assert result["status"] == "skipped"
        assert result["reason"] == "no_api_base_url"

    def test_with_api_url_calls_endpoints(self, hospital_registration_request_with_api, mocker):
        from apps.hospitals.services import sync_registration_request_api
        mock_response = mocker.MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = mocker.MagicMock()
        mocker.patch("requests.get", return_value=mock_response)
        result = sync_registration_request_api(hospital_registration_request_with_api)
        assert result["status"] == "ok"
        assert "inventory_resources" in result["endpoints"]
        assert "beds" in result["endpoints"]
        assert "blood" in result["endpoints"]

    def test_endpoint_error_is_captured_not_raised(self, hospital_registration_request_with_api, mocker):
        from apps.hospitals.services import sync_registration_request_api
        mocker.patch("requests.get", side_effect=Exception("Connection refused"))
        result = sync_registration_request_api(hospital_registration_request_with_api)
        # Errors are captured, not re-raised
        assert result["status"] == "ok"
        for key, val in result["endpoints"].items():
            assert val["status"] == "error"

    def test_sync_updates_last_sync_time(self, hospital_registration_request_with_api, mocker):
        from apps.hospitals.services import sync_registration_request_api
        mock_response = mocker.MagicMock()
        mock_response.raise_for_status = mocker.MagicMock()
        mocker.patch("requests.get", return_value=mock_response)
        sync_registration_request_api(hospital_registration_request_with_api)
        hospital_registration_request_with_api.refresh_from_db()
        assert hospital_registration_request_with_api.last_sync_time is not None


@pytest.mark.django_db
class TestOutboundInventoryUpdateNotifier:
    def test_skips_when_hospital_has_no_active_registration(self, hospital):
        result = notify_hospital_inventory_update(
            hospital=hospital,
            operation="request_approved_inventory",
            payload={"event_id": "evt-1"},
        )
        assert result["status"] == "skipped"

    def test_logs_successful_external_call(self, hospital, mocker):
        from apps.requests.models import ExternalInventoryAPICallLog

        HospitalRegistrationRequest.objects.create(
            name=hospital.name,
            registration_number=hospital.registration_number,
            email="sync-success@test.com",
            admin_name="Sync Admin",
            admin_email="sync-success-admin@test.com",
            hospital_type="general",
            status=HospitalRegistrationRequest.Status.ACTIVE,
            api_base_url="https://client.example.test",
            api_auth_type=HospitalRegistrationRequest.ApiAuthType.NONE,
        )

        mock_response = mocker.MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"accepted": True}
        mocker.patch("requests.post", return_value=mock_response)

        result = notify_hospital_inventory_update(
            hospital=hospital,
            operation="request_approved_inventory",
            payload={"event_id": "evt-2", "event_type": "inventory_updated"},
        )

        assert result["status"] == ExternalInventoryAPICallLog.CallStatus.SUCCESS
        log = ExternalInventoryAPICallLog.objects.filter(hospital=hospital).order_by("-created_at").first()
        assert log is not None
        assert log.call_status == ExternalInventoryAPICallLog.CallStatus.SUCCESS
        assert log.http_method == "POST"


@pytest.mark.django_db
class TestApprovalSyncBootstrap:
    def test_approve_with_api_url_creates_api_config_and_queues_initial_sync(self, db, super_admin_user, mocker):
        from apps.hospitals.models import HospitalAPIConfig

        data = {
            "name": "Bootstrap Sync Hospital",
            "registration_number": "REG-BOOT-001",
            "email": "boot@test.com",
            "admin_name": "Bootstrap Admin",
            "admin_email": "boot-admin@test.com",
            "hospital_type": "general",
            "api_base_url": "http://localhost:9004/mock-hospitals/green-valley",
            "api_auth_type": HospitalRegistrationRequest.ApiAuthType.NONE,
        }

        reg = submit_registration_request(data)
        mocker.patch("apps.hospitals.services.transaction.on_commit", side_effect=lambda cb: cb())
        mocked_delay = mocker.patch("apps.hospitals.tasks.sync_registration_request_api_task.delay")

        result = approve_registration_request(reg, super_admin_user)
        hospital = result["hospital"]

        assert HospitalAPIConfig.objects.filter(hospital=hospital, is_active=True).exists()
        mocked_delay.assert_called_once_with(str(reg.id))


@pytest.mark.django_db
class TestRegistrationAuthOptions:
    def test_build_request_options_for_basic_auth_without_api_key(self, mocker):
        from apps.hospitals.services import _build_registration_request_options

        registration = HospitalRegistrationRequest(
            api_auth_type=HospitalRegistrationRequest.ApiAuthType.BASIC,
            api_username="sunrise",
            api_password="encrypted-password",
        )

        mocker.patch("common.utils.encryption.decrypt_value", return_value="password123")

        headers, auth = _build_registration_request_options(registration, "http://localhost:9003/mock-hospitals/sunrise-health")

        assert headers == {}
        assert auth == ("sunrise", "password123")


class TestExternalBaseUrlNormalization:
    def test_normalizes_localhost_to_docker_host(self, monkeypatch):
        from apps.hospitals.services import _normalize_external_base_url

        monkeypatch.setenv("HOSPITAL_API_LOCALHOST_HOST", "host.docker.internal")
        normalized = _normalize_external_base_url("http://localhost:9004/mock-hospitals/green-valley")
        assert normalized == "http://host.docker.internal:9004/mock-hospitals/green-valley"

    def test_keeps_non_localhost_unchanged(self):
        from apps.hospitals.services import _normalize_external_base_url

        value = "https://api.some-hospital.test/base"
        assert _normalize_external_base_url(value) == value


@pytest.mark.django_db
class TestHospitalOffboardingServices:
    def test_request_creates_pending_offboarding_record(self, hospital, hospital_admin_user):
        offboarding_request = request_hospital_offboarding(
            hospital=hospital,
            reason="Hospital merger completed.",
            actor=hospital_admin_user,
        )

        assert offboarding_request.status == HospitalOffboardingRequest.Status.PENDING
        assert offboarding_request.requested_by == hospital_admin_user.staff

    def test_duplicate_pending_request_is_rejected(self, hospital, hospital_admin_user):
        request_hospital_offboarding(
            hospital=hospital,
            reason="First request",
            actor=hospital_admin_user,
        )

        with pytest.raises(ValidationError):
            request_hospital_offboarding(
                hospital=hospital,
                reason="Second request",
                actor=hospital_admin_user,
            )

    def test_approve_offboarding_disables_accounts_and_offboards_hospital(
        self,
        hospital,
        hospital_admin_user,
        pharmacist_user,
        super_admin_user,
    ):
        offboarding_request = request_hospital_offboarding(
            hospital=hospital,
            reason="Planned closure.",
            actor=hospital_admin_user,
        )

        approved = approve_hospital_offboarding_request(
            offboarding_request=offboarding_request,
            actor=super_admin_user,
            admin_notes="Approved after policy review.",
        )

        hospital.refresh_from_db()
        hospital_admin_user.refresh_from_db()
        pharmacist_user.refresh_from_db()

        assert approved.status == HospitalOffboardingRequest.Status.APPROVED
        assert hospital.verified_status == Hospital.VerifiedStatus.OFFBOARDED
        assert hospital_admin_user.is_active is False
        assert pharmacist_user.is_active is False

    def test_cannot_approve_offboarding_twice(self, hospital, hospital_admin_user, super_admin_user):
        offboarding_request = request_hospital_offboarding(
            hospital=hospital,
            reason="One-time offboarding.",
            actor=hospital_admin_user,
        )

        approve_hospital_offboarding_request(
            offboarding_request=offboarding_request,
            actor=super_admin_user,
        )

        offboarding_request.refresh_from_db()
        with pytest.raises(ValidationError):
            approve_hospital_offboarding_request(
                offboarding_request=offboarding_request,
                actor=super_admin_user,
            )

    def test_reject_allows_future_resubmission(self, hospital, hospital_admin_user, super_admin_user):
        offboarding_request = request_hospital_offboarding(
            hospital=hospital,
            reason="Initial offboarding request.",
            actor=hospital_admin_user,
        )

        rejected = reject_hospital_offboarding_request(
            offboarding_request=offboarding_request,
            actor=super_admin_user,
            admin_notes="Need more information.",
        )
        assert rejected.status == HospitalOffboardingRequest.Status.REJECTED

        resubmitted = request_hospital_offboarding(
            hospital=hospital,
            reason="Resubmitted with extra information.",
            actor=hospital_admin_user,
        )
        assert resubmitted.status == HospitalOffboardingRequest.Status.PENDING
