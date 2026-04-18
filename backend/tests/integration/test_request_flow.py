"""End-to-end integration test: full resource request lifecycle."""
import pytest
from rest_framework import status

from apps.requests.models import DeliveryToken, ResourceRequest

REQUESTS_URL = "/api/v1/requests/"


def approve_url(pk):
    return f"{REQUESTS_URL}{pk}/approve/"


def dispatch_url(pk):
    return f"{REQUESTS_URL}{pk}/dispatch/"


def transfer_confirm_url(pk):
    return f"{REQUESTS_URL}{pk}/transfer-confirm/"


def shipment_url(pk):
    return f"/api/v1/shipments/{pk}/"


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

    def test_approve_request(self, auth_client, created_request):
        req_id = created_request["id"]
        response = auth_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "Stock available"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()["data"]["status"] == "approved"

    def test_dispatch_request(self, auth_client, created_request):
        req_id = created_request["id"]
        # First approve
        auth_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "Available"},
            format="json",
        )
        # Then dispatch
        response = auth_client.post(dispatch_url(req_id), {}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.json()

    def test_delivery_token_created_after_dispatch(self, auth_client, created_request):
        req_id = created_request["id"]
        auth_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "OK"},
            format="json",
        )
        auth_client.post(dispatch_url(req_id), {}, format="json")
        token_exists = DeliveryToken.objects.filter(
            request__id=req_id
        ).exists()
        assert token_exists

    def test_confirm_delivery_with_valid_token(self, hospital_b_auth_client, auth_client, created_request):
        req_id = created_request["id"]
        auth_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "OK"},
            format="json",
        )
        dispatch_response = auth_client.post(dispatch_url(req_id), {}, format="json")
        assert dispatch_response.status_code == status.HTTP_200_OK, dispatch_response.json()
        dispatch_payload = dispatch_response.json().get("data", {})
        qr_payload = dispatch_payload.get("delivery_qr", {})
        qr_payload= str(qr_payload.get("qrPayload", "")).strip()
        assert qr_payload

        response = hospital_b_auth_client.post(
            transfer_confirm_url(req_id),
            {
                "qrPayload": qr_payload,
                "quantity_received": 10,
                "notes": "Received in good condition",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()["data"]["completion_stage"] == "RECEIVER_CONFIRMED"

        req = ResourceRequest.objects.get(id=req_id)
        assert req.status == ResourceRequest.Status.FULFILLED

    def test_confirm_with_invalid_qr_payload_returns_400(self, auth_client, created_request):
        req_id = created_request["id"]
        auth_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "OK"},
            format="json",
        )
        dispatch_response = auth_client.post(dispatch_url(req_id), {}, format="json")
        assert dispatch_response.status_code == status.HTTP_200_OK, dispatch_response.json()

        response = auth_client.post(
            transfer_confirm_url(req_id),
            {
                "qrPayload": "completelyinvalidtoken",
                "quantity_received": 5,
                "notes": "",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_shipment_api_hides_legacy_token_fields(self, auth_client, created_request):
        req_id = created_request["id"]
        auth_client.post(
            approve_url(req_id),
            {"decision": "approved", "quantity_approved": 10, "reason": "OK"},
            format="json",
        )
        dispatch_response = auth_client.post(dispatch_url(req_id), {}, format="json")
        assert dispatch_response.status_code == status.HTTP_200_OK, dispatch_response.json()
        shipment_id = dispatch_response.json().get("data", {}).get("shipment")
        assert shipment_id

        shipment_response = auth_client.get(shipment_url(shipment_id), format="json")
        assert shipment_response.status_code == status.HTTP_200_OK, shipment_response.json()
        shipment_payload = shipment_response.json().get("data", {})

        assert "qr_payload" not in shipment_payload
        assert "receive_token" not in shipment_payload
        assert "return_token" not in shipment_payload
        assert "token_expires_at" not in shipment_payload


@pytest.mark.django_db
class TestRequestCancellation:
    def test_cancel_pending_request(self, hospital_b_auth_client, created_request):
        req_id = created_request["id"]
        response = hospital_b_auth_client.delete(f"{REQUESTS_URL}{req_id}/")
        assert response.status_code == status.HTTP_200_OK
        req = ResourceRequest.objects.get(id=req_id)
        assert req.status == ResourceRequest.Status.CANCELLED

    def test_reject_request(self, auth_client, created_request):
        req_id = created_request["id"]
        response = auth_client.post(
            approve_url(req_id),
            {"decision": "rejected", "quantity_approved": 0, "reason": "Not enough stock"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["status"] == "rejected"
