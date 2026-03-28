"""Notifications app serializers."""
from rest_framework import serializers

from .models import BroadcastMessage, EmergencyBroadcastResponse, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "notification_type", "message", "data", "is_read", "read_at", "created_at")
        read_only_fields = ("id", "read_at", "created_at")


class BroadcastMessageSerializer(serializers.ModelSerializer):
    sent_by_email = serializers.ReadOnlyField(source="sent_by.email", default=None)
    closed_by_email = serializers.ReadOnlyField(source="closed_by.email", default=None)
    # Write-only flags to control delivery behavior from API payloads
    send_email = serializers.BooleanField(write_only=True, required=False, default=False)
    notify_recipients = serializers.BooleanField(write_only=True, required=False, default=False)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = BroadcastMessage
        fields = (
            "id",
            "title",
            "message",
            "scope",
            "priority",
            "allow_response",
            "status",
            "target_hospitals",
            "send_email",
            "notify_recipients",
            "sent_by",
            "sent_by_email",
            "sent_at",
            "closed_by",
            "closed_by_email",
            "closed_at",
            "created_at",
            "is_read",
        )
        read_only_fields = (
            "id",
            "sent_by",
            "sent_by_email",
            "sent_at",
            "status",
            "closed_by",
            "closed_by_email",
            "closed_at",
            "created_at",
            "is_read",
        )

    def get_is_read(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return True
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return True
        annotated = getattr(obj, "recipient_is_read", None)
        if annotated is not None:
            return bool(annotated)
        return obj.sent_by_id == user.id

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", BroadcastMessage.Scope.ALL))
        target_hospitals = attrs.get("target_hospitals")
        if scope == BroadcastMessage.Scope.HOSPITALS and not target_hospitals and not self.instance:
            raise serializers.ValidationError({"target_hospitals": "Provide at least one target hospital when scope is 'hospitals'."})
        return attrs

    def create(self, validated_data):
        # Remove API-only flags that are not model fields before creating model
        validated_data.pop("send_email", None)
        validated_data.pop("notify_recipients", None)
        return super().create(validated_data)


class EmergencyRespondInputSerializer(serializers.Serializer):
    """Validates only the user-supplied fields for the respond action."""
    response = serializers.CharField(required=False, allow_blank=False)
    can_provide = serializers.BooleanField(required=False)
    quantity_available = serializers.IntegerField(required=False, allow_null=True, default=None)
    notes = serializers.CharField(required=False, default="")

    def validate(self, attrs):
        has_new_response = bool(attrs.get("response"))
        has_legacy_payload = any(
            key in attrs for key in ("can_provide", "quantity_available", "notes")
        )
        if not has_new_response and not has_legacy_payload:
            raise serializers.ValidationError({"response": "Provide a response message."})
        return attrs


class EmergencyBroadcastResponseSerializer(serializers.ModelSerializer):
    hospital_name = serializers.ReadOnlyField(source="hospital.name")
    responder_name = serializers.SerializerMethodField()
    response = serializers.ReadOnlyField(source="response_message")

    def get_responder_name(self, obj):
        if not obj.responded_by:
            return None
        return obj.responded_by.get_full_name()

    class Meta:
        model = EmergencyBroadcastResponse
        fields = (
            "id",
            "broadcast",
            "hospital",
            "hospital_name",
            "responded_by",
            "responder_name",
            "response",
            "can_provide",
            "quantity_available",
            "notes",
            "responded_at",
        )
        read_only_fields = ("id", "hospital_name", "responded_by", "responded_at")
