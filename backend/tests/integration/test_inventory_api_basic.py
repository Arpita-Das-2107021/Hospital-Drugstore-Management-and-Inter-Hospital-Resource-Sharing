"""Basic integration tests for inventory API availability."""
import pytest
from rest_framework import status

INVENTORY_URL = "/api/v1/inventory/"


@pytest.mark.django_db
def test_unauthenticated_denied(api_client):
    response = api_client.get(INVENTORY_URL)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_authenticated_can_list(auth_client, catalog_item):
    # catalog_item fixture ensures there is inventory linked to the calling user's hospital
    response = auth_client.get(INVENTORY_URL)
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    # Ensure the inventory entries include resource type information
    assert "data" in payload
    assert len(payload["data"]) >= 1
    item = payload["data"][0]
    assert "resource_type" in item
    assert "resource_type_name" in item
