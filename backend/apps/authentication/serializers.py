"""Authentication serializers."""
from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import UserAccount


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds user profile data to the login response."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Embed roles in the token payload for quick client-side checks
        token["roles"] = list(user.roles.values_list("name", flat=True))
        token["hospital_id"] = str(user.get_hospital_id()) if user.get_hospital_id() else None
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        roles = list(user.roles.values_list("name", flat=True))
        hospital_id = user.get_hospital_id()
        data["user"] = {
            "id": str(user.id),
            "email": user.email,
            "name": user.get_full_name(),
            "roles": roles,
            "hospital_id": str(hospital_id) if hospital_id else None,
        }
        return data


class UserProfileSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    hospital_id = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    staff_id = serializers.SerializerMethodField()

    class Meta:
        model = UserAccount
        fields = ["id", "email", "full_name", "staff_id", "hospital_id", "roles", "is_active", "created_at"]
        read_only_fields = fields

    def get_roles(self, obj):
        return list(obj.roles.values_list("name", flat=True))

    def get_hospital_id(self, obj):
        hid = obj.get_hospital_id()
        return str(hid) if hid else None

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_staff_id(self, obj):
        return str(obj.staff.id) if obj.staff else None


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


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
