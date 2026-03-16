"""Unit tests for the shipments app services."""
import pytest
from django.utils import timezone

from apps.shipments.models import Shipment, ShipmentTracking
from apps.shipments.services import add_tracking_event, create_shipment


@pytest.fixture
def shipment(db, hospital, hospital_b, hospital_admin_user):
    return create_shipment(
        origin_hospital=hospital,
        destination_hospital=hospital_b,
        data={"reference": "SHIP-0001"},
        actor=hospital_admin_user,
    )


@pytest.mark.django_db
class TestCreateShipment:
    def test_creates_shipment(self, hospital, hospital_b, hospital_admin_user):
        ship = create_shipment(hospital, hospital_b, {"reference": "SHIP-TEST"}, hospital_admin_user)
        assert ship.pk is not None
        assert ship.status == Shipment.Status.PENDING

    def test_auto_creates_first_tracking_event(self, hospital, hospital_b, hospital_admin_user):
        ship = create_shipment(hospital, hospital_b, {"reference": "SHIP-T2"}, hospital_admin_user)
        tracking = ShipmentTracking.objects.filter(shipment=ship)
        assert tracking.count() == 1
        assert tracking.first().status == Shipment.Status.PENDING

    def test_sets_origin_and_destination(self, hospital, hospital_b, hospital_admin_user):
        ship = create_shipment(hospital, hospital_b, {}, hospital_admin_user)
        assert ship.origin_hospital == hospital
        assert ship.destination_hospital == hospital_b


@pytest.mark.django_db
class TestAddTrackingEvent:
    def test_adds_tracking_event(self, shipment, hospital_admin_user):
        event = add_tracking_event(
            shipment, Shipment.Status.IN_TRANSIT, "Depot A", "Picked up", hospital_admin_user
        )
        assert event.pk is not None
        assert event.status == Shipment.Status.IN_TRANSIT

    def test_updates_shipment_status(self, shipment, hospital_admin_user):
        add_tracking_event(
            shipment, Shipment.Status.IN_TRANSIT, "City Hub", "En route", hospital_admin_user
        )
        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.IN_TRANSIT

    def test_sets_actual_delivery_on_delivered(self, shipment, hospital_admin_user):
        add_tracking_event(
            shipment, Shipment.Status.DELIVERED, "Destination", "Signed", hospital_admin_user
        )
        shipment.refresh_from_db()
        assert shipment.actual_delivery_at is not None
        assert shipment.status == Shipment.Status.DELIVERED

    def test_multiple_tracking_events(self, shipment, hospital_admin_user):
        add_tracking_event(shipment, Shipment.Status.IN_TRANSIT, "A", "", hospital_admin_user)
        add_tracking_event(shipment, Shipment.Status.DELIVERED, "B", "", hospital_admin_user)
        count = ShipmentTracking.objects.filter(shipment=shipment).count()
        # 1 auto-created on create + 2 explicit = 3
        assert count == 3
