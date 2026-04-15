"""Notifications app serializers."""
from decimal import Decimal, InvalidOperation

from rest_framework import serializers
from common.permissions.runtime import is_platform_operator

from .models import BroadcastMessage, EmergencyBroadcastResponse, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "notification_type", "message", "data", "is_read", "read_at", "created_at")
        read_only_fields = ("id", "read_at", "created_at")


class BroadcastMessageSerializer(serializers.ModelSerializer):
    sent_by_email = serializers.ReadOnlyField(source="sent_by.email", default=None)
    closed_by_email = serializers.ReadOnlyField(source="closed_by.email", default=None)
    location = serializers.JSONField(required=False)
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
            "location",
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
        if is_platform_operator(user, allow_role_fallback=True):
            return True
        if obj.sent_by_id == user.id:
            return True
        annotated = getattr(obj, "recipient_is_read", None)
        if annotated is not None:
            return bool(annotated)
        return False

    @staticmethod
    def _coerce_coordinate(raw_value, *, field_name, min_value, max_value):
        if raw_value in (None, ""):
            return None

        try:
            numeric = Decimal(str(raw_value))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise serializers.ValidationError(
                f"Location {field_name} must be a valid number."
            ) from exc

        if numeric < Decimal(str(min_value)) or numeric > Decimal(str(max_value)):
            raise serializers.ValidationError(
                f"Location {field_name} must be between {min_value} and {max_value}."
            )

        rounded = numeric.quantize(Decimal("0.000001"))
        return float(rounded)

    @staticmethod
    def _first_present(mapping, keys):
        for key in keys:
            if key in mapping and mapping[key] not in (None, ""):
                return mapping[key]
        return None

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", BroadcastMessage.Scope.ALL))
        target_hospitals = attrs.get("target_hospitals")
        if scope == BroadcastMessage.Scope.HOSPITALS and not target_hospitals and not self.instance:
            raise serializers.ValidationError({"target_hospitals": "Provide at least one target hospital when scope is 'hospitals'."})
        return attrs

    def validate_location(self, value):
        if value in (None, ""):
            return {}

        if isinstance(value, str):
            address = value.strip()
            return {"address": address} if address else {}

        if isinstance(value, dict):
            normalized = dict(value)

            address_source = normalized.get("address", normalized.get("label"))
            if address_source is not None:
                address = str(address_source).strip()
                if address:
                    normalized["address"] = address
                else:
                    normalized.pop("address", None)

            lat_value = self._first_present(normalized, ("lat", "latitude"))
            lng_value = self._first_present(normalized, ("lng", "longitude", "lon"))

            if lat_value is not None:
                normalized["lat"] = self._coerce_coordinate(
                    lat_value,
                    field_name="lat",
                    min_value=-90,
                    max_value=90,
                )
            if lng_value is not None:
                normalized["lng"] = self._coerce_coordinate(
                    lng_value,
                    field_name="lng",
                    min_value=-180,
                    max_value=180,
                )

            # Normalize alias keys to the canonical API shape while preserving
            # unknown location metadata fields for backward compatibility.
            normalized.pop("latitude", None)
            normalized.pop("longitude", None)
            if "lng" in normalized:
                normalized.pop("lon", None)

            return normalized

        raise serializers.ValidationError("Location must be an object or string.")

    def create(self, validated_data):
        # Remove API-only flags that are not model fields before creating model
        validated_data.pop("send_email", None)
        validated_data.pop("notify_recipients", None)
        validated_data.setdefault("location", {})
        return super().create(validated_data)


class BroadcastMessagesRefreshInputSerializer(serializers.Serializer):
    last_known_version = serializers.IntegerField(required=False, min_value=0, default=0)
    scope = serializers.ChoiceField(
        required=False,
        allow_null=True,
        choices=("platform", "healthcare"),
    )
    limit = serializers.IntegerField(required=False, min_value=1, max_value=200, default=100)


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
