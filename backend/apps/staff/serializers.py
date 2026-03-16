"""Staff app serializers."""
from django.utils import timezone
from rest_framework import serializers

from .models import Invitation, Role, Staff, UserRole


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ("id", "name", "description", "created_at")
        read_only_fields = ("id", "created_at")


class StaffSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    hospital_name = serializers.ReadOnlyField(source="hospital.name")
    role_name = serializers.ReadOnlyField(source="role.name")
    email = serializers.EmailField(required=True)
    role_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = Staff
        fields = (
            "id",
            "hospital",
            "hospital_name",
            "role",
            "role_name",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "employee_id",
            "department",
            "position",
            "phone_number",
            "employment_status",
            "created_at",
            "updated_at",
            "role_id",
        )
        read_only_fields = ("id", "hospital_name", "role_name", "full_name", "created_at", "updated_at")


class StaffCreateSerializer(serializers.ModelSerializer):
    """Used internally; direct creation bypasses invitation flow."""

    class Meta:
        model = Staff
        fields = (
            "hospital",
            "first_name",
            "last_name",
            "employee_id",
            "department",
            "position",
            "phone_number",
        )


class UserRoleSerializer(serializers.ModelSerializer):
    role_name = serializers.ReadOnlyField(source="role.name")
    hospital_name = serializers.ReadOnlyField(source="hospital.name", default=None)

    class Meta:
        model = UserRole
        fields = ("id", "user", "role", "role_name", "hospital", "hospital_name", "assigned_at")
        read_only_fields = ("id", "role_name", "hospital_name", "assigned_at")


class AssignRoleSerializer(serializers.Serializer):
    role_id = serializers.UUIDField()
    hospital_id = serializers.UUIDField(required=False)


class InvitationSerializer(serializers.ModelSerializer):
    hospital_name = serializers.ReadOnlyField(source="hospital.name")
    role_name = serializers.ReadOnlyField(source="role.name", default=None)
    invited_by_email = serializers.ReadOnlyField(source="invited_by.email", default=None)

    class Meta:
        model = Invitation
        fields = (
            "id",
            "hospital",
            "hospital_name",
            "email",
            "role",
            "role_name",
            "status",
            "expires_at",
            "invited_by",
            "invited_by_email",
            "accepted_at",
            "created_at",
        )
        read_only_fields = (
            "id",
            "hospital_name",
            "role_name",
            "invited_by_email",
            "status",
            "expires_at",
            "invited_by",
            "accepted_at",
            "created_at",
        )


class SendInvitationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role_id = serializers.UUIDField(required=False)
    first_name = serializers.CharField(max_length=100, required=False, default="")
    last_name = serializers.CharField(max_length=100, required=False, default="")
    department = serializers.CharField(max_length=100, required=False, default="")
    position = serializers.CharField(max_length=100, required=False, default="")


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, required=False)
