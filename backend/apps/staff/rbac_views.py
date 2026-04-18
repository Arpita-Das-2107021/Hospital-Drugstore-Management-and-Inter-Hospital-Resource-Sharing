"""Dual-scope RBAC API views."""
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import (
    CanAssignHospitalRoles,
    CanAssignPlatformRoles,
    CanManageHospitalRoles,
    CanManagePlatformRoles,
    CanViewUserEffectivePermissions,
)
from common.permissions.runtime import is_platform_operator
from common.utils.response import error_response, success_response

from .models import HospitalRole, Permission, PlatformRole, UserHospitalRole, UserPlatformRole
from .rbac_services import (
    assign_permissions_to_hospital_role,
    assign_permissions_to_platform_role,
    assign_platform_role_to_user,
    create_hospital_role,
    create_platform_role,
    get_effective_permissions_for_user_v2,
    remove_user_hospital_role,
    revoke_permissions_from_hospital_role,
    revoke_permissions_from_platform_role,
    revoke_platform_role_from_user,
    set_user_hospital_role,
)
from .serializers import (
    AssignPlatformRoleSerializer,
    AssignRolePermissionsSerializer,
    HospitalRoleSerializer,
    PermissionSerializer,
    PlatformRoleSerializer,
    SetUserHospitalRoleSerializer,
    UserHospitalRoleSerializer,
    UserPlatformRoleSerializer,
)

UserAccount = get_user_model()
HOSPITAL_SCOPED_ROLE_NAMES = (
    "HEALTHCARE_ADMIN",
    "STAFF",
    "PHARMACIST",
    "LOGISTICS_STAFF",
    "INVENTORY_MANAGER",
    "DOCTOR",
)


class PlatformRoleViewSet(viewsets.ModelViewSet):
    """Manage platform-level role definitions and permission mappings."""

    queryset = PlatformRole.objects.exclude(name__in=HOSPITAL_SCOPED_ROLE_NAMES).order_by("name")
    serializer_class = PlatformRoleSerializer
    permission_classes = [IsAuthenticated, CanManagePlatformRoles]

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(success_response(data=serializer.data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = create_platform_role(
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
        )
        return Response(success_response(data=self.get_serializer(role).data), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post", "delete"], url_path="permissions")
    def permissions(self, request, pk=None):
        role = self.get_object()

        if request.method == "GET":
            permissions_qs = Permission.objects.filter(
                platform_role_permissions__platform_role=role,
                is_active=True,
            ).order_by("code")
            return Response(success_response(data=PermissionSerializer(permissions_qs, many=True).data))

        serializer = AssignRolePermissionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_codes = serializer.validated_data["permission_codes"]

        if request.method == "POST":
            payload = assign_permissions_to_platform_role(role=role, permission_codes=permission_codes, actor=request.user)
            return Response(success_response(data=payload), status=status.HTTP_200_OK)

        payload = revoke_permissions_from_platform_role(role=role, permission_codes=permission_codes, actor=request.user)
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class HospitalRoleViewSet(viewsets.ModelViewSet):
    """Manage hospital-scoped role definitions and permission mappings."""

    serializer_class = HospitalRoleSerializer
    permission_classes = [IsAuthenticated, CanManageHospitalRoles]

    def get_queryset(self):
        queryset = HospitalRole.objects.select_related("hospital").all().order_by("hospital__name", "name")
        user = self.request.user

        if is_platform_operator(user, allow_role_fallback=True):
            return queryset

        staff = getattr(user, "staff", None)
        hospital = getattr(staff, "hospital", None)
        if not hospital:
            return HospitalRole.objects.none()
        return queryset.filter(hospital=hospital)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(success_response(data=serializer.data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        actor = request.user
        role_name = str(request.data.get("name", "")).strip()
        role_description = str(request.data.get("description", "")).strip()

        if not role_name:
            return Response(
                error_response("validation_error", "Invalid data submitted.", {"name": ["This field is required."]}),
                status=status.HTTP_400_BAD_REQUEST,
            )

        hospital = None
        if is_platform_operator(actor, allow_role_fallback=True):
            hospital_id = request.data.get("hospital")
            if hospital_id:
                from apps.hospitals.models import Hospital

                hospital = get_object_or_404(Hospital, id=hospital_id)

        if hospital is None:
            staff = getattr(actor, "staff", None)
            hospital = getattr(staff, "hospital", None)

        if hospital is None:
            return Response(
                error_response("validation_error", "Invalid data submitted.", {"hospital": ["Hospital is required."]}),
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = create_hospital_role(hospital=hospital, name=role_name, description=role_description)
        return Response(success_response(data=self.get_serializer(role).data), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post", "delete"], url_path="permissions")
    def permissions(self, request, pk=None):
        role = self.get_object()

        if request.method == "GET":
            permissions_qs = Permission.objects.filter(
                hospital_role_permissions__hospital_role=role,
                is_active=True,
            ).order_by("code")
            return Response(success_response(data=PermissionSerializer(permissions_qs, many=True).data))

        serializer = AssignRolePermissionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_codes = serializer.validated_data["permission_codes"]

        if request.method == "POST":
            payload = assign_permissions_to_hospital_role(role=role, permission_codes=permission_codes, actor=request.user)
            return Response(success_response(data=payload), status=status.HTTP_200_OK)

        payload = revoke_permissions_from_hospital_role(role=role, permission_codes=permission_codes, actor=request.user)
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class UserPlatformRoleViewSet(viewsets.GenericViewSet):
    """Assign and revoke platform roles for a specific user."""

    permission_classes = [IsAuthenticated, CanAssignPlatformRoles]

    def get_queryset(self):
        return UserPlatformRole.objects.filter(user_id=self.kwargs["user_pk"]).select_related("platform_role")

    def list(self, request, *args, **kwargs):
        serializer = UserPlatformRoleSerializer(self.get_queryset().order_by("-assigned_at"), many=True)
        return Response(success_response(data=serializer.data))

    def create(self, request, *args, **kwargs):
        serializer = AssignPlatformRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user = get_object_or_404(UserAccount, id=self.kwargs["user_pk"])
        role = get_object_or_404(PlatformRole, id=serializer.validated_data["platform_role_id"])

        assignment = assign_platform_role_to_user(user=target_user, platform_role=role, actor=request.user)
        return Response(success_response(data=UserPlatformRoleSerializer(assignment).data), status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        assignment = get_object_or_404(self.get_queryset(), id=self.kwargs["pk"])
        revoke_platform_role_from_user(assignment=assignment, actor=request.user)
        return Response(success_response(data={"detail": "Platform role revoked."}), status=status.HTTP_200_OK)


class UserHospitalRoleView(APIView):
    """Set, inspect, or remove the single hospital role assignment for a user."""

    permission_classes = [IsAuthenticated, CanAssignHospitalRoles]

    def get(self, request, user_pk):
        target_user = get_object_or_404(UserAccount, id=user_pk)
        assignment = UserHospitalRole.objects.filter(user=target_user).select_related("hospital_role", "hospital").first()
        if not assignment:
            return Response(success_response(data=None), status=status.HTTP_200_OK)
        return Response(success_response(data=UserHospitalRoleSerializer(assignment).data), status=status.HTTP_200_OK)

    def put(self, request, user_pk):
        target_user = get_object_or_404(UserAccount, id=user_pk)
        serializer = SetUserHospitalRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        role = get_object_or_404(HospitalRole, id=serializer.validated_data["hospital_role_id"])
        assignment, replaced_existing = set_user_hospital_role(user=target_user, hospital_role=role, actor=request.user)

        payload = UserHospitalRoleSerializer(assignment).data
        payload["replaced_existing"] = replaced_existing
        return Response(success_response(data=payload), status=status.HTTP_200_OK)

    def delete(self, request, user_pk):
        target_user = get_object_or_404(UserAccount, id=user_pk)
        remove_user_hospital_role(user=target_user, actor=request.user)
        return Response(success_response(data={"detail": "Hospital role removed."}), status=status.HTTP_200_OK)


class UserEffectivePermissionsV2View(APIView):
    """Return effective permissions aggregated across platform and hospital role scopes."""

    permission_classes = [IsAuthenticated, CanViewUserEffectivePermissions]

    def get(self, request, user_pk):
        target_user = get_object_or_404(UserAccount, id=user_pk)
        payload = get_effective_permissions_for_user_v2(target_user)
        return Response(success_response(data=payload), status=status.HTTP_200_OK)
