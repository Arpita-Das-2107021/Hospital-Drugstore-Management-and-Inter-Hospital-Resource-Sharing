"""Inventory module serializers."""
from rest_framework import serializers

from .models import (
    InventoryCSVChatMessage,
    InventoryCSVChatSession,
    InventoryImportError,
    InventoryImportJob,
)


class QuickInventoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    quantity = serializers.IntegerField(min_value=0)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class InventoryCSVValidateSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)
    language = serializers.CharField(required=False, max_length=10, default="en")


class InventoryCSVCommitSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)
    mode = serializers.ChoiceField(choices=InventoryImportJob.Mode.choices, default=InventoryImportJob.Mode.MERGE)
    confirm_full_replace = serializers.BooleanField(required=False, default=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=128, default="")


class InventoryCSVDiscountCommitSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)


class InventoryImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryImportJob
        fields = [
            "id",
            "facility",
            "source_type",
            "mode",
            "file_hash",
            "idempotency_key",
            "confirm_full_replace",
            "status",
            "total_rows",
            "applied_rows",
            "error_rows",
            "summary",
            "requested_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class InventoryImportErrorSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryImportError
        fields = [
            "id",
            "import_job",
            "row_number",
            "field_name",
            "error_code",
            "error_message",
            "raw_row",
            "created_at",
        ]
        read_only_fields = fields


class InventoryCSVChatSerializer(serializers.Serializer):
    file_id = serializers.UUIDField(required=True)
    query = serializers.CharField(required=True, allow_blank=False, max_length=2000)
    language = serializers.CharField(required=False, max_length=10, default="en")


class InventoryCSVChatSessionCreateSerializer(serializers.Serializer):
    file_id = serializers.UUIDField(required=True)
    language = serializers.CharField(required=False, max_length=10, default="en")


class InventoryCSVChatMessageCreateSerializer(serializers.Serializer):
    query = serializers.CharField(required=True, allow_blank=False, max_length=2000)
    language = serializers.CharField(required=False, max_length=10, default="en")


class InventoryCSVChatSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryCSVChatSession
        fields = [
            "id",
            "facility",
            "validation_context",
            "language",
            "status",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class InventoryCSVChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryCSVChatMessage
        fields = [
            "id",
            "session",
            "role",
            "content",
            "out_of_scope",
            "message_meta",
            "created_at",
        ]
        read_only_fields = fields
