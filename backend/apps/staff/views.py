"""Staff app views — thin, delegate to services."""
import logging

from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import (
    CanManageRolePermissions,
    CanManageUserRoles,
    CanViewUserEffectivePermissions,
    IsHospitalAdmin,
)
from common.permissions.runtime import is_platform_operator
from common.utils.pagination import StandardResultsPagination
from common.utils.response import error_response, success_response

from .models import Invitation, Permission, Role, Staff, UserRole
from .serializers import (
    AcceptInvitationSerializer,
    AssignRolePermissionsSerializer,
    AssignRoleSerializer,
    InvitationSerializer,
    PermissionSerializer,
    RoleSerializer,
    SendInvitationSerializer,
    StaffSerializer,
    UserRoleSerializer,
)
from .services import (
    accept_invitation,
    assign_role,
    assign_permissions_to_role,
    create_staff_with_invitation,
    get_effective_permissions_for_user,
    revoke_invitation,
    revoke_permissions_from_role,
    revoke_role,
    send_invitation,
    sync_staff_email_with_user_account,
    suspend_staff,
)

logger = logging.getLogger("hrsp.staff")

HEALTHCARE_ADMIN_ROLE_NAMES = ("HEALTHCARE_ADMIN", "HOSPITAL_ADMIN")
SYSTEM_ADMIN_ROLE_NAMES = ("SUPER_ADMIN", "PLATFORM_ADMIN", "SYSTEM_ADMIN")


class CanManageInvitations(BasePermission):
    """Allow invitation access for platform operators and hospital admins."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Platform operators can view/manage invitations across hospitals.
        if is_platform_operator(user, allow_role_fallback=True):
            return True

        # Healthcare users remain guarded by hospital-admin checks.
        return IsHospitalAdmin().has_permission(request, view)


class CanManageStaffDirectory(BasePermission):
    """Allow staff directory access for platform operators and hospital admins."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if is_platform_operator(user, allow_role_fallback=True):
            return True

        return IsHospitalAdmin().has_permission(request, view)


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve available roles (read-only; seeded by management command)."""

    queryset = Role.objects.all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]

    @action(
        detail=True,
        methods=["get", "post", "delete"],
        url_path="permissions",
        permission_classes=[IsAuthenticated, CanManageRolePermissions],
    )
    def permissions(self, request, pk=None):
        role = self.get_object()

        if request.method == "GET":
            permissions_qs = role.permissions.filter(is_active=True).order_by("code")
            return Response(success_response(data=PermissionSerializer(permissions_qs, many=True).data))

        serializer = AssignRolePermissionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_codes = serializer.validated_data["permission_codes"]

        if request.method == "POST":
            payload = assign_permissions_to_role(
                role=role,
                permission_codes=permission_codes,
                actor=request.user,
            )
            return Response(success_response(data=payload), status=status.HTTP_200_OK)

        payload = revoke_permissions_from_role(role=role, permission_codes=permission_codes)
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve available permissions."""

    queryset = Permission.objects.filter(is_active=True).order_by("code")
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated]


class StaffViewSet(viewsets.ModelViewSet):
    """CRUD for staff profiles within a hospital."""

    serializer_class = StaffSerializer
    permission_classes = [IsAuthenticated, CanManageStaffDirectory]
    pagination_class = StandardResultsPagination

    def _platform_staff_and_healthcare_admin_queryset(self):
        # Platform scope: staff linked to platform users plus healthcare-admin staff.
        platform_staff_filter = (
            models.Q(user_account__platform_role_assignments__platform_role__is_active=True)
            | models.Q(user_account__context_domain="PLATFORM")
            | models.Q(user_account__user_roles__role__name__in=SYSTEM_ADMIN_ROLE_NAMES)
            | models.Q(role__name__in=SYSTEM_ADMIN_ROLE_NAMES)
        )
        healthcare_admin_filter = (
            models.Q(
                user_account__hospital_role_assignment__hospital_role__name__in=HEALTHCARE_ADMIN_ROLE_NAMES,
                user_account__hospital_role_assignment__hospital_role__is_active=True,
            )
            | models.Q(user_account__user_roles__role__name__in=HEALTHCARE_ADMIN_ROLE_NAMES)
            | models.Q(role__name__in=HEALTHCARE_ADMIN_ROLE_NAMES)
        )

        return (
            Staff.objects.select_related("hospital", "user_account")
            .filter(platform_staff_filter | healthcare_admin_filter)
            .distinct()
        )

    def get_queryset(self):
        user = self.request.user
        if is_platform_operator(user, allow_role_fallback=True):
            return self._platform_staff_and_healthcare_admin_queryset()
        if hasattr(user, "staff") and user.staff:
            return Staff.objects.select_related("hospital").filter(hospital=user.staff.hospital)
        return Staff.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            s = self.get_serializer(page, many=True)
            return self.get_paginated_response(s.data)
        s = self.get_serializer(qs, many=True)
        return Response(success_response(data=s.data))

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        return Response(success_response(data=self.get_serializer(instance).data))

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        email = data.pop("email")
        role_id = data.pop("role_id", None)

        if hasattr(request.user, "staff") and request.user.staff:
            data["hospital"] = request.user.staff.hospital

        staff = create_staff_with_invitation(
            hospital=data["hospital"],
            data=data,
            email=email,
            actor=request.user,
            role_id=role_id,
        )
        return Response(
            success_response(data=self.get_serializer(staff).data),
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        s = self.get_serializer(instance, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        role_id = s.validated_data.pop("role_id", None)
        s.save()
        if "email" in s.validated_data:
            sync_staff_email_with_user_account(instance, s.validated_data["email"])

        if role_id:
            from .models import Role  # noqa: PLC0415

            try:
                role = Role.objects.get(id=role_id)
            except Role.DoesNotExist:
                return Response(
                    error_response("validation_error", "Invalid data submitted.", {"role_id": ["Role not found."]}),
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance.role = role
            instance.save(update_fields=["role", "updated_at"])

        return Response(success_response(data=s.data))

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        suspend_staff(instance, request.user)
        return Response(success_response(data={"detail": "Staff member suspended."}))

    @action(detail=True, methods=["post"], url_path="suspend")
    def suspend(self, request, pk=None):
        staff_obj = self.get_object()
        suspend_staff(staff_obj, request.user)
        return Response(success_response(data={"detail": "Staff member suspended."}))


class UserRoleViewSet(viewsets.ModelViewSet):
    """Assign/revoke roles for a specific user."""

    serializer_class = UserRoleSerializer
    permission_classes = [IsAuthenticated, CanManageUserRoles]

    def get_queryset(self):
        return UserRole.objects.filter(user_id=self.kwargs.get("user_pk")).select_related(
            "role", "hospital"
        )

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset().order_by("-assigned_at")
        serializer = self.get_serializer(queryset, many=True)
        return Response(success_response(data=serializer.data))

    def create(self, request, *args, **kwargs):
        from django.contrib.auth import get_user_model

        UserAccount = get_user_model()
        s = AssignRoleSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = get_object_or_404(UserAccount, pk=self.kwargs["user_pk"])
        user_role = assign_role(
            user=user,
            role_id=s.validated_data["role_id"],
            hospital_id=s.validated_data.get("hospital_id"),
            actor=request.user,
        )
        return Response(
            success_response(data=UserRoleSerializer(user_role).data),
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        revoke_role(
            user=instance.user,
            role_id=instance.role_id,
            hospital_id=instance.hospital_id,
        )
        return Response(success_response(data={"detail": "Role revoked."}), status=status.HTTP_200_OK)


class UserEffectivePermissionsView(APIView):
    """Return effective permissions for a user based on role assignments."""

    permission_classes = [IsAuthenticated, CanViewUserEffectivePermissions]

    def get(self, request, user_pk):
        from django.contrib.auth import get_user_model

        UserAccount = get_user_model()
        user = get_object_or_404(UserAccount, pk=user_pk)
        payload = get_effective_permissions_for_user(user)
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class InvitationViewSet(viewsets.ModelViewSet):
    """Manage staff invitations for a hospital."""

    serializer_class = InvitationSerializer
    permission_classes = [IsAuthenticated, CanManageInvitations]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if is_platform_operator(user, allow_role_fallback=True):
            return Invitation.objects.select_related("hospital", "role", "staff").all()
        if hasattr(user, "staff") and user.staff:
            return Invitation.objects.select_related("hospital", "role", "staff").filter(
                hospital=user.staff.hospital
            )
        return Invitation.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            s = self.get_serializer(page, many=True)
            return self.get_paginated_response(s.data)
        s = self.get_serializer(qs, many=True)
        return Response(success_response(data=s.data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        s = SendInvitationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        hospital = request.user.staff.hospital if (hasattr(request.user, "staff") and request.user.staff) else None
        if not hospital:
            return Response(
                error_response("no_hospital", "Actor has no hospital context."),
                status=status.HTTP_400_BAD_REQUEST,
            )
        invitation = send_invitation(
            hospital=hospital,
            email=d["email"],
            role_id=d.get("role_id"),
            actor=request.user,
            extra={
                "first_name": d.get("first_name", ""),
                "last_name": d.get("last_name", ""),
                "department": d.get("department", ""),
                "position": d.get("position", ""),
            },
        )
        return Response(
            success_response(data=InvitationSerializer(invitation).data),
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        invitation = self.get_object()
        revoke_invitation(invitation, request.user)
        return Response(success_response(data={"detail": "Invitation revoked."}))


class AcceptInvitationView(APIView):
    """Public endpoint — no auth required to accept an invitation."""

    permission_classes = [AllowAny]

    def post(self, request):
        s = AcceptInvitationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        user = accept_invitation(
            token=d["token"],
            password=d["password"],
            first_name=d.get("first_name", ""),
            last_name=d.get("last_name", ""),
        )
        return Response(
            success_response(data={"detail": "Invitation accepted. You may now log in.", "email": user.email}),
            status=status.HTTP_201_CREATED,
        )

