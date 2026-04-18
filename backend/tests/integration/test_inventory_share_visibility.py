"""Integration tests for inventory share visibility endpoint."""
import pytest
from rest_framework import status

SHARE_VISIBILITY_URL = "/api/v1/inventory/share-visibility/"


@pytest.mark.django_db
class TestInventoryShareVisibilityList:
    """Test GET /api/v1/inventory/share-visibility/"""

    def test_unauthenticated_denied(self, api_client):
        """Unauthenticated users cannot access the endpoint."""
        response = api_client.get(SHARE_VISIBILITY_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_sees_only_share_related_inventory(self, auth_client, catalog_item, resource_inventory):
        """Hospital admin sees only inventory rows tied to active shares or committed requests."""
        response = auth_client.get(SHARE_VISIBILITY_URL)
        assert response.status_code == status.HTTP_200_OK

        data = response.json()["data"]
        visibility_item = next(
            (item for item in data if str(item["inventory_id"]) == str(resource_inventory.id)),
            None,
        )
        assert visibility_item is None

    def test_hospital_admin_sees_inventory_with_existing_share(
        self, auth_client, catalog_item, resource_inventory, resource_share
    ):
        """Hospital admin sees inventory with existing resource share."""
        response = auth_client.get(SHARE_VISIBILITY_URL)
        assert response.status_code == status.HTTP_200_OK

        data = response.json()["data"]
        visibility_item = next(
            (item for item in data if str(item["inventory_id"]) == str(resource_inventory.id)),
            None
        )
        assert visibility_item is not None
        assert visibility_item["shared_quantity"] == resource_share.quantity_offered
        assert visibility_item["available_share_quantity"] == resource_share.quantity_offered
        assert visibility_item["reserved_quantity"] == 0
        assert visibility_item["transferred_quantity"] == 0
        assert str(visibility_item["share_id"]) == str(resource_share.id)

    def test_super_admin_cannot_access(self, super_admin_client):
        """Super admins cannot access this endpoint (not tied to a hospital)."""
        response = super_admin_client.get(SHARE_VISIBILITY_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_hospital_b_admin_cannot_see_hospital_a_inventory(
        self, hospital_b_auth_client, catalog_item, resource_inventory
    ):
        """Hospital B admin cannot see Hospital A's inventory."""
        response = hospital_b_auth_client.get(SHARE_VISIBILITY_URL)
        assert response.status_code == status.HTTP_200_OK

        data = response.json()["data"]
        inventory_ids = [str(item["inventory_id"]) for item in data]

        assert str(resource_inventory.id) not in inventory_ids

    def test_response_has_required_fields(self, auth_client, resource_inventory):
        """Response includes all required fields."""
        response = auth_client.get(SHARE_VISIBILITY_URL)
        assert response.status_code == status.HTTP_200_OK

        data = response.json()["data"]
        if len(data) > 0:
            item = data[0]
            required_fields = {
                "inventory_id",
                "product_name",
                "unit",
                "total_quantity",
                "shared_quantity",
                "reserved_quantity",
                "transferred_quantity",
                "available_share_quantity",
                "share_id",
            }
            assert required_fields.issubset(item.keys())


@pytest.mark.django_db
class TestInventoryShareVisibilityCreate:
    """Test POST /api/v1/inventory/share-visibility/"""

    def test_unauthenticated_denied(self, api_client, resource_inventory):
        """Unauthenticated users cannot create shares."""
        response = api_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": 2,
            }
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_create_share(self, auth_client, resource_inventory):
        """Hospital admin can create a new resource share."""
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": 2,
            }
        )
        assert response.status_code == status.HTTP_201_CREATED

        data = response.json()["data"]
        assert str(data["inventory_id"]) == str(resource_inventory.id)
        assert data["shared_quantity"] == 2
        assert data["share_id"] is not None

    def test_hospital_admin_can_update_existing_share(
        self, auth_client, resource_inventory, resource_share
    ):
        """Hospital admin can update an existing resource share."""
        new_quantity = 5
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": new_quantity,
            }
        )
        assert response.status_code == status.HTTP_200_OK

        data = response.json()["data"]
        assert data["shared_quantity"] == new_quantity
        assert str(data["share_id"]) == str(resource_share.id)

    def test_cannot_exceed_available_quantity(self, auth_client, resource_inventory):
        """Shared quantity cannot exceed available inventory."""
        available_qty = resource_inventory.quantity_available
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": available_qty + 1,
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "cannot exceed" in response.json()["data"]["detail"].lower()

    def test_can_share_exact_available_quantity(self, auth_client, resource_inventory):
        """Hospital admin can share the exact available quantity."""
        available_qty = resource_inventory.quantity_available
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": available_qty,
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["data"]["shared_quantity"] == available_qty

    def test_can_share_zero_quantity(self, auth_client, resource_inventory):
        """Hospital admin can set shared quantity to 0 (effectively hiding)."""
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": 0,
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["data"]["shared_quantity"] == 0

    def test_inventory_not_found(self, auth_client):
        """Returns 404 if inventory doesn't exist."""
        import uuid
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(uuid.uuid4()),
                "shared_quantity": 1,
            }
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_cannot_modify_other_hospital_inventory(
        self, hospital_b_auth_client, resource_inventory
    ):
        """Hospital B admin cannot modify Hospital A's inventory."""
        response = hospital_b_auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": 1,
            }
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_non_hospital_admin_staff_cannot_create(
        self, api_client, staff_user, resource_inventory
    ):
        """Non-admin staff cannot create/update shares (only hospital admins can)."""
        # Authenticate as staff user
        response = api_client.post(
            "/api/auth/login/",
            {
                "email": staff_user.email,
                "password": "Test@1234",
            },
            format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        token = response.json()["data"]["access"]

        # Try to create share
        response = api_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": 1,
            },
            HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_required_fields_validation(self, auth_client):
        """Missing required fields returns validation error."""
        # Missing inventory_id
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {"shared_quantity": 1}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # Missing shared_quantity
        import uuid
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {"inventory_id": str(uuid.uuid4())}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_negative_shared_quantity_rejected(self, auth_client, resource_inventory):
        """Negative shared quantity is rejected."""
        response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": -1,
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestInventoryShareVisibilityIntegration:
    """Integration tests combining GET and POST operations."""

    def test_create_share_visible_in_list(self, auth_client, resource_inventory):
        """Newly created share appears in visibility list."""
        # POST to create share
        post_response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": 3,
            }
        )
        assert post_response.status_code == status.HTTP_201_CREATED
        share_id = post_response.json()["data"]["share_id"]

        # GET to verify
        get_response = auth_client.get(SHARE_VISIBILITY_URL)
        assert get_response.status_code == status.HTTP_200_OK

        data = get_response.json()["data"]
        visibility_item = next(
            (item for item in data if str(item["inventory_id"]) == str(resource_inventory.id)),
            None
        )
        assert visibility_item is not None
        assert visibility_item["shared_quantity"] == 3
        assert str(visibility_item["share_id"]) == str(share_id)

    def test_update_share_reflected_in_list(self, auth_client, resource_inventory, resource_share):
        """Updated share quantity is reflected in visibility list."""
        new_quantity = 7

        # POST to update share
        post_response = auth_client.post(
            SHARE_VISIBILITY_URL,
            {
                "inventory_id": str(resource_inventory.id),
                "shared_quantity": new_quantity,
            }
        )
        assert post_response.status_code == status.HTTP_200_OK

        # GET to verify
        get_response = auth_client.get(SHARE_VISIBILITY_URL)
        data = get_response.json()["data"]

        visibility_item = next(
            (item for item in data if str(item["inventory_id"]) == str(resource_inventory.id)),
            None
        )
        assert visibility_item["shared_quantity"] == new_quantity

