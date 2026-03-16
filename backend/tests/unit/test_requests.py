"""Unit tests for the requests app services (lifecycle tests)."""
import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.requests.models import (
    DeliveryToken,
    DispatchEvent,
    ResourceRequest,
    ResourceRequestApproval,
)
from apps.requests.services import (
    approve_request,
    cancel_request,
    confirm_delivery,
    create_resource_request,
    dispatch_request,
)


@pytest.fixture
def resource_request(db, hospital, hospital_b, catalog_item, hospital_admin_user):
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
        actor=hospital_admin_user,
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
    def test_dispatch_approved_request(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        evt = dispatch_request(resource_request, hospital_admin_user)
        assert isinstance(evt, DispatchEvent)
        resource_request.refresh_from_db()
        assert resource_request.status == ResourceRequest.Status.DISPATCHED

    def test_dispatch_creates_delivery_token(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_request(resource_request, hospital_admin_user)
        assert DeliveryToken.objects.filter(request=resource_request).exists()

    def test_dispatch_non_approved_raises(self, resource_request, hospital_admin_user):
        # Still PENDING
        with pytest.raises(ValidationError, match="approved"):
            dispatch_request(resource_request, hospital_admin_user)


@pytest.mark.django_db
class TestConfirmDelivery:
    def _setup_dispatched(self, resource_request, hospital_admin_user):
        approve_request(resource_request, "approved", 10, "OK", hospital_admin_user)
        resource_request.refresh_from_db()
        dispatch_request(resource_request, hospital_admin_user)
        resource_request.refresh_from_db()
        return DeliveryToken.objects.get(request=resource_request)

    def test_confirm_with_valid_token(self, resource_request, hospital_admin_user):
        token = self._setup_dispatched(resource_request, hospital_admin_user)
        evt = confirm_delivery(token.token, 10, "All received", hospital_admin_user)
        assert evt.pk is not None
        resource_request.refresh_from_db()
        assert resource_request.status == ResourceRequest.Status.DELIVERED

    def test_token_marked_used_after_confirm(self, resource_request, hospital_admin_user):
        token = self._setup_dispatched(resource_request, hospital_admin_user)
        confirm_delivery(token.token, 10, "Received", hospital_admin_user)
        token.refresh_from_db()
        assert token.used_at is not None

    def test_expired_token_raises(self, resource_request, hospital_admin_user):
        token = self._setup_dispatched(resource_request, hospital_admin_user)
        token.expires_at = timezone.now() - timezone.timedelta(hours=1)
        token.save()
        with pytest.raises(ValidationError, match="expired or already used"):
            confirm_delivery(token.token, 10, "Late delivery", hospital_admin_user)

    def test_invalid_token_raises(self):
        from rest_framework.exceptions import NotFound
        with pytest.raises(NotFound):
            confirm_delivery("nonexistenttoken123", 5, "Notes", None)


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
