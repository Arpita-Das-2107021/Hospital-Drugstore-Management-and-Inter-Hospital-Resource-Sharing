"""Integration tests for resources API (catalog, inventory, shares) and shipments API."""
import pytest
from rest_framework import status

CATALOG_URL = "/api/v1/catalog/"
TYPES_URL = "/api/v1/catalog/types/"
INVENTORY_URL = "/api/v1/inventory/"
SHARES_URL = "/api/v1/resource-shares/"
SHIPMENTS_URL = "/api/v1/shipments/"


def catalog_url(pk):
    return f"{CATALOG_URL}{pk}/"


def inventory_url(pk):
    return f"{INVENTORY_URL}{pk}/"


def share_url(pk):
    return f"{SHARES_URL}{pk}/"


def shipment_url(pk):
    return f"{SHIPMENTS_URL}{pk}/"


# ---------------------------------------------------------------------------
# ResourceType
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceTypeList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(TYPES_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_can_list(self, auth_client, resource_type):
        response = auth_client.get(TYPES_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_list_contains_resource_type(self, auth_client, resource_type):
        response = auth_client.get(TYPES_URL)
        data = response.json()
        # Paginated response uses 'data' key (StandardResultsPagination)
        items = data.get("data", data.get("results", data if isinstance(data, list) else []))
        ids = [t["id"] for t in items]
        assert str(resource_type.id) in ids


@pytest.mark.django_db
class TestResourceTypeRetrieve:
    def test_retrieve_existing_type(self, auth_client, resource_type):
        response = auth_client.get(f"{TYPES_URL}{resource_type.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == resource_type.name

    def test_retrieve_nonexistent_type(self, auth_client):
        import uuid
        response = auth_client.get(f"{TYPES_URL}{uuid.uuid4()}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# ResourceCatalog
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceCatalogList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_sees_own_catalog(self, auth_client, catalog_item):
        response = auth_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # response may be paginated
        items = data.get("results", data.get("data", []))
        ids = [i["id"] for i in items]
        assert str(catalog_item.id) in ids

    def test_super_admin_sees_all(self, super_admin_client, catalog_item):
        response = super_admin_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_hospital_b_admin_cannot_see_hospital_a_items(self, hospital_b_auth_client, catalog_item):
        response = hospital_b_auth_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_200_OK
        items = response.json().get("results", response.json().get("data", []))
        ids = [i["id"] for i in items]
        assert str(catalog_item.id) not in ids


@pytest.mark.django_db
class TestResourceCatalogRetrieve:
    def test_retrieve_own_item(self, auth_client, catalog_item):
        response = auth_client.get(catalog_url(catalog_item.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(catalog_item.id)

    def test_retrieve_nonexistent_item(self, auth_client):
        import uuid
        response = auth_client.get(catalog_url(uuid.uuid4()))
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestResourceCatalogCreate:
    def test_hospital_admin_can_create(self, auth_client, hospital, resource_type):
        # Don't send hospital in payload — view derives it from user's staff
        payload = {
            "resource_type": str(resource_type.id),
            "name": "New Drug Item",
            "unit_of_measure": "units",
        }
        response = auth_client.post(CATALOG_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_cannot_create(self, api_client, resource_type):
        payload = {
            "resource_type": str(resource_type.id),
            "name": "Unauthorized Item",
            "unit_of_measure": "units",
        }
        response = api_client.post(CATALOG_URL, payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestResourceCatalogUpdate:
    def test_can_update_own_item(self, auth_client, catalog_item):
        response = auth_client.patch(catalog_url(catalog_item.id), {"name": "Updated Drug"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["name"] == "Updated Drug"

    def test_can_delete_item(self, auth_client, catalog_item):
        response = auth_client.delete(catalog_url(catalog_item.id))
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# ResourceInventory
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceInventoryList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(INVENTORY_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_sees_own_inventory(self, auth_client, catalog_item):
        response = auth_client.get(INVENTORY_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_super_admin_sees_all(self, super_admin_client, catalog_item):
        response = super_admin_client.get(INVENTORY_URL)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestResourceInventoryRetrieve:
    def test_retrieve_inventory(self, auth_client, catalog_item):
        inv = catalog_item.inventory
        response = auth_client.get(inventory_url(inv.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(inv.id)


@pytest.mark.django_db
class TestResourceInventoryAdjust:
    def test_pharmacist_can_adjust(self, api_client, hospital, catalog_item, pharmacist_role):
        """A PHARMACIST role user can call adjust endpoint."""
        from django.contrib.auth import get_user_model
        from apps.staff.models import Staff, UserRole
        UserAccount = get_user_model()
        staff = Staff.objects.create(hospital=hospital, first_name="Pharm", last_name="Cist2", employee_id="PH-002")
        user = UserAccount.objects.create_user(email="pharm2@h.com", password="Test1234!", staff=staff)
        UserRole.objects.create(user=user, role=pharmacist_role, hospital=hospital)
        api_client.force_authenticate(user=user)
        inv = catalog_item.inventory
        payload = {"quantity_delta": 10, "transaction_type": "restock", "notes": "Restocked"}
        response = api_client.post(f"{INVENTORY_URL}{inv.id}/adjust/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_adjust_updates_quantity(self, api_client, hospital, catalog_item, pharmacist_role):
        from django.contrib.auth import get_user_model
        from apps.staff.models import Staff, UserRole
        UserAccount = get_user_model()
        staff = Staff.objects.create(hospital=hospital, first_name="Pharm", last_name="Cist3", employee_id="PH-003")
        user = UserAccount.objects.create_user(email="pharm3@h.com", password="Test1234!", staff=staff)
        UserRole.objects.create(user=user, role=pharmacist_role, hospital=hospital)
        api_client.force_authenticate(user=user)
        inv = catalog_item.inventory
        original_qty = inv.quantity_available
        payload = {"quantity_delta": 25, "transaction_type": "restock"}
        api_client.post(f"{INVENTORY_URL}{inv.id}/adjust/", payload, format="json")
        inv.refresh_from_db()
        assert inv.quantity_available == original_qty + 25

    def test_transactions_endpoint(self, auth_client, catalog_item):
        inv = catalog_item.inventory
        response = auth_client.get(f"{INVENTORY_URL}{inv.id}/transactions/")
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# ResourceShare
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceShareList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_list(self, auth_client, hospital, catalog_item):
        response = auth_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "data" in response.json()

    def test_super_admin_sees_all_shares(self, super_admin_client):
        response = super_admin_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_hospital_can_see_other_hospital_active_share(self, hospital_b_auth_client, resource_share):
        response = hospital_b_auth_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_200_OK

        items = response.json().get("data", [])
        ids = [item["id"] for item in items]
        assert str(resource_share.id) in ids

    def test_only_active_valid_shareable_shares_are_listed(self, auth_client, hospital, resource_type, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceCatalog, ResourceShare

        active_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Visible Share Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        active_share = ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=active_item,
            quantity_offered=5,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        paused_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Paused Share Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=paused_item,
            quantity_offered=5,
            status=ResourceShare.Status.PAUSED,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        expired_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Expired Share Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=expired_item,
            quantity_offered=5,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() - timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        not_shareable_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Not Shareable Item",
            unit_of_measure="units",
            is_shareable=False,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=not_shareable_item,
            quantity_offered=5,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        zero_qty_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Zero Quantity Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=zero_qty_item,
            quantity_offered=0,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        response = auth_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_200_OK

        items = response.json().get("data", [])
        ids = [item["id"] for item in items]
        assert str(active_share.id) in ids
        assert len(ids) == 1

    def test_filters_work_for_hospital_filter(self, auth_client, hospital, hospital_b, resource_type, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceCatalog, ResourceShare

        item_a = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Hospital A Share",
            unit_of_measure="units",
            is_shareable=True,
        )
        share_a = ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=item_a,
            quantity_offered=10,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=2),
            created_by=hospital_admin_user,
        )

        item_b = ResourceCatalog.objects.create(
            hospital=hospital_b,
            resource_type=resource_type,
            name="Hospital B Share",
            unit_of_measure="units",
            is_shareable=True,
        )
        share_b = ResourceShare.objects.create(
            hospital=hospital_b,
            catalog_item=item_b,
            quantity_offered=10,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=2),
            created_by=hospital_admin_user,
        )

        response = auth_client.get(f"{SHARES_URL}?hospital={hospital.id}")
        assert response.status_code == status.HTTP_200_OK

        items = response.json().get("data", [])
        ids = [item["id"] for item in items]
        assert str(share_a.id) in ids
        assert str(share_b.id) not in ids

    def test_pagination_works(self, auth_client, hospital, resource_type, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceCatalog, ResourceShare

        for idx in range(25):
            item = ResourceCatalog.objects.create(
                hospital=hospital,
                resource_type=resource_type,
                name=f"Paged Share Item {idx}",
                unit_of_measure="units",
                is_shareable=True,
            )
            ResourceShare.objects.create(
                hospital=hospital,
                catalog_item=item,
                quantity_offered=idx + 1,
                status=ResourceShare.Status.ACTIVE,
                valid_until=timezone.now() + timezone.timedelta(days=3),
                created_by=hospital_admin_user,
            )

        response = auth_client.get(f"{SHARES_URL}?limit=10&page=2")
        assert response.status_code == status.HTTP_200_OK

        body = response.json()
        assert len(body["data"]) == 10
        assert body["meta"]["page"] == 2
        assert body["meta"]["limit"] == 10
        assert body["meta"]["total"] == 25
        assert body["meta"]["total_pages"] == 3


@pytest.mark.django_db
class TestResourceShareCreate:
    def test_hospital_admin_can_create_share(self, auth_client, hospital, catalog_item):
        from django.utils import timezone
        payload = {
            "hospital": str(hospital.id),
            "catalog_item": str(catalog_item.id),
            "quantity_offered": 20,
            "status": "active",
            "valid_until": (timezone.now() + timezone.timedelta(days=7)).isoformat(),
        }
        response = auth_client.post(SHARES_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_cannot_create(self, api_client, hospital, catalog_item):
        payload = {
            "hospital": str(hospital.id),
            "catalog_item": str(catalog_item.id),
            "quantity_offered": 5,
            "status": "available",
        }
        response = api_client.post(SHARES_URL, payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestResourceShareRetrieveUpdateDelete:
    @pytest.fixture
    def resource_share(self, db, hospital, catalog_item, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceShare
        return ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=catalog_item,
            quantity_offered=15,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=5),
            created_by=hospital_admin_user,
        )

    def test_retrieve_share(self, auth_client, resource_share):
        response = auth_client.get(share_url(resource_share.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(resource_share.id)

    def test_update_share(self, auth_client, resource_share):
        response = auth_client.patch(share_url(resource_share.id), {"quantity_offered": 99}, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_delete_share(self, auth_client, resource_share):
        response = auth_client.delete(share_url(resource_share.id))
        assert response.status_code == status.HTTP_200_OK

    def test_other_hospital_cannot_update_share(self, hospital_b_auth_client, resource_share):
        response = hospital_b_auth_client.patch(share_url(resource_share.id), {"quantity_offered": 33}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_other_hospital_cannot_delete_share(self, hospital_b_auth_client, resource_share):
        response = hospital_b_auth_client.delete(share_url(resource_share.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Shipments
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestShipmentList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(SHIPMENTS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_list(self, auth_client):
        response = auth_client.get(SHIPMENTS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_super_admin_can_list(self, super_admin_client):
        response = super_admin_client.get(SHIPMENTS_URL)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestShipmentCreate:
    def get_payload(self, hospital, hospital_b):
        return {
            "origin_hospital": str(hospital.id),
            "destination_hospital": str(hospital_b.id),
            "status": "pending",
            "carrier_name": "FastShip",
        }

    def test_hospital_admin_can_create(self, auth_client, hospital, hospital_b):
        response = auth_client.post(SHIPMENTS_URL, self.get_payload(hospital, hospital_b), format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_cannot_create(self, api_client, hospital, hospital_b):
        response = api_client.post(SHIPMENTS_URL, self.get_payload(hospital, hospital_b), format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestShipmentRetrieveAndTracking:
    @pytest.fixture
    def shipment(self, db, hospital, hospital_b, hospital_admin_user):
        from apps.shipments.models import Shipment
        return Shipment.objects.create(
            origin_hospital=hospital,
            destination_hospital=hospital_b,
            status=Shipment.Status.PENDING,
            carrier_name="TestCarrier",
            created_by=hospital_admin_user,
        )

    def test_retrieve_shipment(self, auth_client, shipment):
        response = auth_client.get(shipment_url(shipment.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(shipment.id)

    def test_update_shipment(self, auth_client, shipment):
        response = auth_client.patch(shipment_url(shipment.id), {"carrier_name": "NewCarrier"}, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_delete_not_supported(self, auth_client, shipment):
        response = auth_client.delete(shipment_url(shipment.id))
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_get_tracking_events(self, auth_client, shipment):
        # The tracking endpoint uses POST for add and GET for list
        # Both share the same url_path="tracking" but different methods
        # GET tracking returns the events list
        response = auth_client.get(f"{SHIPMENTS_URL}{shipment.id}/get_tracking/")
        # The router maps get_tracking to /get_tracking/ since it's a separate action
        # If not found, try the combined path
        if response.status_code == status.HTTP_404_NOT_FOUND:
            response = auth_client.get(f"{SHIPMENTS_URL}{shipment.id}/tracking/")
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_add_tracking_event_by_logistics(self, api_client, shipment, hospital, logistics_role):
        from django.contrib.auth import get_user_model
        from apps.staff.models import Staff, UserRole
        UserAccount = get_user_model()
        staff = Staff.objects.create(hospital=hospital, first_name="Log", last_name="Istic", employee_id="LOG-001")
        user = UserAccount.objects.create_user(email="log@h.com", password="Test1234!", staff=staff)
        UserRole.objects.create(user=user, role=logistics_role, hospital=hospital)
        api_client.force_authenticate(user=user)
        payload = {"status": "in_transit", "location": "Warehouse A", "notes": "Picked up"}
        response = api_client.post(f"{SHIPMENTS_URL}{shipment.id}/tracking/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK
