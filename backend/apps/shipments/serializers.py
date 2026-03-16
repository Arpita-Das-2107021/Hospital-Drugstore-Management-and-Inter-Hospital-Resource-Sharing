"""Shipments app serializers."""
from rest_framework import serializers

from .models import Shipment, ShipmentTracking


class ShipmentSerializer(serializers.ModelSerializer):
    origin_hospital_name = serializers.ReadOnlyField(source="origin_hospital.name")
    destination_hospital_name = serializers.ReadOnlyField(source="destination_hospital.name")
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
            "status",
            "dispatch_token",
            "receive_token",
            "return_token",
            "token_expires_at",
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
            "dispatch_token",
            "receive_token",
            "return_token",
            "token_expires_at",
            "created_by",
            "created_at",
            "updated_at",
        )

    def validate_status(self, value):
        if value == "pending":
            return Shipment.Status.PENDING
        return value


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
