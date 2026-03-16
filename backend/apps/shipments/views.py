"""Shipments app views."""
import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import IsLogisticsStaff, IsVerifiedHospital
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import Shipment
from .serializers import AssignRiderSerializer, AddTrackingEventSerializer, ShipmentSerializer, ShipmentTrackingSerializer
from .services import add_tracking_event, create_shipment

logger = logging.getLogger("hrsp.shipments")


class ShipmentViewSet(viewsets.ModelViewSet):
    serializer_class = ShipmentSerializer
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return Shipment.objects.select_related("origin_hospital", "destination_hospital").all()
        if hasattr(user, "staff") and user.staff:
            hospital = user.staff.hospital
            return Shipment.objects.select_related("origin_hospital", "destination_hospital").filter(
                origin_hospital=hospital
            ) | Shipment.objects.select_related("origin_hospital", "destination_hospital").filter(
                destination_hospital=hospital
            )
        return Shipment.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        shipment = create_shipment(
            origin_hospital=d.pop("origin_hospital"),
            destination_hospital=d.pop("destination_hospital"),
            data=d,
            actor=request.user,
        )
        return Response(success_response(data=ShipmentSerializer(shipment).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        s = self.get_serializer(instance, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(success_response(data=s.data))

    def destroy(self, request, *args, **kwargs):
        return Response(success_response(data={"detail": "Deletion not supported. Update status instead."}),
                        status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(
        detail=True,
        methods=["post"],
        url_path="tracking",
        permission_classes=[IsAuthenticated, IsLogisticsStaff],
    )
    def add_tracking(self, request, pk=None):
        shipment = self.get_object()
        s = AddTrackingEventSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        event = add_tracking_event(
            shipment=shipment,
            status=d["status"],
            location=d.get("location", ""),
            notes=d.get("notes", ""),
            actor=request.user,
        )
        return Response(success_response(data=ShipmentTrackingSerializer(event).data))

    @action(
        detail=True,
        methods=["post"],
        url_path="assign-rider",
        permission_classes=[IsAuthenticated, IsLogisticsStaff],
    )
    def assign_rider(self, request, pk=None):
        shipment = self.get_object()
        s = AssignRiderSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        shipment.rider_name = d["rider_name"]
        shipment.rider_phone = d["rider_phone"]
        shipment.vehicle_info = d.get("vehicle_info", "")
        shipment.save(update_fields=["rider_name", "rider_phone", "vehicle_info", "updated_at"])
        return Response(success_response(data=ShipmentSerializer(shipment).data))

    @action(detail=True, methods=["get"], url_path="tracking")
    def get_tracking(self, request, pk=None):
        shipment = self.get_object()
        events = shipment.tracking_events.all()
        return Response(success_response(data=ShipmentTrackingSerializer(events, many=True).data))
