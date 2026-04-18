"""Audit app serializers."""
from rest_framework import serializers

from .models import AuditLog, AuthorizationAuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.ReadOnlyField(source="actor.email", default=None)
    hospital_name = serializers.ReadOnlyField(source="hospital.name", default=None)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "event_type",
            "actor",
            "actor_email",
            "hospital",
            "hospital_name",
            "object_id",
            "object_type",
            "ip_address",
            "user_agent",
            "metadata",
            "created_at",
        )
        read_only_fields = fields


class AuthorizationAuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.ReadOnlyField(source="user.email", default=None)
    hospital_name = serializers.ReadOnlyField(source="hospital.name", default=None)

    class Meta:
        model = AuthorizationAuditLog
        fields = (
            "id",
            "user",
            "user_email",
            "action",
            "resource",
            "hospital",
            "hospital_name",
            "metadata",
            "timestamp",
        )
        read_only_fields = fields
