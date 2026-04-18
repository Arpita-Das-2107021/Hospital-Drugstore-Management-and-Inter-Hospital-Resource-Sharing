"""Authentication serializers."""
from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from common.utils.media_urls import resolve_media_file_url

from .models import UserAccount


def _resolve_profile_picture_path(user: UserAccount) -> str | None:
    return resolve_media_file_url(getattr(user, "profile_picture", None))


def _resolve_profile_picture_url(user: UserAccount, request=None) -> str | None:
    return resolve_media_file_url(getattr(user, "profile_picture", None), request)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds user profile data to the login response."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Embed dual-scope role snapshot for quick client-side checks.
        snapshot = user.get_authorization_role_snapshot() if hasattr(user, "get_authorization_role_snapshot") else {
            "all_roles": [],
            "platform_roles": [],
            "hospital_role": None,
        }
        # Keep `roles` global-only to avoid treating hospital roles as platform scope.
        token["roles"] = snapshot["platform_roles"]
        token["all_roles"] = snapshot["all_roles"]
        token["platform_roles"] = snapshot["platform_roles"]
        token["hospital_role"] = snapshot["hospital_role"]
        token["context"] = user.get_context_domain() if hasattr(user, "get_context_domain") else None
        token["access_mode"] = user.get_access_mode() if hasattr(user, "get_access_mode") else "UI"
        token["healthcare_id"] = str(user.get_healthcare_id()) if hasattr(user, "get_healthcare_id") and user.get_healthcare_id() else None
        token["hospital_id"] = str(user.get_hospital_id()) if user.get_hospital_id() else None
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        request = self.context.get("request")
        snapshot = user.get_authorization_role_snapshot() if hasattr(user, "get_authorization_role_snapshot") else {
            "all_roles": [],
            "platform_roles": [],
            "hospital_role": None,
        }
        hospital_id = user.get_hospital_id()
        data["user"] = {
            "id": str(user.id),
            "email": user.email,
            "name": user.get_full_name(),
            "roles": snapshot["platform_roles"],
            "all_roles": snapshot["all_roles"],
            "platform_roles": snapshot["platform_roles"],
            "hospital_role": snapshot["hospital_role"],
            "context": user.get_context_domain() if hasattr(user, "get_context_domain") else None,
            "access_mode": user.get_access_mode() if hasattr(user, "get_access_mode") else "UI",
            "healthcare_id": str(user.get_healthcare_id()) if hasattr(user, "get_healthcare_id") and user.get_healthcare_id() else None,
            "hospital_id": str(hospital_id) if hospital_id else None,
            "profile_picture": _resolve_profile_picture_path(user),
            "profile_picture_url": _resolve_profile_picture_url(user, request),
        }
        return data


class UserProfileSerializer(serializers.ModelSerializer):
    profile_picture = serializers.SerializerMethodField()
    profile_picture_url = serializers.SerializerMethodField()
    context = serializers.SerializerMethodField()
    access_mode = serializers.SerializerMethodField()
    healthcare_id = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    platform_roles = serializers.SerializerMethodField()
    hospital_role = serializers.SerializerMethodField()
    hospital_id = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    staff_id = serializers.SerializerMethodField()

    class Meta:
        model = UserAccount
        fields = [
            "id",
            "email",
            "profile_picture",
            "profile_picture_url",
            "full_name",
            "staff_id",
            "context",
            "access_mode",
            "healthcare_id",
            "hospital_id",
            "roles",
            "platform_roles",
            "hospital_role",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields

    def get_profile_picture(self, obj):
        return _resolve_profile_picture_path(obj)

    def get_profile_picture_url(self, obj):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        return _resolve_profile_picture_url(obj, request)

    def get_roles(self, obj):
        if hasattr(obj, "get_platform_role_names"):
            return obj.get_platform_role_names()
        return []

    def get_platform_roles(self, obj):
        if hasattr(obj, "get_platform_role_names"):
            return obj.get_platform_role_names()
        return []

    def get_hospital_role(self, obj):
        if hasattr(obj, "get_hospital_role_name"):
            return obj.get_hospital_role_name()
        return None

    def get_hospital_id(self, obj):
        hid = obj.get_hospital_id()
        return str(hid) if hid else None

    def get_healthcare_id(self, obj):
        resolver = getattr(obj, "get_healthcare_id", None)
        healthcare_id = resolver() if callable(resolver) else obj.get_hospital_id()
        return str(healthcare_id) if healthcare_id else None

    def get_context(self, obj):
        resolver = getattr(obj, "get_context_domain", None)
        return resolver() if callable(resolver) else None

    def get_access_mode(self, obj):
        resolver = getattr(obj, "get_access_mode", None)
        return resolver() if callable(resolver) else "UI"

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_staff_id(self, obj):
        return str(obj.staff.id) if obj.staff else None


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class UserProfilePictureUploadSerializer(serializers.Serializer):
    profile_picture = serializers.ImageField(required=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordValidateQuerySerializer(serializers.Serializer):
    token = serializers.CharField(max_length=256)


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=256)
    newPassword = serializers.CharField(min_length=8, write_only=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=256)
    new_password = serializers.CharField(min_length=8, write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)
