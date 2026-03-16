"""End-to-end integration test: full resource request lifecycle."""
import pytest
from rest_framework import status

from apps.requests.models import DeliveryToken, ResourceRequest

REQUESTS_URL = "/api/v1/requests/"
CONFIRM_URL = "/api/v1/requests/confirm-delivery/"


def approve_url(pk):
    return f"{REQUESTS_URL}{pk}/approve/"


def dispatch_url(pk):
    return f"{REQUESTS_URL}{pk}/dispatch/"


@pytest.fixture
def shareable_catalog_item(catalog_item):
    catalog_item.is_shareable = True
    catalog_item.save()
    return catalog_item


@pytest.fixture
def request_payload(hospital, shareable_catalog_item):
    return {
        "supplying_hospital": str(hospital.id),
        "catalog_item": str(shareable_catalog_item.id),
        "quantity_requested": 10,
        "priority": "normal",
    }


@pytest.fixture
def created_request(hospital_b_auth_client, request_payload):
    """
    Create the request using hospital_b_auth_client (a user from a different hospital)
    requesting resources from hospital (the supplying hospital).
    """
    response = hospital_b_auth_client.post(REQUESTS_URL, request_payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.json()
    return response.json()["data"]


@pytest.mark.django_db
class TestRequestLifecycle:
    """End-to-end test: create → approve → dispatch → confirm delivery."""

    def test_create_request(self, created_request):
        assert created_request["status"] == "pending"
        assert created_request["quantity_requested"] == 10

    def test_approve_request(self, super_admin_client, created_request):
        req_id = created_request["id"]
        response = super_admin_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "Stock available"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()["data"]["status"] == "approved"

    def test_dispatch_request(self, super_admin_client, created_request):
        req_id = created_request["id"]
        # First approve
        super_admin_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "Available"},
            format="json",
        )
        # Then dispatch
        response = super_admin_client.post(dispatch_url(req_id), {}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.json()

    def test_delivery_token_created_after_dispatch(self, super_admin_client, created_request):
        req_id = created_request["id"]
        super_admin_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "OK"},
            format="json",
        )
        super_admin_client.post(dispatch_url(req_id), {}, format="json")
        token_exists = DeliveryToken.objects.filter(
            request__id=req_id
        ).exists()
        assert token_exists

    def test_confirm_delivery_with_valid_token(self, hospital_b_auth_client, super_admin_client, created_request):
        req_id = created_request["id"]
        super_admin_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "OK"},
            format="json",
        )
        super_admin_client.post(dispatch_url(req_id), {}, format="json")

        token = DeliveryToken.objects.get(request__id=req_id)
        response = hospital_b_auth_client.post(
            CONFIRM_URL,
            {"token": token.token, "quantity_received": 10, "notes": "Received in good condition"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.json()

        req = ResourceRequest.objects.get(id=req_id)
        assert req.status == ResourceRequest.Status.DELIVERED

    def test_confirm_with_invalid_token_returns_404(self, auth_client):
        response = auth_client.post(
            CONFIRM_URL,
            {"token": "completelyinvalidtoken", "quantity_received": 5, "notes": ""},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestRequestCancellation:
    def test_cancel_pending_request(self, hospital_b_auth_client, created_request):
        req_id = created_request["id"]
        response = hospital_b_auth_client.delete(f"{REQUESTS_URL}{req_id}/")
        assert response.status_code == status.HTTP_200_OK
        req = ResourceRequest.objects.get(id=req_id)
        assert req.status == ResourceRequest.Status.CANCELLED

    def test_reject_request(self, super_admin_client, created_request):
        req_id = created_request["id"]
        response = super_admin_client.post(
            approve_url(req_id),
            {"decision": "rejected", "quantity_approved": 0, "reason": "Not enough stock"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["status"] == "rejected"
