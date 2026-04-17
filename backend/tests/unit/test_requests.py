"""Unit tests for the requests app services (lifecycle tests)."""
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.requests.models import (
    DeliveryToken,
    DispatchEvent,
    ResourceRequest,
    ResourceRequestApproval,
)
from apps.requests.serializers import ResourceRequestSerializer
from apps.requests.services import (
    approve_request,
    cancel_request,
    confirm_payment,
    confirm_delivery,
    create_resource_request,
    dispatch_request,
    transfer_confirm,
    verify_return,
)
from apps.shipments.models import Shipment
from apps.shipments.services import add_tracking_event


@pytest.fixture
def resource_request(db, hospital, hospital_b, catalog_item, hospital_b_admin_user):
    """A PENDING resource request from hospital_b to hospital."""
    catalog_item.is_shareable = True
    catalog_item.save()
    return create_resource_request(
        requesting_hospital=hospital_b,
        data={
            "supplying_hospital": hospital.id,
            "catalog_item": catalog_item.id,
            "quantity_requested": 10,
        },
        actor=hospital_b_admin_user,
    )


@pytest.mark.django_db
class TestCreateResourceRequest:
    def test_creates_pending_request(self, resource_request):
        assert resource_request.pk is not None
        assert resource_request.status == ResourceRequest.Status.PENDING

    def test_self_request_raises(self, hospital, catalog_item, hospital_admin_user):
        catalog_item.is_shareable = True
        catalog_item.save()
        with pytest.raises(ValidationError, match="own hospital"):
            create_resource_request(
                requesting_hospital=hospital,
                data={
                    "supplying_hospital": hospital.id,
                    "catalog_item": catalog_item.id,
                    "quantity_requested": 5,
                },
                actor=hospital_admin_user,
            )

    def test_non_shareable_raises(self, hospital, hospital_b, catalog_item, hospital_admin_user):
        catalog_item.is_shareable = False
        catalog_item.save()
        with pytest.raises(ValidationError, match="not marked as shareable"):
            create_resource_request(
                requesting_hospital=hospital_b,
                data={
                    "supplying_hospital": hospital.id,
                    "catalog_item": catalog_item.id,
                    "quantity_requested": 5,
                },
                actor=hospital_admin_user,
            )


@pytest.mark.django_db
class TestApproveRequest:
    def test_approve_creates_approval_record(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "Looks good", hospital_admin_user)
        assert ResourceRequestApproval.objects.filter(request=resource_request).exists()

    def test_approve_transitions_to_approved(self, resource_request, hospital_admin_user):
        req = approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        assert req.status == ResourceRequest.Status.APPROVED

    def test_reject_transitions_to_rejected(self, resource_request, hospital_admin_user):
        req = approve_request(resource_request, "rejected", 0, "Not available", hospital_admin_user)
        assert req.status == ResourceRequest.Status.REJECTED

    def test_double_approve_raises(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        with pytest.raises(ValidationError, match="already"):
            approve_request(resource_request, "approved", 10, "OK again", hospital_admin_user)


@pytest.mark.django_db
class TestDispatchRequest:
    def test_no_delivery_token_before_dispatch(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()

        assert resource_request.status == ResourceRequest.Status.APPROVED
        assert not DeliveryToken.objects.filter(request=resource_request).exists()

    def test_dispatch_approved_request(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        evt = dispatch_request(resource_request, hospital_admin_user)
        assert isinstance(evt, DispatchEvent)
        assert evt.shipment.receive_token == ""
        resource_request.refresh_from_db()
        assert resource_request.status == ResourceRequest.Status.DISPATCHED

    def test_dispatch_blocked_when_payment_required_not_completed(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        resource_request.payment_required = True
        resource_request.workflow_state = ResourceRequest.WorkflowState.PAYMENT_PENDING
        resource_request.total_price = Decimal("10.00")
        resource_request.save(update_fields=["payment_required", "workflow_state", "total_price", "updated_at"])

        with pytest.raises(ValidationError, match="Payment must be completed before dispatch"):
            dispatch_request(resource_request, hospital_admin_user)

        assert not DeliveryToken.objects.filter(request=resource_request).exists()

    def test_request_serializer_exposes_shipment_linkage(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_event = dispatch_request(resource_request, hospital_admin_user)

        payload = ResourceRequestSerializer(resource_request).data
        assert payload["shipment_id"] == str(dispatch_event.shipment_id)
        assert payload["shipment_status"] == dispatch_event.shipment.status
        assert payload["completion_stage"] is None

    def test_dispatch_creates_delivery_token(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_event = dispatch_request(resource_request, hospital_admin_user)
        assert DeliveryToken.objects.filter(request=resource_request).exists()
        assert dispatch_event.shipment.receive_token == ""

    def test_dispatch_non_approved_raises(self, resource_request, hospital_admin_user):
        # Still PENDING
        with pytest.raises(ValidationError, match="approved"):
            dispatch_request(resource_request, hospital_admin_user)


@pytest.mark.django_db
class TestConfirmDelivery:
    def _setup_dispatched(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_event = dispatch_request(resource_request, hospital_admin_user)
        qr_payload = getattr(dispatch_event, "delivery_qr_payload", {}) or {}
        qr_payload= str(qr_payload.get("qrPayload", "")).strip()
        assert qr_payload
        resource_request.refresh_from_db()
        return qr_payload

    def test_confirm_with_valid_token(self, resource_request, hospital_admin_user, hospital_b_admin_user):
        qr_payload= self._setup_dispatched(resource_request, hospital_admin_user)
        dispatch_event = DispatchEvent.objects.get(request=resource_request)
        evt = confirm_delivery(
            qr_payload,
            10,
            "All received",
            hospital_b_admin_user,
        )
        assert evt.pk is not None
        resource_request.refresh_from_db()
        assert resource_request.status == ResourceRequest.Status.FULFILLED

    def test_token_marked_used_after_confirm(self, resource_request, hospital_admin_user, hospital_b_admin_user):
        qr_payload= self._setup_dispatched(resource_request, hospital_admin_user)
        dispatch_event = DispatchEvent.objects.get(request=resource_request)
        confirm_delivery(
            qr_payload,
            10,
            "Received",
            hospital_b_admin_user,
        )
        delivery_token = DeliveryToken.objects.get(request=resource_request)
        assert delivery_token.used_at is not None

    def test_expired_token_raises(self, resource_request, hospital_admin_user, hospital_b_admin_user):
        qr_payload= self._setup_dispatched(resource_request, hospital_admin_user)
        delivery_token = DeliveryToken.objects.get(request=resource_request)
        delivery_token.expires_at = timezone.now() - timezone.timedelta(hours=1)
        delivery_token.save()
        dispatch_event = DispatchEvent.objects.get(request=resource_request)
        with pytest.raises(ValidationError, match="expired"):
            confirm_delivery(
                qr_payload,
                10,
                "Late delivery",
                hospital_b_admin_user,
            )

    def test_non_receiver_cannot_confirm_scan(
        self,
        resource_request,
        hospital_admin_user,
    ):
        qr_payload = self._setup_dispatched(resource_request, hospital_admin_user)
        dispatch_event = DispatchEvent.objects.get(request=resource_request)

        with pytest.raises(PermissionDenied, match="not assigned"):
            transfer_confirm(
                req=resource_request,
                actor=hospital_admin_user,
                qr_payload=qr_payload,
                quantity_received=None,
                notes="sender confirmed",
                idempotency_key="unit-sender-confirm",
            )

        resource_request.refresh_from_db()
        dispatch_event.shipment.refresh_from_db()
        assert resource_request.workflow_state == ResourceRequest.WorkflowState.IN_TRANSIT
        assert resource_request.status == ResourceRequest.Status.DISPATCHED
        assert dispatch_event.shipment.dispatch_token_used_at is None
        assert dispatch_event.shipment.receive_token_used_at is None
        assert ResourceRequestSerializer(resource_request).data["completion_stage"] is None

    def test_receiver_can_complete_with_qr_payload(
        self,
        resource_request,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        qr_payload = self._setup_dispatched(resource_request, hospital_admin_user)

        evt = confirm_delivery(
            qr_payload,
            10,
            "Receiver confirmed",
            hospital_b_admin_user,
        )
        assert evt.pk is not None

        resource_request.refresh_from_db()
        assert resource_request.workflow_state == ResourceRequest.WorkflowState.COMPLETED
        assert ResourceRequestSerializer(resource_request).data["completion_stage"] == "RECEIVER_CONFIRMED"

    def test_invalid_token_raises(self, hospital_admin_user):
        with pytest.raises(ValidationError, match="Invalid or tampered QR code"):
            confirm_delivery("nonexistenttoken123", 5, "Notes", hospital_admin_user)


@pytest.mark.django_db
class TestSLATimerLifecycle:
    def _setup_dispatched_with_sla(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        resource_request.expires_at = timezone.now() + timezone.timedelta(minutes=30)
        resource_request.save(update_fields=["expires_at", "updated_at"])
        dispatch_event = dispatch_request(resource_request, hospital_admin_user)
        qr_payload = getattr(dispatch_event, "delivery_qr_payload", {}) or {}
        qr_payload= str(qr_payload.get("qrPayload", "")).strip()
        assert qr_payload
        resource_request.refresh_from_db()
        dispatch_event = DispatchEvent.objects.get(request=resource_request)
        return qr_payload, dispatch_event

    def test_sla_stops_on_completion(self, resource_request, hospital_admin_user, hospital_b_admin_user):
        qr_payload, dispatch_event = self._setup_dispatched_with_sla(resource_request, hospital_admin_user)

        confirm_delivery(
            qr_payload,
            10,
            "completed",
            hospital_b_admin_user,
        )

        resource_request.refresh_from_db()
        dispatch_event.shipment.refresh_from_db()

        assert resource_request.workflow_state == ResourceRequest.WorkflowState.COMPLETED
        assert resource_request.expires_at is None
        assert resource_request.expired_at is not None
        assert dispatch_event.shipment.token_expires_at is None

    def test_sla_stops_on_return(self, resource_request, hospital_admin_user, hospital_b_admin_user):
        _, dispatch_event = self._setup_dispatched_with_sla(resource_request, hospital_admin_user)

        cancelled_req = cancel_request(resource_request, hospital_b_admin_user, reason="damaged in transit")
        dispatch_event.refresh_from_db()

        assert cancelled_req.workflow_state == ResourceRequest.WorkflowState.CANCELLED
        assert cancelled_req.expires_at is None
        assert cancelled_req.expired_at is not None

        verify_return(cancelled_req, dispatch_event.shipment.return_token, hospital_admin_user)

        cancelled_req.refresh_from_db()
        dispatch_event.shipment.refresh_from_db()

        assert cancelled_req.expires_at is None
        assert cancelled_req.expired_at is not None
        assert dispatch_event.shipment.status == Shipment.Status.RETURNED
        assert dispatch_event.shipment.token_expires_at is None

    def test_sla_runs_only_in_active_state(self, resource_request, hospital_admin_user):
        resource_request.expires_at = timezone.now() + timezone.timedelta(minutes=45)
        resource_request.save(update_fields=["expires_at", "updated_at"])

        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        assert resource_request.workflow_state == ResourceRequest.WorkflowState.RESERVED
        assert resource_request.expires_at is not None
        assert resource_request.expired_at is None

        dispatch_request(resource_request, hospital_admin_user)
        resource_request.refresh_from_db()
        assert resource_request.workflow_state == ResourceRequest.WorkflowState.IN_TRANSIT
        assert resource_request.expires_at is not None
        assert resource_request.expired_at is None


@pytest.mark.django_db
class TestWorkflowStateLock:
    def _complete_request(self, resource_request, hospital_admin_user, hospital_b_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_event = dispatch_request(resource_request, hospital_admin_user)

        qr_payload = getattr(dispatch_event, "delivery_qr_payload", {}) or {}
        qr_payload= str(qr_payload.get("qrPayload", "")).strip()
        assert qr_payload
        dispatch_event = DispatchEvent.objects.get(request=resource_request)
        confirm_delivery(
            qr_payload=qr_payload,
            quantity_received=10,
            notes="received",
            actor=hospital_b_admin_user,
        )
        resource_request.refresh_from_db()
        dispatch_event.refresh_from_db()
        return dispatch_event.shipment

    def test_transport_update_during_active_workflow_succeeds(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_request(resource_request, hospital_admin_user)

        shipment = DispatchEvent.objects.get(request=resource_request).shipment
        event = add_tracking_event(
            shipment=shipment,
            status=Shipment.Status.IN_TRANSIT,
            location="Route A",
            notes="en route",
            actor=hospital_admin_user,
        )

        assert event.status == Shipment.Status.IN_TRANSIT

    def test_transport_update_after_completed_workflow_fails(
        self,
        resource_request,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        shipment = self._complete_request(resource_request, hospital_admin_user, hospital_b_admin_user)

        with pytest.raises(ValidationError, match="Workflow already completed. No further updates allowed."):
            add_tracking_event(
                shipment=shipment,
                status=Shipment.Status.IN_TRANSIT,
                location="Route B",
                notes="late update",
                actor=hospital_admin_user,
            )

    def test_workflow_update_during_active_workflow_succeeds(
        self,
        resource_request,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()

        updated_req = confirm_payment(
            req=resource_request,
            payment_status=ResourceRequest.PaymentStatus.PAID,
            payment_note="active workflow payment",
            actor=hospital_b_admin_user,
        )

        assert updated_req.workflow_state == ResourceRequest.WorkflowState.PAYMENT_COMPLETED

    def test_workflow_update_after_completed_fails(
        self,
        resource_request,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        self._complete_request(resource_request, hospital_admin_user, hospital_b_admin_user)

        with pytest.raises(ValidationError, match="Workflow already completed. No further updates allowed."):
            confirm_payment(
                req=resource_request,
                payment_status=ResourceRequest.PaymentStatus.PAID,
                payment_note="late payment",
                actor=hospital_b_admin_user,
            )


@pytest.mark.django_db
class TestCancelRequest:
    def test_cancel_pending_request(self, resource_request, hospital_admin_user):
        req = cancel_request(resource_request, hospital_admin_user)
        assert req.status == ResourceRequest.Status.CANCELLED

    def test_cancel_approved_releases_reservation(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        inv = resource_request.catalog_item.inventory
        inv.refresh_from_db()
        reserved_before = inv.quantity_reserved
        cancel_request(resource_request, hospital_admin_user)
        inv.refresh_from_db()
        assert inv.quantity_reserved < reserved_before

    def test_cancel_dispatched_raises(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_request(resource_request, hospital_admin_user)
        resource_request.refresh_from_db()
        with pytest.raises(ValidationError, match="Cannot cancel"):
            cancel_request(resource_request, hospital_admin_user)


@pytest.mark.django_db
class TestExternalInventoryNotifications:
    def test_approve_emits_inventory_notification(self, resource_request, hospital_admin_user, mocker):
        mocker.patch("apps.requests.services.transaction.on_commit", side_effect=lambda cb: cb())
        mocked_notify = mocker.patch(
            "apps.hospitals.services.notify_hospital_inventory_update",
            return_value={"status": "skipped"},
        )

        approve_request(resource_request, "approved", 7, "OK", hospital_admin_user)

        assert mocked_notify.called
        kwargs = mocked_notify.call_args.kwargs
        assert kwargs["operation"] == "request_approved_inventory"
        assert kwargs["payload"]["inventory"]["quantity_reserved_delta"] == 7

    def test_confirm_delivery_notifies_both_hospitals_when_receiver_inventory_exists(
        self,
        resource_request,
        hospital_admin_user,
        hospital_b_admin_user,
        mocker,
    ):
        from apps.resources.models import ResourceCatalog, ResourceInventory

        # Ensure requesting hospital has a matching catalog/inventory so inbound transfer is recorded.
        ResourceCatalog.objects.create(
            hospital=resource_request.requesting_hospital,
            resource_type=resource_request.catalog_item.resource_type,
            name=resource_request.catalog_item.name,
            unit_of_measure=resource_request.catalog_item.unit_of_measure,
            is_shareable=True,
        )
        receiving_catalog = ResourceCatalog.objects.get(
            hospital=resource_request.requesting_hospital,
            name=resource_request.catalog_item.name,
        )
        ResourceInventory.objects.create(catalog_item=receiving_catalog, quantity_available=3)

        mocker.patch("apps.requests.services.transaction.on_commit", side_effect=lambda cb: cb())
        mocked_notify = mocker.patch(
            "apps.hospitals.services.notify_hospital_inventory_update",
            return_value={"status": "skipped"},
        )

        approve_request(resource_request, "approved", 5, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_event = dispatch_request(resource_request, hospital_admin_user)

        qr_payload = getattr(dispatch_event, "delivery_qr_payload", {}) or {}
        qr_payload= str(qr_payload.get("qrPayload", "")).strip()
        assert qr_payload
        dispatch_event = DispatchEvent.objects.get(request=resource_request)
        confirm_delivery(
            qr_payload=qr_payload,
            quantity_received=5,
            notes="received",
            actor=hospital_b_admin_user,
        )

        operations = [call.kwargs.get("operation") for call in mocked_notify.call_args_list]
        assert "transfer_confirmed_inventory" in operations
        assert "transfer_received_inventory" in operations
