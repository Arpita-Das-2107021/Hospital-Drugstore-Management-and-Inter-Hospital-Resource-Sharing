"""Audit app serializers."""
from rest_framework import serializers

from .models import AuditLog


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
