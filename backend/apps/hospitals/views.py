"""Hospital views — thin layer delegating to services."""
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import IsHospitalAdmin, IsSuperAdmin
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response
from .models import (
    Hospital,
    HospitalAPIConfig,
    HospitalCapacity,
    HospitalOffboardingRequest,
    HospitalPartnership,
    HospitalRegistrationRequest,
    HospitalUpdateRequest,
)
from .serializers import (
    HospitalAPIConfigSerializer,
    HospitalCapacitySerializer,
    HospitalMapSerializer,
    HospitalOffboardingRequestCreateSerializer,
    HospitalOffboardingRequestSerializer,
    HospitalOffboardingReviewSerializer,
    HospitalPartnershipSerializer,
    HospitalRegistrationRequestDetailSerializer,
    HospitalRegistrationRequestSerializer,
    HospitalRegistrationRejectSerializer,
    HospitalSerializer,
    HospitalUpdateRequestReviewSerializer,
    HospitalUpdateRequestSerializer,
    MyHospitalUpdateSerializer,
)
from .services import (
    approve_hospital_update_request,
    approve_hospital_offboarding_request,
    approve_registration_request,
    create_hospital,
    create_partnership,
    reject_hospital_update_request,
    reject_hospital_offboarding_request,
    reject_registration_request,
    request_hospital_offboarding,
    submit_hospital_update,
    submit_registration_request,
    suspend_hospital,
    verify_hospital,
)


class HospitalRegistrationRequestView(viewsets.GenericViewSet):
    """
    Public endpoint for hospital representatives to submit a registration request.
    No authentication required.
    POST /api/v1/hospital-registration/
    """
    serializer_class = HospitalRegistrationRequestSerializer
    permission_classes = [AllowAny]
    throttle_scope = "hospital_registration"
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        registration = submit_registration_request(serializer.validated_data)
        return Response(
            success_response(data=HospitalRegistrationRequestSerializer(registration).data),
            status=status.HTTP_201_CREATED,
        )


class AdminHospitalRegistrationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    SUPER_ADMIN endpoints for reviewing hospital registration requests.
    GET  /api/v1/admin/hospital-registrations/
    GET  /api/v1/admin/hospital-registrations/{id}/
    POST /api/v1/admin/hospital-registrations/{id}/approve/
    POST /api/v1/admin/hospital-registrations/{id}/reject/
    """
    serializer_class = HospitalRegistrationRequestDetailSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "hospital_type", "country"]
    search_fields = ["name", "email", "admin_name", "admin_email", "registration_number", "city"]
    ordering_fields = ["submitted_at", "name", "status"]
    ordering = ["-submitted_at"]

    def get_queryset(self):
        return HospitalRegistrationRequest.objects.all()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(
                HospitalRegistrationRequestDetailSerializer(page, many=True).data
            )
        return Response(
            success_response(data=HospitalRegistrationRequestDetailSerializer(qs, many=True).data)
        )

    def retrieve(self, request, *args, **kwargs):
        registration = self.get_object()
        return Response(
            success_response(data=HospitalRegistrationRequestDetailSerializer(registration).data)
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        registration = self.get_object()
        result = approve_registration_request(registration, request.user)
        from .serializers import HospitalSerializer  # noqa: PLC0415
        return Response(
            success_response(
                data={
                    "registration_request": HospitalRegistrationRequestDetailSerializer(
                        result["registration_request"]
                    ).data,
                    "hospital": HospitalSerializer(result["hospital"]).data,
                }
            )
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        registration = self.get_object()
        serializer = HospitalRegistrationRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = reject_registration_request(
            registration, request.user, serializer.validated_data.get("rejection_reason", "")
        )
        return Response(
            success_response(data=HospitalRegistrationRequestDetailSerializer(updated).data)
        )


class AdminHospitalOffboardingRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    SUPER_ADMIN endpoints for reviewing hospital offboarding requests.
    GET  /api/v1/admin/hospital-offboarding-requests/
    GET  /api/v1/admin/hospital-offboarding-requests/{id}/
    POST /api/v1/admin/hospital-offboarding-requests/{id}/approve/
    POST /api/v1/admin/hospital-offboarding-requests/{id}/reject/
    """

    serializer_class = HospitalOffboardingRequestSerializer
    permission_classes = [IsSuperAdmin]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "hospital"]
    search_fields = ["hospital__name", "hospital__registration_number", "reason"]
    ordering_fields = ["requested_at", "reviewed_at", "status"]
    ordering = ["-requested_at"]

    def get_queryset(self):
        return HospitalOffboardingRequest.objects.select_related("hospital", "requested_by", "reviewed_by")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(HospitalOffboardingRequestSerializer(page, many=True).data)
        return Response(success_response(data=HospitalOffboardingRequestSerializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        offboarding_request = self.get_object()
        return Response(success_response(data=HospitalOffboardingRequestSerializer(offboarding_request).data))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        offboarding_request = self.get_object()
        serializer = HospitalOffboardingReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = approve_hospital_offboarding_request(
            offboarding_request=offboarding_request,
            actor=request.user,
            admin_notes=serializer.validated_data.get("admin_notes", ""),
        )
        return Response(success_response(data=HospitalOffboardingRequestSerializer(updated).data))

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        offboarding_request = self.get_object()
        serializer = HospitalOffboardingReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = reject_hospital_offboarding_request(
            offboarding_request=offboarding_request,
            actor=request.user,
            admin_notes=serializer.validated_data.get("admin_notes", ""),
        )
        return Response(success_response(data=HospitalOffboardingRequestSerializer(updated).data))


class AdminHospitalUpdateRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HospitalUpdateRequestSerializer
    permission_classes = [IsSuperAdmin]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "hospital"]
    search_fields = ["hospital__name", "hospital__registration_number"]
    ordering_fields = ["requested_at", "reviewed_at", "status"]
    ordering = ["-requested_at"]

    def get_queryset(self):
        return HospitalUpdateRequest.objects.select_related("hospital", "requested_by", "reviewed_by")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(HospitalUpdateRequestSerializer(page, many=True).data)
        return Response(success_response(data=HospitalUpdateRequestSerializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        update_request = self.get_object()
        return Response(success_response(data=HospitalUpdateRequestSerializer(update_request).data))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        update_request = self.get_object()
        approved = approve_hospital_update_request(update_request, request.user)
        return Response(success_response(data=HospitalUpdateRequestSerializer(approved).data))

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        update_request = self.get_object()
        serializer = HospitalUpdateRequestReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rejected = reject_hospital_update_request(
            update_request,
            request.user,
            serializer.validated_data.get("rejection_reason", ""),
        )
        return Response(success_response(data=HospitalUpdateRequestSerializer(rejected).data))


class HospitalViewSet(viewsets.ModelViewSet):
    queryset = Hospital.objects.all()
    serializer_class = HospitalSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["city", "state", "country", "verified_status"]
    search_fields = ["name", "registration_number", "email", "city"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.action in ["create", "verify", "suspend_action"]:
            return [IsSuperAdmin()]
        if self.action in ["update", "partial_update"]:
            return [IsHospitalAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        create_hospital(serializer.validated_data, self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hospital = create_hospital(serializer.validated_data, request.user)
        return Response(
            success_response(data=HospitalSerializer(hospital).data),
            status=status.HTTP_201_CREATED,
        )

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(HospitalSerializer(page, many=True).data)
        return Response(success_response(data=HospitalSerializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        hospital = self.get_object()
        return Response(success_response(data=HospitalSerializer(hospital).data))

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        hospital = self.get_object()

        if request.user.has_role("HOSPITAL_ADMIN") and not request.user.has_role("SUPER_ADMIN"):
            if str(request.user.get_hospital_id()) != str(hospital.id):
                raise PermissionDenied("You can only update your own hospital.")

        serializer = self.get_serializer(hospital, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        if request.user.has_role("SUPER_ADMIN"):
            serializer.save()
            return Response(success_response(data=serializer.data))

        result = submit_hospital_update(
            hospital=hospital,
            actor=request.user,
            validated_data=serializer.validated_data,
        )
        response_payload = HospitalSerializer(result["hospital"]).data
        if result["update_request"] is not None:
            response_payload["pending_update_request"] = HospitalUpdateRequestSerializer(
                result["update_request"]
            ).data
        return Response(success_response(data=response_payload))

    @action(detail=False, methods=["get"], url_path="my-hospital", permission_classes=[IsHospitalAdmin])
    def my_hospital(self, request):
        hospital_id = request.user.get_hospital_id()
        if not hospital_id:
            raise PermissionDenied("No hospital is associated with your account.")

        hospital = Hospital.objects.get(id=hospital_id)
        return Response(success_response(data=HospitalSerializer(hospital).data))

    @my_hospital.mapping.patch
    def my_hospital_patch(self, request):
        hospital_id = request.user.get_hospital_id()
        if not hospital_id:
            raise PermissionDenied("No hospital is associated with your account.")

        hospital = Hospital.objects.get(id=hospital_id)
        serializer = MyHospitalUpdateSerializer(hospital, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        result = submit_hospital_update(
            hospital=hospital,
            actor=request.user,
            validated_data=serializer.validated_data,
        )

        payload = HospitalSerializer(result["hospital"]).data
        if result["update_request"] is not None:
            payload["pending_update_request"] = HospitalUpdateRequestSerializer(
                result["update_request"]
            ).data
        return Response(success_response(data=payload))

    @action(detail=False, methods=["get"], url_path="map", permission_classes=[IsAuthenticated])
    def map_data(self, request):
        hospitals = Hospital.objects.exclude(latitude__isnull=True).exclude(longitude__isnull=True)
        return Response(success_response(data=HospitalMapSerializer(hospitals, many=True).data))

    @action(detail=True, methods=["post"], permission_classes=[IsSuperAdmin])
    def verify(self, request, pk=None):
        hospital = self.get_object()
        updated = verify_hospital(hospital, request.user)
        return Response(success_response(data=HospitalSerializer(updated).data))

    @action(detail=True, methods=["post"], url_path="suspend", permission_classes=[IsSuperAdmin])
    def suspend_action(self, request, pk=None):
        hospital = self.get_object()
        updated = suspend_hospital(hospital, request.user)
        return Response(success_response(data=HospitalSerializer(updated).data))

    @action(detail=True, methods=["get", "put"], url_path="capacity")
    def capacity(self, request, pk=None):
        hospital = self.get_object()
        capacity, _ = HospitalCapacity.objects.get_or_create(hospital=hospital)
        if request.method == "GET":
            return Response(success_response(data=HospitalCapacitySerializer(capacity).data))
        serializer = HospitalCapacitySerializer(capacity, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(success_response(data=serializer.data))

    @action(detail=True, methods=["get"], url_path="staff")
    def staff_list(self, request, pk=None):
        hospital = self.get_object()
        from apps.staff.serializers import StaffSerializer  # noqa: PLC0415
        from apps.staff.models import Staff  # noqa: PLC0415
        qs = Staff.objects.filter(hospital=hospital, employment_status=Staff.EmploymentStatus.ACTIVE)
        return Response(success_response(data=StaffSerializer(qs, many=True).data))

    @action(
        detail=True,
        methods=["post"],
        url_path="offboarding-request",
        permission_classes=[IsAuthenticated],
    )
    def offboarding_request(self, request, pk=None):
        hospital = self.get_object()

        if not request.user.has_role("HOSPITAL_ADMIN"):
            raise PermissionDenied("Only HOSPITAL_ADMIN can request hospital offboarding.")

        user_hospital_id = request.user.get_hospital_id()
        if not user_hospital_id or str(user_hospital_id) != str(hospital.id):
            raise PermissionDenied("You can only request offboarding for your own hospital.")

        serializer = HospitalOffboardingRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        offboarding_request = request_hospital_offboarding(
            hospital=hospital,
            reason=serializer.validated_data["reason"],
            actor=request.user,
        )
        return Response(
            success_response(data=HospitalOffboardingRequestSerializer(offboarding_request).data),
            status=status.HTTP_201_CREATED,
        )


class HospitalPartnershipViewSet(viewsets.ModelViewSet):
    serializer_class = HospitalPartnershipSerializer
    permission_classes = [IsHospitalAdmin]

    def get_queryset(self):
        user = self.request.user
        hospital_id = user.get_hospital_id()
        return HospitalPartnership.objects.filter(
            hospital_a_id=hospital_id
        ) | HospitalPartnership.objects.filter(hospital_b_id=hospital_id)

    def create(self, request, *args, **kwargs):
        hospital_b_id = request.data.get("hospital_b_id")
        relationship_type = request.data.get("relationship_type", "")
        partnership = create_partnership(
            request.user.get_hospital_id(), hospital_b_id, request.user, relationship_type
        )
        return Response(
            success_response(data=HospitalPartnershipSerializer(partnership).data),
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partnership = self.get_object()
        serializer = self.get_serializer(partnership, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(success_response(data=serializer.data))


class HospitalAPIConfigViewSet(viewsets.ModelViewSet):
    serializer_class = HospitalAPIConfigSerializer
    permission_classes = [IsHospitalAdmin]

    def get_queryset(self):
        hospital_id = self.request.user.get_hospital_id()
        return HospitalAPIConfig.objects.filter(hospital_id=hospital_id)

    def perform_create(self, serializer):
        serializer.save(hospital_id=self.request.user.get_hospital_id())

    @action(detail=True, methods=["post"], url_path="sync")
    def trigger_sync(self, request, pk=None):
        config = self.get_object()
        from apps.hospitals.tasks import sync_hospital_api_task  # noqa: PLC0415
        sync_hospital_api_task.delay(str(config.hospital_id))
        return Response(success_response(data={"detail": "Sync queued."}))
