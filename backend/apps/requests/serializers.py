"""Requests app serializers."""
from rest_framework import serializers

from .models import DeliveryEvent, DispatchEvent, ResourceRequest, ResourceRequestApproval


class ResourceRequestSerializer(serializers.ModelSerializer):
    requesting_hospital_name = serializers.ReadOnlyField(source="requesting_hospital.name")
    supplying_hospital_name = serializers.ReadOnlyField(source="supplying_hospital.name")
    catalog_item_name = serializers.ReadOnlyField(source="catalog_item.name")

    class Meta:
        model = ResourceRequest
        fields = (
            "id",
            "requesting_hospital",
            "requesting_hospital_name",
            "supplying_hospital",
            "supplying_hospital_name",
            "catalog_item",
            "catalog_item_name",
            "quantity_requested",
            "quantity_approved",
            "price_snapshot",
            "total_price",
            "status",
            "payment_status",
            "payment_note",
            "priority",
            "notes",
            "requested_by",
            "needed_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "requesting_hospital_name",
            "supplying_hospital_name",
            "catalog_item_name",
            "quantity_approved",
            "price_snapshot",
            "total_price",
            "status",
            "payment_status",
            "payment_note",
            "requested_by",
            "created_at",
            "updated_at",
        )


class CreateRequestSerializer(serializers.Serializer):
    supplying_hospital = serializers.UUIDField()
    catalog_item = serializers.UUIDField()
    quantity_requested = serializers.IntegerField(min_value=1)
    priority = serializers.ChoiceField(choices=ResourceRequest.Priority.choices, default=ResourceRequest.Priority.NORMAL)
    notes = serializers.CharField(required=False, default="")
    needed_by = serializers.DateTimeField(required=False, allow_null=True)


class ApprovalSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    quantity_approved = serializers.IntegerField(min_value=0, required=False)
    reason = serializers.CharField(required=False, default="", allow_blank=True)


class ResourceRequestApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceRequestApproval
        fields = ("id", "request", "reviewed_by", "decision", "quantity_approved", "reason", "reviewed_at")
        read_only_fields = ("id", "reviewed_at")


class ConfirmDeliverySerializer(serializers.Serializer):
    dispatch_token = serializers.CharField(required=False, allow_blank=True)
    token = serializers.CharField(required=False, allow_blank=True)
    receive_token = serializers.CharField(required=False, allow_blank=True)
    quantity_received = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(required=False, default="", allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("dispatch_token"):
            attrs["dispatch_token"] = attrs.get("token", "")
        return attrs


class ConfirmPaymentSerializer(serializers.Serializer):
    payment_status = serializers.ChoiceField(choices=ResourceRequest.PaymentStatus.choices)
    payment_note = serializers.CharField(required=False, default="", allow_blank=True)


class VerifyReturnSerializer(serializers.Serializer):
    return_token = serializers.CharField()


class DeliveryEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryEvent
        fields = ("id", "request", "confirmed_by", "quantity_received", "notes", "delivered_at")
        read_only_fields = ("id", "delivered_at")


class DispatchEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispatchEvent
        fields = ("id", "request", "dispatched_by", "shipment", "notes", "dispatched_at")
        read_only_fields = ("id", "dispatched_at")
