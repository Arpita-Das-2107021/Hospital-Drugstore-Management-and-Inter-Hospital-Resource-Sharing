"""Unit tests for the resources app services."""
import pytest
from rest_framework.exceptions import ValidationError

from apps.resources.models import ResourceInventory, ResourceShare, ResourceTransaction
from apps.resources.services import (
    adjust_inventory,
    create_catalog_item,
    create_resource_share,
    release_reservation,
    reserve_inventory,
)


@pytest.mark.django_db
class TestCreateCatalogItem:
    def test_creates_item_and_inventory(self, hospital, resource_type, hospital_admin_user):
        item = create_catalog_item(
            hospital,
            {"name": "Paracetamol 500mg", "resource_type": resource_type, "is_shareable": True},
        )
        assert item.pk is not None
        assert ResourceInventory.objects.filter(catalog_item=item).exists()

    def test_initial_inventory_zero(self, hospital, resource_type):
        item = create_catalog_item(
            hospital,
            {"name": "Ibuprofen 400mg", "resource_type": resource_type},
        )
        inv = ResourceInventory.objects.get(catalog_item=item)
        assert inv.quantity_available == 0
        assert inv.quantity_reserved == 0


@pytest.mark.django_db
class TestAdjustInventory:
    def test_positive_delta_increases_stock(self, catalog_item, hospital_admin_user):
        inv = catalog_item.inventory
        original_qty = inv.quantity_available
        updated = adjust_inventory(inv, 50, "RESTOCK", hospital_admin_user, notes="Restocked")
        assert updated.quantity_available == original_qty + 50

    def test_creates_transaction_record(self, catalog_item, hospital_admin_user):
        inv = catalog_item.inventory
        adjust_inventory(inv, 10, "RESTOCK", hospital_admin_user)
        assert ResourceTransaction.objects.filter(inventory=inv).exists()

    def test_negative_delta_reduces_stock(self, catalog_item, hospital_admin_user):
        inv = catalog_item.inventory
        original_qty = inv.quantity_available
        updated = adjust_inventory(inv, -20, "DISPATCH", hospital_admin_user)
        assert updated.quantity_available == original_qty - 20

    def test_excessive_negative_delta_raises(self, catalog_item, hospital_admin_user):
        inv = catalog_item.inventory
        with pytest.raises(ValidationError, match="Insufficient quantity"):
            adjust_inventory(inv, -9999, "DISPATCH", hospital_admin_user)


@pytest.mark.django_db
class TestReserveInventory:
    def test_reserve_increases_reserved(self, catalog_item):
        inv = catalog_item.inventory
        updated = reserve_inventory(inv, 10)
        assert updated.quantity_reserved == 10

    def test_reserve_does_not_reduce_available(self, catalog_item):
        inv = catalog_item.inventory
        original_qty = inv.quantity_available
        reserve_inventory(inv, 10)
        inv.refresh_from_db()
        assert inv.quantity_available == original_qty

    def test_reserve_beyond_free_raises(self, catalog_item):
        inv = catalog_item.inventory
        with pytest.raises(ValidationError, match="free quantity"):
            reserve_inventory(inv, 9999)


@pytest.mark.django_db
class TestReleaseReservation:
    def test_release_decreases_reserved(self, catalog_item):
        inv = catalog_item.inventory
        reserve_inventory(inv, 20)
        inv.refresh_from_db()
        updated = release_reservation(inv, 10)
        assert updated.quantity_reserved == 10

    def test_release_more_than_reserved_clamps_to_zero(self, catalog_item):
        inv = catalog_item.inventory
        inv.quantity_reserved = 5
        inv.save()
        updated = release_reservation(inv, 100)
        assert updated.quantity_reserved == 0


@pytest.mark.django_db
class TestCreateResourceShare:
    def test_create_share_for_shareable_item(self, catalog_item, hospital, hospital_admin_user):
        catalog_item.is_shareable = True
        catalog_item.save()
        share = create_resource_share(
            hospital,
            catalog_item.id,
            {"quantity_offered": 50, "notes": "Available for sharing"},
            hospital_admin_user,
        )
        assert share.pk is not None
        assert share.hospital == hospital

    def test_non_shareable_item_raises(self, hospital, resource_type, hospital_admin_user):
        from apps.resources.services import create_catalog_item as _create
        item = _create(
            hospital,
            {"name": "Non-shareable resource", "resource_type": resource_type, "is_shareable": False},
        )
        with pytest.raises(ValidationError, match="not marked as shareable"):
            create_resource_share(hospital, item.id, {"quantity_offered": 5}, hospital_admin_user)

    def test_catalog_item_not_found_raises(self, hospital, hospital_admin_user):
        import uuid
        with pytest.raises(ValidationError, match="not found"):
            create_resource_share(hospital, uuid.uuid4(), {"quantity_offered": 5}, hospital_admin_user)
