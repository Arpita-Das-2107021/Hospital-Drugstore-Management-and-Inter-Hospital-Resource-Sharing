"""Shipments app serializers."""
from rest_framework import serializers

from common.services.workflow_lock import ensure_shipment_workflow_is_mutable
from apps.requests.models import ResourceRequest

from .models import Shipment, ShipmentTracking


class ShipmentSerializer(serializers.ModelSerializer):
    origin_hospital_name = serializers.ReadOnlyField(source="origin_hospital.name")
    destination_hospital_name = serializers.ReadOnlyField(source="destination_hospital.name")
    request_ids = serializers.SerializerMethodField()
    status = serializers.ChoiceField(
        choices=list(Shipment.Status.choices) + [("pending", "Pending")],
        required=False,
    )

    class Meta:
        model = Shipment
        fields = (
            "id",
            "origin_hospital",
            "origin_hospital_name",
            "destination_hospital",
            "destination_hospital_name",
            "request_ids",
            "status",
            "rider_name",
            "rider_phone",
            "vehicle_info",
            "cancel_reason",
            "carrier_name",
            "tracking_number",
            "estimated_delivery_at",
            "actual_delivery_at",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "origin_hospital_name",
            "destination_hospital_name",
            "created_by",
            "created_at",
            "updated_at",
        )

    def validate_status(self, value):
        if value == "pending":
            return Shipment.Status.PENDING
        return value

    def get_request_ids(self, obj):
        request_ids = []
        for dispatch_event in obj.dispatch_events.all():
            request_ids.append(str(dispatch_event.request_id))
        return request_ids

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None:
            ensure_shipment_workflow_is_mutable(self.instance)

            candidate_status = attrs.get("status", self.instance.status)
            if candidate_status == Shipment.Status.DELIVERED:
                linked_in_transit = self.instance.dispatch_events.filter(
                    request__workflow_state=ResourceRequest.WorkflowState.IN_TRANSIT
                ).values_list("request_id", flat=True)
                first_request_id = next(iter(linked_in_transit), None)
                if first_request_id is not None:
                    raise serializers.ValidationError(
                        {
                            "status": (
                                "Use /api/v1/requests/{id}/transfer-confirm/ to mark delivery for in-transit request workflows."
                            ),
                            "request_id": str(first_request_id),
                        }
                    )
        return attrs


class ShipmentTrackingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipmentTracking
        fields = ("id", "shipment", "status", "location", "notes", "recorded_by", "recorded_at")
        read_only_fields = ("id", "recorded_by", "recorded_at")


class AddTrackingEventSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=list(Shipment.Status.choices) + [("pending", "Pending")])
    location = serializers.CharField(required=False, default="")
    notes = serializers.CharField(required=False, default="")

    def validate_status(self, value):
        if value == "pending":
            return Shipment.Status.PENDING
        return value


class AssignRiderSerializer(serializers.Serializer):
    rider_name = serializers.CharField()
    rider_phone = serializers.CharField()
    vehicle_info = serializers.CharField(required=False, default="", allow_blank=True)
