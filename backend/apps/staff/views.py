"""Staff app views — thin, delegate to services."""
import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import IsHospitalAdmin, IsSameHospital, IsSuperAdmin
from common.utils.pagination import StandardResultsPagination
from common.utils.response import error_response, success_response

from .models import Invitation, Role, Staff, UserRole
from .serializers import (
    AcceptInvitationSerializer,
    AssignRoleSerializer,
    InvitationSerializer,
    RoleSerializer,
    SendInvitationSerializer,
    StaffSerializer,
    UserRoleSerializer,
)
from .services import (
    accept_invitation,
    assign_role,
    create_staff_with_invitation,
    revoke_invitation,
    revoke_role,
    send_invitation,
    sync_staff_email_with_user_account,
    suspend_staff,
)

logger = logging.getLogger("hrsp.staff")


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve available roles (read-only; seeded by management command)."""

    queryset = Role.objects.all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]


class StaffViewSet(viewsets.ModelViewSet):
    """CRUD for staff profiles within a hospital."""

    serializer_class = StaffSerializer
    permission_classes = [IsAuthenticated, IsHospitalAdmin]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return Staff.objects.select_related("hospital").all()
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
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_queryset(self):
        return UserRole.objects.filter(user_id=self.kwargs.get("user_pk")).select_related(
            "role", "hospital"
        )

    def create(self, request, *args, **kwargs):
        from django.contrib.auth import get_user_model

        UserAccount = get_user_model()
        s = AssignRoleSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = UserAccount.objects.get(pk=self.kwargs["user_pk"])
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


class InvitationViewSet(viewsets.ModelViewSet):
    """Manage staff invitations for a hospital."""

    serializer_class = InvitationSerializer
    permission_classes = [IsAuthenticated, IsHospitalAdmin]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if user.roles.filter(name="SUPER_ADMIN").exists():
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

