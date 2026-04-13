"""Hospital serializers."""
from rest_framework import serializers

from apps.authentication.models import UserAccount
from common.utils.media_urls import resolve_media_file_url

from .models import (
    Hospital,
    HospitalAPIConfig,
    HospitalCapacity,
    HospitalOffboardingRequest,
    HospitalPartnership,
    HospitalRegistrationRequest,
    HospitalUpdateRequest,
)

PRIMARY_HOSPITAL_ADMIN_ROLE = "HEALTHCARE_ADMIN"


class HospitalRegistrationRequestSerializer(serializers.ModelSerializer):
    """Used by hospital representatives to submit a registration request (public, no auth)."""

    # Accept credentials during registration but never expose them in responses.
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    bearer_token = serializers.CharField(write_only=True, required=False, allow_blank=True)
    admin_name = serializers.CharField(required=True, allow_blank=False)
    admin_email = serializers.EmailField(required=True, allow_blank=False)
    logo_url = serializers.SerializerMethodField(read_only=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)

    class Meta:
        model = HospitalRegistrationRequest
        fields = [
            "id", "name", "registration_number", "email", "admin_name", "admin_email", "phone", "website",
            "address", "city", "state", "country", "hospital_type", "facility_classification",
            "facility_type", "data_submission_type", "needs_inventory_dashboard", "inventory_source_type",
            "inventory_last_sync_source", "region_level_1", "region_level_2", "region_level_3",
            "logo", "logo_url", "latitude", "longitude",
            "status", "submitted_at",
            # API integration fields (optional)
            "api_base_url", "api_auth_type",
            "api_key", "api_username", "api_password", "bearer_token",
            "schema_contract_status", "schema_contract_failed_apis", "schema_contract_checked_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "submitted_at",
            "inventory_last_sync_source",
            "schema_contract_status",
            "schema_contract_failed_apis",
            "schema_contract_checked_at",
        ]

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

        if registration_number:
            existing_hospital = Hospital.objects.filter(registration_number=registration_number).first()
            if existing_hospital and existing_hospital.verified_status not in {
                Hospital.VerifiedStatus.SUSPENDED,
                Hospital.VerifiedStatus.OFFBOARDED,
            }:
                raise serializers.ValidationError(
                    {
                        "registration_number": (
                            "This hospital already exists in the platform. "
                            "Only suspended/offboarded hospitals can be re-registered."
                        )
                    }
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

    def get_logo_url(self, obj):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        return resolve_media_file_url(getattr(obj, "logo", None), request)


class HospitalRegistrationRequestDetailSerializer(serializers.ModelSerializer):
    """Full detail view for SUPER_ADMIN — masks sensitive credential fields."""
    admin_name = serializers.SerializerMethodField()
    admin_email = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HospitalRegistrationRequest
        fields = [
            "id", "name", "registration_number", "email", "admin_name", "admin_email", "phone", "website",
            "address", "city", "state", "country", "hospital_type", "facility_classification",
            "facility_type", "data_submission_type", "needs_inventory_dashboard", "inventory_source_type",
            "inventory_last_sync_source", "region_level_1", "region_level_2", "region_level_3",
            "logo", "logo_url", "latitude", "longitude",
            "status", "rejection_reason",
            "api_base_url", "api_auth_type",
            "api_key", "api_username", "api_password",
            "last_sync_time", "sync_status",
            "api_check_results", "api_check_last_checked_at",
            "schema_contract_status", "schema_contract_failed_apis", "schema_contract_checked_at",
            "reviewed_by", "reviewed_by_name", "reviewed_at",
            "submitted_at", "updated_at",
        ]
        read_only_fields = fields

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None

    def _resolve_admin_staff(self, obj):
        hospital = Hospital.objects.filter(registration_number=obj.registration_number).first()
        if not hospital:
            return None

        active_admin = UserAccount.objects.filter(
            staff__hospital=hospital,
            hospital_role_assignment__hospital_role__name=PRIMARY_HOSPITAL_ADMIN_ROLE,
            hospital_role_assignment__hospital_role__is_active=True,
            staff__employment_status="active",
        ).select_related("staff").order_by("-staff__updated_at", "-staff__created_at").first()
        if active_admin and active_admin.staff:
            return active_admin.staff

        fallback_admin = UserAccount.objects.filter(
            staff__hospital=hospital,
            hospital_role_assignment__hospital_role__name=PRIMARY_HOSPITAL_ADMIN_ROLE,
            hospital_role_assignment__hospital_role__is_active=True,
        ).select_related("staff").order_by("-staff__updated_at", "-staff__created_at").first()
        return fallback_admin.staff if fallback_admin and fallback_admin.staff else None

    def get_admin_name(self, obj):
        if obj.admin_name:
            return obj.admin_name
        admin_staff = self._resolve_admin_staff(obj)
        if admin_staff:
            return f"{admin_staff.first_name} {admin_staff.last_name}".strip()
        return None

    def get_admin_email(self, obj):
        if obj.admin_email:
            return obj.admin_email
        admin_staff = self._resolve_admin_staff(obj)
        if not admin_staff:
            return None
        linked_user = getattr(admin_staff, "user_account", None)
        if linked_user and linked_user.email:
            return linked_user.email
        return admin_staff.email or None

    def get_logo_url(self, obj):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        return resolve_media_file_url(getattr(obj, "logo", None), request)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request") if isinstance(self.context, dict) else None
        resolved_logo = resolve_media_file_url(getattr(instance, "logo", None), request)
        data["logo"] = resolved_logo
        data["logo_url"] = resolved_logo
        # Mask encrypted credential fields
        if data.get("api_key"):
            data["api_key"] = "***"
        if data.get("api_password"):
            data["api_password"] = "***"
        return data


class HospitalRegistrationRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default="")


class HospitalRegistrationReviewEmailSerializer(serializers.Serializer):
    class IssueType:
        API_VALIDATION = "API_VALIDATION"
        ENDPOINT_CONFIGURATION = "ENDPOINT_CONFIGURATION"
        MISSING_REQUIRED_FIELDS = "MISSING_REQUIRED_FIELDS"
        CONTACT_INFORMATION = "CONTACT_INFORMATION"
        GENERAL = "GENERAL"

    ISSUE_TYPE_CHOICES = [
        IssueType.API_VALIDATION,
        IssueType.ENDPOINT_CONFIGURATION,
        IssueType.MISSING_REQUIRED_FIELDS,
        IssueType.CONTACT_INFORMATION,
        IssueType.GENERAL,
    ]

    subject = serializers.CharField(
        required=False,
        allow_blank=False,
        default="Registration Review Required",
        max_length=255,
    )
    message = serializers.CharField(required=True, allow_blank=False, max_length=4000)
    issue_type = serializers.ChoiceField(
        choices=ISSUE_TYPE_CHOICES,
        required=False,
        default=IssueType.GENERAL,
    )
    failed_apis = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        default=list,
        allow_empty=True,
    )
    mark_changes_requested = serializers.BooleanField(required=False, default=False)

    def validate_failed_apis(self, value):
        normalized = []
        seen = set()
        for api_name in value:
            normalized_name = str(api_name).strip().lower()
            if not normalized_name or normalized_name in seen:
                continue
            seen.add(normalized_name)
            normalized.append(normalized_name)
        return normalized


class HospitalRegistrationAPICheckRequestSerializer(serializers.Serializer):
    api_names = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        allow_empty=False,
    )
    timeout_seconds = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=60,
        default=15,
    )

    def validate_api_names(self, value):
        from .services import normalize_registration_api_names  # noqa: PLC0415

        return normalize_registration_api_names(value)


class HospitalRegistrationSingleAPICheckRequestSerializer(serializers.Serializer):
    timeout_seconds = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=60,
        default=15,
    )


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


class AdminHospitalDirectOffboardSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="Direct offboarding by SUPER_ADMIN.")
    admin_notes = serializers.CharField(required=False, allow_blank=True, default="")


class HospitalSerializer(serializers.ModelSerializer):
    admin_name = serializers.SerializerMethodField()
    admin_email = serializers.SerializerMethodField()
    admin_staff_id = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Hospital
        fields = [
            "id", "name", "registration_number", "hospital_type", "facility_classification",
            "facility_type", "data_submission_type", "needs_inventory_dashboard", "inventory_source_type",
            "inventory_last_sync_source", "region_level_1", "region_level_2", "region_level_3",
            "email", "phone", "website", "address", "city", "state", "country", "logo", "logo_url", "latitude",
            "longitude",
            "admin_name", "admin_email", "admin_staff_id",
            "advanced_integration_eligible",
            "schema_contract_status",
            "schema_contract_failed_apis",
            "schema_contract_checked_at",
            "verified_status", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id",
            "admin_name",
            "admin_email",
            "admin_staff_id",
            "advanced_integration_eligible",
            "schema_contract_status",
            "schema_contract_failed_apis",
            "schema_contract_checked_at",
            "verified_status",
            "created_at",
            "updated_at",
        ]

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value

    def _resolve_primary_admin(self, obj):
        active_admin = UserAccount.objects.filter(
            staff__hospital=obj,
            hospital_role_assignment__hospital_role__name=PRIMARY_HOSPITAL_ADMIN_ROLE,
            hospital_role_assignment__hospital_role__is_active=True,
            staff__employment_status="active",
        ).select_related("staff").order_by("-staff__updated_at", "-staff__created_at").first()
        if active_admin and active_admin.staff:
            return active_admin.staff

        fallback_admin = UserAccount.objects.filter(
            staff__hospital=obj,
            hospital_role_assignment__hospital_role__name=PRIMARY_HOSPITAL_ADMIN_ROLE,
            hospital_role_assignment__hospital_role__is_active=True,
        ).select_related("staff").order_by("-staff__updated_at", "-staff__created_at").first()
        return fallback_admin.staff if fallback_admin and fallback_admin.staff else None

    def get_admin_name(self, obj):
        admin_staff = self._resolve_primary_admin(obj)
        if not admin_staff:
            return None
        return f"{admin_staff.first_name} {admin_staff.last_name}".strip() or None

    def get_admin_email(self, obj):
        admin_staff = self._resolve_primary_admin(obj)
        if not admin_staff:
            return None
        linked_user = getattr(admin_staff, "user_account", None)
        if linked_user and linked_user.email:
            return linked_user.email
        return admin_staff.email or None

    def get_admin_staff_id(self, obj):
        admin_staff = self._resolve_primary_admin(obj)
        if not admin_staff:
            return None
        return str(admin_staff.id)

    def get_logo_url(self, obj):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        return resolve_media_file_url(getattr(obj, "logo", None), request)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request") if isinstance(self.context, dict) else None
        resolved_logo = resolve_media_file_url(getattr(instance, "logo", None), request)
        data["logo"] = resolved_logo
        data["logo_url"] = resolved_logo
        return data


class HospitalMapSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ["id", "name", "latitude", "longitude", "logo"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request") if isinstance(self.context, dict) else None
        data["logo"] = resolve_media_file_url(getattr(instance, "logo", None), request)
        return data


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
    reason = serializers.CharField(required=False, allow_blank=True, write_only=True, max_length=2000)

    class Meta:
        model = Hospital
        fields = [
            "name",
            "registration_number",
            "hospital_type",
            "facility_classification",
            "facility_type",
            "data_submission_type",
            "needs_inventory_dashboard",
            "inventory_source_type",
            "inventory_last_sync_source",
            "region_level_1",
            "region_level_2",
            "region_level_3",
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
            "reason",
        ]

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value


class HospitalProfilePictureUploadSerializer(serializers.Serializer):
    logo = serializers.ImageField(required=True)


class HospitalUpdateRequestSerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source="hospital.name", read_only=True)
    change_payload_json = serializers.JSONField(source="requested_changes", read_only=True)
    current_requested_values = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    _NO_ACTIVE_REGISTRATION = object()
    _SPECIAL_SOURCE_FIELDS = {
        "api_base_url",
        "api_auth_type",
        "api_key",
        "api_username",
        "api_password",
    }
    _MASKED_SOURCE_FIELDS = {"api_key", "api_password"}

    def _get_active_registration(self, obj):
        cached = getattr(obj, "_active_registration", self._NO_ACTIVE_REGISTRATION)
        if cached is not self._NO_ACTIVE_REGISTRATION:
            return cached

        registration = HospitalRegistrationRequest.objects.filter(
            status=HospitalRegistrationRequest.Status.ACTIVE,
            registration_number=obj.hospital.registration_number,
        ).order_by("-reviewed_at", "-submitted_at", "-updated_at").first()
        obj._active_registration = registration
        return registration

    def _get_current_requested_value(self, obj, field_name: str):
        if field_name in self._SPECIAL_SOURCE_FIELDS:
            registration = self._get_active_registration(obj)
            if registration is None:
                return None
            current_value = getattr(registration, field_name, None)
        else:
            current_value = getattr(obj.hospital, field_name, None)

        if field_name in self._MASKED_SOURCE_FIELDS and current_value not in (None, ""):
            return "***"
        return current_value

    def get_current_requested_values(self, obj):
        requested_changes = obj.requested_changes or {}
        current_values = {}
        for field_name in requested_changes.keys():
            current_values[field_name] = self._get_current_requested_value(obj, field_name)
        return current_values

    class Meta:
        model = HospitalUpdateRequest
        fields = [
            "id",
            "hospital",
            "hospital_name",
            "requested_by",
            "requested_by_name",
            "status",
            "reason",
            "change_payload_json",
            "requested_changes",
            "current_requested_values",
            "sensitive_changes",
            "rejection_reason",
            "review_comment",
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
    review_comment = serializers.CharField(required=False, allow_blank=True, default="")


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
