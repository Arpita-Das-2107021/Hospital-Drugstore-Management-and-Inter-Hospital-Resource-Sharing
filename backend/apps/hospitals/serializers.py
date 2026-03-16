"""Hospital serializers."""
from rest_framework import serializers

from .models import (
    Hospital,
    HospitalAPIConfig,
    HospitalCapacity,
    HospitalOffboardingRequest,
    HospitalPartnership,
    HospitalRegistrationRequest,
    HospitalUpdateRequest,
)


class HospitalRegistrationRequestSerializer(serializers.ModelSerializer):
    """Used by hospital representatives to submit a registration request (public, no auth)."""

    # Accept credentials during registration but never expose them in responses.
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    bearer_token = serializers.CharField(write_only=True, required=False, allow_blank=True)
    admin_name = serializers.CharField(required=True, allow_blank=False)
    admin_email = serializers.EmailField(required=True, allow_blank=False)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)

    class Meta:
        model = HospitalRegistrationRequest
        fields = [
            "id", "name", "registration_number", "email", "admin_name", "admin_email", "phone", "website",
            "address", "city", "state", "country", "hospital_type", "logo", "latitude", "longitude",
            "status", "submitted_at",
            # API integration fields (optional)
            "api_base_url", "api_auth_type",
            "api_key", "api_username", "api_password", "bearer_token",
        ]
        read_only_fields = ["id", "status", "submitted_at"]

    def validate(self, attrs):
        """Validate registration uniqueness rules and encrypt sensitive API credentials."""
        registration_number = attrs.get("registration_number")
        admin_email = attrs.get("admin_email")

        pending_requests = HospitalRegistrationRequest.objects.filter(
            status=HospitalRegistrationRequest.Status.PENDING_APPROVAL
        )

        if registration_number and pending_requests.filter(registration_number=registration_number).exists():
            raise serializers.ValidationError(
                {
                    "registration_number": "A registration request for this hospital is already pending review."
                }
            )

        if admin_email and pending_requests.filter(admin_email__iexact=admin_email).exists():
            raise serializers.ValidationError(
                {"admin_email": "A registration request for this hospital admin is already pending review."}
            )

        if registration_number and Hospital.objects.filter(registration_number=registration_number).exists():
            raise serializers.ValidationError(
                {"registration_number": "This hospital already exists in the platform."}
            )

        raw_api_key = self.initial_data.get("api_key")
        raw_bearer = self.initial_data.get("bearer_token")
        raw_secret = raw_api_key or raw_bearer
        if raw_secret:
            from common.utils.encryption import encrypt_value  # noqa: PLC0415
            attrs["api_key"] = encrypt_value(raw_secret)

        raw_password = self.initial_data.get("api_password")
        if raw_password:
            from common.utils.encryption import encrypt_value  # noqa: PLC0415
            attrs["api_password"] = encrypt_value(raw_password)

        api_username = self.initial_data.get("api_username")
        if api_username:
            attrs["api_username"] = api_username

        # bearer_token is an alias for api_key and is not a model field.
        attrs.pop("bearer_token", None)
        return attrs

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value

    def create(self, validated_data):
        return HospitalRegistrationRequest.objects.create(**validated_data)


class HospitalRegistrationRequestDetailSerializer(serializers.ModelSerializer):
    """Full detail view for SUPER_ADMIN — masks sensitive credential fields."""
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HospitalRegistrationRequest
        fields = [
            "id", "name", "registration_number", "email", "admin_name", "admin_email", "phone", "website",
            "address", "city", "state", "country", "hospital_type", "logo", "latitude", "longitude",
            "status", "rejection_reason",
            "api_base_url", "api_auth_type",
            "api_key", "api_username", "api_password",
            "last_sync_time", "sync_status",
            "reviewed_by", "reviewed_by_name", "reviewed_at",
            "submitted_at", "updated_at",
        ]
        read_only_fields = fields

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Mask encrypted credential fields
        if data.get("api_key"):
            data["api_key"] = "***"
        if data.get("api_password"):
            data["api_password"] = "***"
        return data


class HospitalRegistrationRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default="")


class HospitalOffboardingRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = HospitalOffboardingRequest
        fields = ["id", "reason", "status", "requested_at"]
        read_only_fields = ["id", "status", "requested_at"]


class HospitalOffboardingRequestSerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source="hospital.name", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HospitalOffboardingRequest
        fields = [
            "id",
            "hospital",
            "hospital_name",
            "reason",
            "status",
            "admin_notes",
            "requested_by",
            "requested_by_name",
            "requested_at",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return f"{obj.requested_by.first_name} {obj.requested_by.last_name}".strip()
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None


class HospitalOffboardingReviewSerializer(serializers.Serializer):
    admin_notes = serializers.CharField(required=False, allow_blank=True, default="")


class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = [
            "id", "name", "registration_number", "hospital_type", "email", "phone", "website",
            "address", "city", "state", "country", "logo", "latitude", "longitude",
            "verified_status", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "verified_status", "created_at", "updated_at"]

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value


class HospitalMapSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ["id", "name", "latitude", "longitude", "logo"]


class MyHospitalUpdateSerializer(serializers.ModelSerializer):
    api_base_url = serializers.CharField(required=False, allow_blank=True, write_only=True)
    api_auth_type = serializers.ChoiceField(
        choices=HospitalRegistrationRequest.ApiAuthType.choices,
        required=False,
        write_only=True,
    )
    api_key = serializers.CharField(required=False, allow_blank=True, write_only=True)
    api_username = serializers.CharField(required=False, allow_blank=True, write_only=True)
    api_password = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = Hospital
        fields = [
            "name",
            "registration_number",
            "email",
            "phone",
            "website",
            "address",
            "city",
            "state",
            "country",
            "logo",
            "latitude",
            "longitude",
            "api_base_url",
            "api_auth_type",
            "api_key",
            "api_username",
            "api_password",
        ]

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value


class HospitalUpdateRequestSerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source="hospital.name", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HospitalUpdateRequest
        fields = [
            "id",
            "hospital",
            "hospital_name",
            "requested_by",
            "requested_by_name",
            "status",
            "requested_changes",
            "sensitive_changes",
            "rejection_reason",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "requested_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return f"{obj.requested_by.first_name} {obj.requested_by.last_name}".strip()
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None


class HospitalUpdateRequestReviewSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default="")


class HospitalCapacitySerializer(serializers.ModelSerializer):
    class Meta:
        model = HospitalCapacity
        fields = ["id", "hospital", "bed_total", "bed_available", "icu_total", "icu_available", "last_updated"]
        read_only_fields = ["id", "hospital", "last_updated"]


class HospitalAPIConfigSerializer(serializers.ModelSerializer):
    # Never expose the encrypted token in the API response
    encrypted_token = serializers.SerializerMethodField()

    class Meta:
        model = HospitalAPIConfig
        fields = [
            "id", "hospital", "resource_type", "integration_type", "api_endpoint",
            "http_method", "auth_type", "encrypted_token", "headers",
            "sync_frequency", "last_sync", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "hospital", "last_sync", "created_at", "updated_at"]

    def get_encrypted_token(self, obj):
        return "***" if obj.encrypted_token else ""

    def validate(self, attrs):
        # If a raw token is provided in write operations, encrypt it
        raw_token = self.initial_data.get("api_token")
        if raw_token:
            from common.utils.encryption import encrypt_value  # noqa: PLC0415
            attrs["encrypted_token"] = encrypt_value(raw_token)
        return attrs


class HospitalPartnershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = HospitalPartnership
        fields = [
            "id", "hospital_a", "hospital_b", "relationship_type",
            "status", "initiated_by", "created_at",
        ]
        read_only_fields = ["id", "initiated_by", "created_at"]
