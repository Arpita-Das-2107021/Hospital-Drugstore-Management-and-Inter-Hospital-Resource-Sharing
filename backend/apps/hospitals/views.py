"""Hospital views — thin layer delegating to services."""
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import (
    CanRequestHospitalOffboarding,
    CanReviewHospitalOffboardingRequests,
    CanReviewHospitalUpdateRequests,
    CanSubmitHospitalUpdateRequest,
    CanViewHospitalUpdateRequests,
    IsHospitalAdmin,
    IsSuperAdmin,
)
from common.permissions.runtime import has_any_permission, is_platform_operator
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
    AdminHospitalDirectOffboardSerializer,
    HospitalAPIConfigSerializer,
    HospitalCapacitySerializer,
    HospitalMapSerializer,
    HospitalOffboardingRequestCreateSerializer,
    HospitalOffboardingRequestSerializer,
    HospitalOffboardingReviewSerializer,
    HospitalPartnershipSerializer,
    HospitalProfilePictureUploadSerializer,
    HospitalRegistrationAPICheckRequestSerializer,
    HospitalRegistrationRequestDetailSerializer,
    HospitalRegistrationReviewEmailSerializer,
    HospitalRegistrationRequestSerializer,
    HospitalRegistrationRejectSerializer,
    HospitalRegistrationSingleAPICheckRequestSerializer,
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
    get_registration_api_check_snapshot,
    normalize_registration_api_names,
    offboard_hospital_direct,
    reject_hospital_update_request,
    reject_hospital_offboarding_request,
    reject_registration_request,
    run_registration_api_checks,
    request_hospital_offboarding,
    send_registration_review_email,
    submit_hospital_update,
    submit_registration_request,
    suspend_hospital,
    verify_hospital,
)

HOSPITAL_ADMIN_ROLE = "HEALTHCARE_ADMIN"


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
            success_response(
                data=HospitalRegistrationRequestSerializer(
                    registration,
                    context={"request": request},
                ).data
            ),
            status=status.HTTP_201_CREATED,
        )


class AdminHospitalRegistrationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    SUPER_ADMIN endpoints for reviewing hospital registration requests.
    GET  /api/v1/admin/hospital-registrations/
    GET  /api/v1/admin/hospital-registrations/{id}/
    POST /api/v1/admin/hospital-registrations/{id}/approve/
    POST /api/v1/admin/hospital-registrations/{id}/reject/
    POST /api/v1/admin/hospital-registrations/{id}/check-api/
    POST /api/v1/admin/hospital-registrations/{id}/check-api/{api_name}/
    GET  /api/v1/admin/hospital-registrations/{id}/api-check-results/
    POST /api/v1/admin/hospital-registrations/{id}/send-review-email/
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
                HospitalRegistrationRequestDetailSerializer(
                    page,
                    many=True,
                    context={"request": request},
                ).data
            )
        return Response(
            success_response(
                data=HospitalRegistrationRequestDetailSerializer(
                    qs,
                    many=True,
                    context={"request": request},
                ).data
            )
        )

    def retrieve(self, request, *args, **kwargs):
        registration = self.get_object()
        return Response(
            success_response(
                data=HospitalRegistrationRequestDetailSerializer(
                    registration,
                    context={"request": request},
                ).data
            )
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
                        result["registration_request"],
                        context={"request": request},
                    ).data,
                    "hospital": HospitalSerializer(
                        result["hospital"],
                        context={"request": request},
                    ).data,
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
            success_response(
                data=HospitalRegistrationRequestDetailSerializer(
                    updated,
                    context={"request": request},
                ).data
            )
        )

    @action(detail=True, methods=["post"], url_path="send-review-email")
    def send_review_email(self, request, pk=None):
        registration = self.get_object()
        serializer = HospitalRegistrationReviewEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = send_registration_review_email(
            registration=registration,
            actor=request.user,
            subject=serializer.validated_data["subject"],
            message=serializer.validated_data["message"],
            issue_type=serializer.validated_data["issue_type"],
            failed_apis=serializer.validated_data.get("failed_apis", []),
            mark_changes_requested=serializer.validated_data.get("mark_changes_requested", False),
        )

        return Response(
            success_response(
                data={
                    "registration_request": HospitalRegistrationRequestDetailSerializer(
                        result["registration"],
                        context={"request": request},
                    ).data,
                    "review_email": {
                        "recipient_email": result["recipient_email"],
                        "issue_type": result["issue_type"],
                        "failed_apis": result["failed_apis"],
                        "changes_requested_marked": result["changes_requested_marked"],
                    },
                }
            )
        )

    @action(detail=True, methods=["post"], url_path="check-api")
    def check_api(self, request, pk=None):
        registration = self.get_object()
        serializer = HospitalRegistrationAPICheckRequestSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        result = run_registration_api_checks(
            registration=registration,
            api_names=serializer.validated_data.get("api_names"),
            timeout_seconds=serializer.validated_data.get("timeout_seconds", 15),
        )
        return Response(success_response(data=result))

    @action(detail=True, methods=["post"], url_path=r"check-api/(?P<api_name>[^/.]+)")
    def check_single_api(self, request, pk=None, api_name=None):
        registration = self.get_object()
        serializer = HospitalRegistrationSingleAPICheckRequestSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        normalized_api_name = normalize_registration_api_names([str(api_name or "")])[0]
        timeout_seconds = serializer.validated_data.get("timeout_seconds", 15)

        if normalized_api_name == "healthcheck":
            # Explicitly skip this endpoint: callers should validate concrete APIs
            # (for example, resources) via dedicated routes.
            result = {
                "registration_id": str(registration.id),
                "checked_at": timezone.now(),
                "checked_apis": [],
                "failed_apis": [],
                "schema_failed_apis": [],
                "connectivity_failed_apis": [],
                "summary": {
                    "total": 0,
                    "success": 0,
                    "failed": 0,
                    "schema_failed": 0,
                    "connectivity_failed": 0,
                },
                "contract_enforcement": get_registration_api_check_snapshot(registration=registration).get(
                    "contract_enforcement",
                    {},
                ),
                "results": {},
                "skipped_apis": ["healthcheck"],
            }
            return Response(success_response(data=result))

        result = run_registration_api_checks(
            registration=registration,
            api_names=[normalized_api_name],
            timeout_seconds=timeout_seconds,
        )

        return Response(success_response(data=result))

    @action(detail=True, methods=["get"], url_path="api-check-results")
    def api_check_results(self, request, pk=None):
        registration = self.get_object()
        result = get_registration_api_check_snapshot(registration=registration)
        return Response(success_response(data=result))

    @action(detail=True, methods=["get"], url_path="review-email-history")
    def review_email_history(self, request, pk=None):
        from apps.audit.models import AuditLog  # noqa: PLC0415

        registration = self.get_object()
        events = AuditLog.objects.filter(
            event_type="registration_review_email_sent",
            object_type="HospitalRegistrationRequest",
            object_id=registration.id,
        ).select_related("actor").order_by("-created_at")

        history = [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "actor_id": str(event.actor_id) if event.actor_id else None,
                "actor_email": getattr(event.actor, "email", None),
                "metadata": event.metadata or {},
                "created_at": event.created_at,
            }
            for event in events
        ]
        return Response(
            success_response(
                data={
                    "registration_id": str(registration.id),
                    "history": history,
                }
            )
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
    permission_classes = [CanReviewHospitalOffboardingRequests]
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
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "hospital"]
    search_fields = ["hospital__name", "hospital__registration_number"]
    ordering_fields = ["requested_at", "reviewed_at", "status"]
    ordering = ["-requested_at"]

    def get_permissions(self):
        if self.action in {"approve", "reject"}:
            return [CanReviewHospitalUpdateRequests()]
        return [IsAuthenticated()]

    def _can_review_requests(self) -> bool:
        return CanReviewHospitalUpdateRequests().has_permission(self.request, self)

    def _can_view_own_hospital_requests(self) -> bool:
        return CanViewHospitalUpdateRequests().has_permission(self.request, self)

    def _apply_update_request_filters(
        self,
        queryset,
        *,
        allow_hospital_param: bool,
        default_pending_only: bool,
    ):
        if allow_hospital_param:
            requested_hospital_id = (
                self.request.query_params.get("hospital_id")
                or self.request.query_params.get("hospital")
            )
            if requested_hospital_id:
                queryset = queryset.filter(hospital_id=requested_hospital_id)

        status_filter = str(self.request.query_params.get("status") or "").strip().lower()
        pending_only_raw = str(self.request.query_params.get("pending_only") or "").strip().lower()
        if pending_only_raw:
            pending_only = pending_only_raw not in {"0", "false", "no"}
        else:
            pending_only = default_pending_only

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        elif pending_only:
            queryset = queryset.filter(status=HospitalUpdateRequest.Status.PENDING)

        requested_from_raw = str(self.request.query_params.get("requested_from") or "").strip()
        if requested_from_raw:
            requested_from = parse_date(requested_from_raw)
            if requested_from is None:
                raise ValidationError({"requested_from": "Use YYYY-MM-DD format."})
            queryset = queryset.filter(requested_at__date__gte=requested_from)

        requested_to_raw = str(self.request.query_params.get("requested_to") or "").strip()
        if requested_to_raw:
            requested_to = parse_date(requested_to_raw)
            if requested_to is None:
                raise ValidationError({"requested_to": "Use YYYY-MM-DD format."})
            queryset = queryset.filter(requested_at__date__lte=requested_to)

        return queryset

    def get_queryset(self):
        queryset = HospitalUpdateRequest.objects.select_related("hospital", "requested_by", "reviewed_by")
        if self._can_review_requests():
            return self._apply_update_request_filters(
                queryset,
                allow_hospital_param=True,
                default_pending_only=True,
            )

        if self._can_view_own_hospital_requests():
            hospital_id = self.request.user.get_hospital_id()
            scoped_queryset = queryset.filter(hospital_id=hospital_id)
            return self._apply_update_request_filters(
                scoped_queryset,
                allow_hospital_param=False,
                default_pending_only=False,
            )

        raise PermissionDenied("You do not have permission to view hospital update requests.")

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
        serializer = HospitalUpdateRequestReviewSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        approved = approve_hospital_update_request(
            update_request,
            request.user,
            serializer.validated_data.get("review_comment", ""),
        )
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
            serializer.validated_data.get("review_comment", ""),
        )
        return Response(success_response(data=HospitalUpdateRequestSerializer(rejected).data))


class HospitalViewSet(viewsets.ModelViewSet):
    queryset = Hospital.objects.all()
    serializer_class = HospitalSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "city",
        "state",
        "country",
        "verified_status",
        "facility_type",
        "data_submission_type",
        "inventory_source_type",
        "region_level_1",
        "region_level_2",
        "region_level_3",
    ]
    search_fields = ["name", "registration_number", "email", "city"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.action in ["create", "verify", "suspend_action", "admin_offboard"]:
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
            success_response(data=HospitalSerializer(hospital, context={"request": request}).data),
            status=status.HTTP_201_CREATED,
        )

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(
                HospitalSerializer(page, many=True, context={"request": request}).data
            )
        return Response(
            success_response(data=HospitalSerializer(qs, many=True, context={"request": request}).data)
        )

    def retrieve(self, request, *args, **kwargs):
        hospital = self.get_object()
        return Response(success_response(data=HospitalSerializer(hospital, context={"request": request}).data))

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        hospital = self.get_object()

        if has_any_permission(
            request.user,
            ("hospital:hospital.update",),
            allow_role_fallback=True,
            legacy_roles=(HOSPITAL_ADMIN_ROLE,),
        ) and not is_platform_operator(request.user, allow_role_fallback=True):
            if str(request.user.get_hospital_id()) != str(hospital.id):
                raise PermissionDenied("You can only update your own hospital.")

        if not CanSubmitHospitalUpdateRequest().has_permission(request, self):
            raise PermissionDenied("You do not have permission to submit hospital update requests.")

        serializer = MyHospitalUpdateSerializer(hospital, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        result = submit_hospital_update(
            hospital=hospital,
            actor=request.user,
            validated_data=serializer.validated_data,
        )
        response_payload = HospitalSerializer(result["hospital"], context={"request": request}).data
        response_payload["requiresApproval"] = bool(result.get("requires_approval", False))
        response_payload["status"] = result.get("status", "Applied")
        response_payload["message"] = result.get("message", "Changes applied successfully")
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
        return Response(success_response(data=HospitalSerializer(hospital, context={"request": request}).data))

    @my_hospital.mapping.patch
    def my_hospital_patch(self, request):
        hospital_id = request.user.get_hospital_id()
        if not hospital_id:
            raise PermissionDenied("No hospital is associated with your account.")

        if not CanSubmitHospitalUpdateRequest().has_permission(request, self):
            raise PermissionDenied("You do not have permission to submit hospital update requests.")

        hospital = Hospital.objects.get(id=hospital_id)
        serializer = MyHospitalUpdateSerializer(hospital, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        result = submit_hospital_update(
            hospital=hospital,
            actor=request.user,
            validated_data=serializer.validated_data,
        )

        payload = HospitalSerializer(result["hospital"], context={"request": request}).data
        payload["requiresApproval"] = bool(result.get("requires_approval", False))
        payload["status"] = result.get("status", "Applied")
        payload["message"] = result.get("message", "Changes applied successfully")
        if result["update_request"] is not None:
            payload["pending_update_request"] = HospitalUpdateRequestSerializer(
                result["update_request"]
            ).data
        return Response(success_response(data=payload))

    @action(
        detail=False,
        methods=["post", "delete"],
        url_path="my-hospital/profile-picture",
        permission_classes=[IsHospitalAdmin],
        parser_classes=[MultiPartParser, FormParser],
    )
    def my_hospital_profile_picture(self, request):
        hospital_id = request.user.get_hospital_id()
        if not hospital_id:
            raise PermissionDenied("No hospital is associated with your account.")

        hospital = Hospital.objects.get(id=hospital_id)

        if request.method == "DELETE":
            if hospital.logo:
                hospital.logo.delete(save=False)
            hospital.logo = None
            hospital.save(update_fields=["logo", "updated_at"])
            return Response(
                success_response(
                    data=HospitalSerializer(hospital, context={"request": request}).data
                )
            )

        serializer = HospitalProfilePictureUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hospital.logo = serializer.validated_data["logo"]
        hospital.save(update_fields=["logo", "updated_at"])
        return Response(
            success_response(
                data=HospitalSerializer(hospital, context={"request": request}).data
            )
        )

    @action(detail=False, methods=["get"], url_path="map", permission_classes=[IsAuthenticated])
    def map_data(self, request):
        hospitals = Hospital.objects.exclude(latitude__isnull=True).exclude(longitude__isnull=True)
        return Response(
            success_response(
                data=HospitalMapSerializer(hospitals, many=True, context={"request": request}).data
            )
        )

    @action(detail=True, methods=["post"], permission_classes=[IsSuperAdmin])
    def verify(self, request, pk=None):
        hospital = self.get_object()
        updated = verify_hospital(hospital, request.user)
        return Response(success_response(data=HospitalSerializer(updated, context={"request": request}).data))

    @action(detail=True, methods=["post"], url_path="suspend", permission_classes=[IsSuperAdmin])
    def suspend_action(self, request, pk=None):
        hospital = self.get_object()
        updated = suspend_hospital(hospital, request.user)
        return Response(success_response(data=HospitalSerializer(updated, context={"request": request}).data))

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
        return Response(success_response(data=StaffSerializer(qs, many=True, context={"request": request}).data))

    @action(
        detail=True,
        methods=["post"],
        url_path="offboarding-request",
        permission_classes=[IsAuthenticated],
    )
    def offboarding_request(self, request, pk=None):
        hospital = self.get_object()

        if not CanRequestHospitalOffboarding().has_permission(request, self):
            raise PermissionDenied("You do not have permission to request hospital offboarding.")

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

    @action(
        detail=True,
        methods=["post"],
        url_path="admin-offboard",
        permission_classes=[IsSuperAdmin],
    )
    def admin_offboard(self, request, pk=None):
        hospital = self.get_object()
        serializer = AdminHospitalDirectOffboardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        offboarding_request = offboard_hospital_direct(
            hospital=hospital,
            actor=request.user,
            reason=serializer.validated_data.get("reason", ""),
            admin_notes=serializer.validated_data.get("admin_notes", ""),
        )
        return Response(success_response(data=HospitalOffboardingRequestSerializer(offboarding_request).data))


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
    permission_classes = [IsAuthenticated]

    def _is_platform_integration_operator(self) -> bool:
        return is_platform_operator(self.request.user, allow_role_fallback=True)

    def _ensure_integration_access(self, *, manage: bool) -> None:
        if self._is_platform_integration_operator():
            return

        if IsHospitalAdmin().has_permission(self.request, self):
            return

        action_label = "manage" if manage else "view"
        raise PermissionDenied(f"You do not have permission to {action_label} integrations.")

    def get_queryset(self):
        manage_actions = {"create", "update", "partial_update", "destroy", "trigger_sync"}
        current_action = str(getattr(self, "action", "")).strip().lower()
        self._ensure_integration_access(manage=current_action in manage_actions)

        if self._is_platform_integration_operator():
            queryset = HospitalAPIConfig.objects.all().order_by("-created_at")
            requested_hospital_id = (
                self.request.query_params.get("hospital_id")
                or self.request.query_params.get("hospital")
            )
            if requested_hospital_id:
                queryset = queryset.filter(hospital_id=requested_hospital_id)
            return queryset

        hospital_id = self.request.user.get_hospital_id()
        return HospitalAPIConfig.objects.filter(hospital_id=hospital_id).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        self._ensure_integration_access(manage=True)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        if self._is_platform_integration_operator():
            requested_hospital_id = self.request.data.get("hospital") or self.request.data.get("hospital_id")
            if not requested_hospital_id:
                raise ValidationError(
                    {
                        "hospital": (
                            "This field is required for platform-level integration management."
                        )
                    }
                )
            serializer.save(hospital_id=requested_hospital_id)
            return

        serializer.save(hospital_id=self.request.user.get_hospital_id())

    @action(detail=True, methods=["post"], url_path="sync")
    def trigger_sync(self, request, pk=None):
        config = self.get_object()
        from apps.hospitals.tasks import sync_hospital_data_task  # noqa: PLC0415

        sync_hospital_data_task.delay(str(config.hospital_id))
        return Response(success_response(data={"detail": "Hospital data sync queued."}))
