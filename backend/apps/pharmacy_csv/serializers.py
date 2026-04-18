"""Serializers for pharmacy CSV ingestion APIs."""
from rest_framework import serializers

from .models import (
    PharmacyCSVChatMessage,
    PharmacyCSVChatSession,
    PharmacyCSVImportConflict,
    PharmacyCSVImportError,
    PharmacyCSVImportJob,
)


class PharmacyCSVValidateSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)
    conflict_policy = serializers.ChoiceField(
        choices=PharmacyCSVImportJob.ConflictPolicy.choices,
        default=PharmacyCSVImportJob.ConflictPolicy.REJECT,
    )
    locked_period_policy = serializers.ChoiceField(
        choices=PharmacyCSVImportJob.LockedPeriodPolicy.choices,
        default=PharmacyCSVImportJob.LockedPeriodPolicy.REJECT,
    )
    default_movement_mode = serializers.ChoiceField(choices=["DELTA", "ABSOLUTE"], default="DELTA")


class PharmacyCSVCommitSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)
    conflict_policy = serializers.ChoiceField(
        choices=PharmacyCSVImportJob.ConflictPolicy.choices,
        default=PharmacyCSVImportJob.ConflictPolicy.REJECT,
    )
    locked_period_policy = serializers.ChoiceField(
        choices=PharmacyCSVImportJob.LockedPeriodPolicy.choices,
        default=PharmacyCSVImportJob.LockedPeriodPolicy.REJECT,
    )
    default_movement_mode = serializers.ChoiceField(choices=["DELTA", "ABSOLUTE"], default="DELTA")
    confirm_conflicts = serializers.BooleanField(required=False, default=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=128, default="")


class PharmacyCSVImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyCSVImportJob
        fields = [
            "id",
            "facility",
            "dataset_type",
            "file_hash",
            "idempotency_key",
            "conflict_policy",
            "locked_period_policy",
            "status",
            "total_rows",
            "applied_rows",
            "error_rows",
            "conflict_rows",
            "summary",
            "requested_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PharmacyCSVImportErrorSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyCSVImportError
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


class PharmacyCSVImportConflictSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyCSVImportConflict
        fields = [
            "id",
            "import_job",
            "row_number",
            "conflict_key",
            "message",
            "existing_record",
            "incoming_record",
            "resolution",
            "created_at",
        ]
        read_only_fields = fields


class PharmacyCSVChatSessionCreateSerializer(serializers.Serializer):
    file_id = serializers.UUIDField(required=True)
    language = serializers.CharField(required=False, max_length=10, default="en")


class PharmacyCSVChatMessageCreateSerializer(serializers.Serializer):
    query = serializers.CharField(required=True, allow_blank=False, max_length=2000)
    language = serializers.CharField(required=False, max_length=10, default="en")


class PharmacyCSVChatSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyCSVChatSession
        fields = [
            "id",
            "facility",
            "validation_context",
            "dataset_type",
            "language",
            "status",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PharmacyCSVChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyCSVChatMessage
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
