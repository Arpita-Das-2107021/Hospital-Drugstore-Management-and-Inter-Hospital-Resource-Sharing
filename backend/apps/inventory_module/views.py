"""Inventory module API views."""
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services.llm_service import LLMServiceError
from common.permissions.base import IsHospitalAdmin, IsVerifiedHospital
from common.permissions.runtime import has_any_permission, is_platform_operator
from common.utils.response import error_response
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .chat_service import create_csv_chat_session, generate_csv_error_chat_reply, send_csv_chat_message
from .models import InventoryCSVChatSession, InventoryCSVValidationContext, InventoryImportJob
from .serializers import (
    InventoryCSVChatMessageCreateSerializer,
    InventoryCSVChatMessageSerializer,
    InventoryCSVChatSessionCreateSerializer,
    InventoryCSVChatSessionSerializer,
    InventoryCSVChatSerializer,
    InventoryCSVCommitSerializer,
    InventoryCSVDiscountCommitSerializer,
    InventoryCSVValidateSerializer,
    InventoryImportErrorSerializer,
    InventoryImportJobSerializer,
    QuickInventoryUpdateSerializer,
)
from .services import (
    commit_inventory_discount_csv_import,
    commit_inventory_csv_import,
    extract_csv_sample_rows,
    get_inventory_gateway,
    import_job_snapshot,
    parse_inventory_csv,
)


class _InventoryHospitalContextMixin:
    def _get_hospital(self, request):
        if not has_any_permission(
            request.user,
            ("hospital:inventory.import", "hospital:inventory.manage"),
            allow_role_fallback=True,
            legacy_roles=("HEALTHCARE_ADMIN", "SUPER_ADMIN", "PLATFORM_ADMIN"),
        ):
            raise PermissionDenied("You do not have permission to manage inventory CSV imports.")

        if hasattr(request.user, "staff") and request.user.staff:
            return request.user.staff.hospital

        if is_platform_operator(request.user, allow_role_fallback=True):
            hospital_id = (
                request.data.get("hospital_id")
                if hasattr(request, "data")
                else request.query_params.get("hospital_id")
            ) or request.query_params.get("hospital_id")
            if not hospital_id:
                raise ValidationError({"hospital_id": "hospital_id is required for SUPER_ADMIN context."})

            from apps.hospitals.models import Hospital

            return get_object_or_404(Hospital, id=hospital_id)

        raise PermissionDenied("No hospital context is associated with your account.")

    def _ensure_same_hospital(self, request, facility_id):
        if is_platform_operator(request.user, allow_role_fallback=True):
            return

        hospital = self._get_hospital(request)
        if str(hospital.id) != str(facility_id):
            raise PermissionDenied("You can only access CSV chat resources for your own hospital.")


class QuickInventoryUpdateAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]

    def post(self, request):
        serializer = QuickInventoryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hospital = self._get_hospital(request)
        gateway = get_inventory_gateway()
        result = gateway.quick_update(
            facility_id=hospital.id,
            name=serializer.validated_data["name"],
            quantity=serializer.validated_data["quantity"],
            price=serializer.validated_data.get("price"),
            actor=request.user,
        )
        return Response(success_response(data=result), status=status.HTTP_200_OK)


class InventoryCSVValidateAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = InventoryCSVValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hospital = self._get_hospital(request)
        file_bytes = serializer.validated_data["file"].read()
        requested_language = serializer.validated_data.get("language", "en")
        parsed = parse_inventory_csv(file_bytes)
        sample_rows = extract_csv_sample_rows(
            file_bytes,
            limit=settings.INVENTORY_CSV_CHAT_SAMPLE_ROW_LIMIT,
        )
        validation_context = InventoryCSVValidationContext.objects.create(
            facility=hospital,
            file_hash=parsed["file_hash"],
            language=requested_language,
            expected_schema=list(settings.INVENTORY_CSV_EXPECTED_SCHEMA),
            errors=parsed["errors"],
            sample_rows=sample_rows,
            created_by=request.user,
        )

        payload = {
            "file_id": str(validation_context.file_id),
            "file_hash": parsed["file_hash"],
            "language": requested_language,
            "total_rows": parsed["total_rows"],
            "valid_rows": len(parsed["rows"]),
            "error_rows": len(parsed["errors"]),
            "row_errors": parsed["errors"],
        }
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class InventoryCSVChatAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]

    def post(self, request):
        serializer = InventoryCSVChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validation_context = get_object_or_404(
            InventoryCSVValidationContext,
            file_id=serializer.validated_data["file_id"],
        )

        if not is_platform_operator(request.user, allow_role_fallback=True):
            hospital = self._get_hospital(request)
            if str(validation_context.facility_id) != str(hospital.id):
                raise PermissionDenied("You can only chat about validation files from your own hospital.")

        language = serializer.validated_data.get("language") or validation_context.language or "en"

        try:
            payload = generate_csv_error_chat_reply(
                validation_context=validation_context,
                user_query=serializer.validated_data["query"],
                language=language,
            )
        except LLMServiceError as exc:
            return Response(
                error_response(
                    code="ai_service_error",
                    message="Failed to generate CSV error explanation.",
                    details={"detail": str(exc)},
                ),
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class InventoryCSVChatSessionCreateAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]

    def post(self, request):
        serializer = InventoryCSVChatSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validation_context = get_object_or_404(
            InventoryCSVValidationContext,
            file_id=serializer.validated_data["file_id"],
        )
        self._ensure_same_hospital(request, validation_context.facility_id)

        session = create_csv_chat_session(
            validation_context=validation_context,
            actor=request.user,
            language=serializer.validated_data.get("language", "en"),
        )
        payload = InventoryCSVChatSessionSerializer(session).data
        payload["file_id"] = str(validation_context.file_id)
        return Response(success_response(data=payload), status=status.HTTP_201_CREATED)


class InventoryCSVChatSessionMessagesAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def _get_session(self, request, session_id):
        session = get_object_or_404(InventoryCSVChatSession, id=session_id)
        self._ensure_same_hospital(request, session.facility_id)
        return session

    def get(self, request, session_id):
        session = self._get_session(request, session_id)
        qs = session.messages.all().order_by("created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        data = InventoryCSVChatMessageSerializer(page, many=True).data
        return paginator.get_paginated_response(data)

    def post(self, request, session_id):
        session = self._get_session(request, session_id)
        serializer = InventoryCSVChatMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = send_csv_chat_message(
            session=session,
            user_query=serializer.validated_data["query"],
            actor=request.user,
            language=serializer.validated_data.get("language") or session.language,
        )
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class InventoryCSVCommitAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = InventoryCSVCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hospital = self._get_hospital(request)
        file_bytes = serializer.validated_data["file"].read()

        job, idempotent = commit_inventory_csv_import(
            facility=hospital,
            file_bytes=file_bytes,
            mode=serializer.validated_data["mode"],
            confirm_full_replace=serializer.validated_data.get("confirm_full_replace", False),
            idempotency_key=serializer.validated_data.get("idempotency_key", ""),
            actor=request.user,
        )

        payload = import_job_snapshot(job)
        payload["idempotent"] = idempotent
        status_code = status.HTTP_200_OK if idempotent else status.HTTP_201_CREATED
        return Response(success_response(data=payload), status=status_code)


class InventoryCSVDiscountCommitAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = InventoryCSVDiscountCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hospital = self._get_hospital(request)
        file_bytes = serializer.validated_data["file"].read()

        payload = commit_inventory_discount_csv_import(
            facility=hospital,
            file_bytes=file_bytes,
            actor=request.user,
        )
        status_code = status.HTTP_201_CREATED if payload.get("status") == InventoryImportJob.Status.APPLIED else status.HTTP_200_OK
        return Response(success_response(data=payload), status=status_code)


class InventoryImportJobDetailAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]

    def get(self, request, job_id):
        job = get_object_or_404(InventoryImportJob, id=job_id)

        if not is_platform_operator(request.user, allow_role_fallback=True):
            hospital = self._get_hospital(request)
            if str(job.facility_id) != str(hospital.id):
                raise PermissionDenied("You can only access import jobs for your own hospital.")

        return Response(success_response(data=InventoryImportJobSerializer(job).data), status=status.HTTP_200_OK)


class InventoryImportJobErrorsAPIView(_InventoryHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get(self, request, job_id):
        job = get_object_or_404(InventoryImportJob, id=job_id)

        if not is_platform_operator(request.user, allow_role_fallback=True):
            hospital = self._get_hospital(request)
            if str(job.facility_id) != str(hospital.id):
                raise PermissionDenied("You can only access import jobs for your own hospital.")

        errors_qs = job.errors.all().order_by("row_number", "created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(errors_qs, request)
        data = InventoryImportErrorSerializer(page, many=True).data
        return paginator.get_paginated_response(data)
