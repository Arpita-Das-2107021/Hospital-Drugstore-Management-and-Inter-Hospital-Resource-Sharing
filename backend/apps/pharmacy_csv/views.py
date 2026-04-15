"""Pharmacy CSV ingestion API views."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import IsHospitalAdmin, IsVerifiedHospital
from common.permissions.runtime import has_any_permission, is_platform_operator
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .chat_service import create_csv_chat_session, send_csv_chat_message
from .models import PharmacyCSVImportJob
from .serializers import (
    PharmacyCSVChatMessageCreateSerializer,
    PharmacyCSVChatMessageSerializer,
    PharmacyCSVChatSessionCreateSerializer,
    PharmacyCSVChatSessionSerializer,
    PharmacyCSVCommitSerializer,
    PharmacyCSVImportConflictSerializer,
    PharmacyCSVImportErrorSerializer,
    PharmacyCSVImportJobSerializer,
    PharmacyCSVValidateSerializer,
)
from .services import (
    DATASET_MOVEMENT,
    DATASET_SALES,
    DATASET_STAFF,
    commit_pharmacy_csv_upload,
    import_job_snapshot,
    validate_pharmacy_csv_upload,
)


class _PharmacyCSVHospitalContextMixin:
    def _get_hospital(self, request):
        if not has_any_permission(
            request.user,
            ("hospital:inventory.import", "hospital:inventory.manage"),
            allow_role_fallback=True,
            legacy_roles=("HEALTHCARE_ADMIN", "SUPER_ADMIN", "PLATFORM_ADMIN"),
        ):
            raise PermissionDenied("You do not have permission to manage pharmacy CSV imports.")

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


class _BaseDatasetValidateAPIView(_PharmacyCSVHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    parser_classes = [MultiPartParser, FormParser]
    dataset_type = ""

    def post(self, request):
        serializer = PharmacyCSVValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hospital = self._get_hospital(request)
        file_bytes = serializer.validated_data["file"].read()

        payload = validate_pharmacy_csv_upload(
            facility=hospital,
            dataset_type=self.dataset_type,
            file_bytes=file_bytes,
            conflict_policy=serializer.validated_data["conflict_policy"],
            locked_period_policy=serializer.validated_data["locked_period_policy"],
            actor=request.user,
            default_movement_mode=serializer.validated_data.get("default_movement_mode", "DELTA"),
        )
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class _BaseDatasetCommitAPIView(_PharmacyCSVHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    parser_classes = [MultiPartParser, FormParser]
    dataset_type = ""

    def post(self, request):
        serializer = PharmacyCSVCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hospital = self._get_hospital(request)
        file_bytes = serializer.validated_data["file"].read()

        job, idempotent = commit_pharmacy_csv_upload(
            facility=hospital,
            dataset_type=self.dataset_type,
            file_bytes=file_bytes,
            conflict_policy=serializer.validated_data["conflict_policy"],
            locked_period_policy=serializer.validated_data["locked_period_policy"],
            confirm_conflicts=serializer.validated_data.get("confirm_conflicts", False),
            idempotency_key=serializer.validated_data.get("idempotency_key", ""),
            actor=request.user,
            default_movement_mode=serializer.validated_data.get("default_movement_mode", "DELTA"),
        )

        payload = import_job_snapshot(job)
        payload["idempotent"] = idempotent
        status_code = status.HTTP_200_OK if idempotent else status.HTTP_201_CREATED
        return Response(success_response(data=payload), status=status_code)


class SalesCSVValidateAPIView(_BaseDatasetValidateAPIView):
    dataset_type = DATASET_SALES


class SalesCSVCommitAPIView(_BaseDatasetCommitAPIView):
    dataset_type = DATASET_SALES


class StaffCSVValidateAPIView(_BaseDatasetValidateAPIView):
    dataset_type = DATASET_STAFF


class StaffCSVCommitAPIView(_BaseDatasetCommitAPIView):
    dataset_type = DATASET_STAFF


class MovementCSVValidateAPIView(_BaseDatasetValidateAPIView):
    dataset_type = DATASET_MOVEMENT


class MovementCSVCommitAPIView(_BaseDatasetCommitAPIView):
    dataset_type = DATASET_MOVEMENT


class PharmacyCSVImportJobDetailAPIView(_PharmacyCSVHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]

    def get(self, request, job_id):
        job = get_object_or_404(PharmacyCSVImportJob, id=job_id)

        if not is_platform_operator(request.user, allow_role_fallback=True):
            hospital = self._get_hospital(request)
            if str(job.facility_id) != str(hospital.id):
                raise PermissionDenied("You can only access import jobs for your own hospital.")

        return Response(success_response(data=PharmacyCSVImportJobSerializer(job).data), status=status.HTTP_200_OK)


class PharmacyCSVImportJobErrorsAPIView(_PharmacyCSVHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get(self, request, job_id):
        job = get_object_or_404(PharmacyCSVImportJob, id=job_id)

        if not is_platform_operator(request.user, allow_role_fallback=True):
            hospital = self._get_hospital(request)
            if str(job.facility_id) != str(hospital.id):
                raise PermissionDenied("You can only access import jobs for your own hospital.")

        errors_qs = job.errors.all().order_by("row_number", "created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(errors_qs, request)
        data = PharmacyCSVImportErrorSerializer(page, many=True).data
        return paginator.get_paginated_response(data)


class PharmacyCSVImportJobConflictsAPIView(_PharmacyCSVHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get(self, request, job_id):
        job = get_object_or_404(PharmacyCSVImportJob, id=job_id)

        if not is_platform_operator(request.user, allow_role_fallback=True):
            hospital = self._get_hospital(request)
            if str(job.facility_id) != str(hospital.id):
                raise PermissionDenied("You can only access import jobs for your own hospital.")

        conflicts_qs = job.conflicts.all().order_by("row_number", "created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(conflicts_qs, request)
        data = PharmacyCSVImportConflictSerializer(page, many=True).data
        return paginator.get_paginated_response(data)


class PharmacyCSVChatSessionCreateAPIView(_PharmacyCSVHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]

    def post(self, request):
        serializer = PharmacyCSVChatSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .models import PharmacyCSVValidationContext

        validation_context = get_object_or_404(
            PharmacyCSVValidationContext,
            file_id=serializer.validated_data["file_id"],
        )
        self._ensure_same_hospital(request, validation_context.facility_id)

        session = create_csv_chat_session(
            validation_context=validation_context,
            actor=request.user,
            language=serializer.validated_data.get("language", "en"),
        )
        payload = PharmacyCSVChatSessionSerializer(session).data
        payload["file_id"] = str(validation_context.file_id)
        return Response(success_response(data=payload), status=status.HTTP_201_CREATED)


class PharmacyCSVChatSessionMessagesAPIView(_PharmacyCSVHospitalContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsHospitalAdmin, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def _get_session(self, request, session_id):
        from .models import PharmacyCSVChatSession

        session = get_object_or_404(PharmacyCSVChatSession, id=session_id)
        self._ensure_same_hospital(request, session.facility_id)
        return session

    def get(self, request, session_id):
        session = self._get_session(request, session_id)
        qs = session.messages.all().order_by("created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        data = PharmacyCSVChatMessageSerializer(page, many=True).data
        return paginator.get_paginated_response(data)

    def post(self, request, session_id):
        session = self._get_session(request, session_id)
        serializer = PharmacyCSVChatMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = send_csv_chat_message(
            session=session,
            user_query=serializer.validated_data["query"],
            actor=request.user,
            language=serializer.validated_data.get("language") or session.language,
        )
        return Response(success_response(data=payload), status=status.HTTP_200_OK)
