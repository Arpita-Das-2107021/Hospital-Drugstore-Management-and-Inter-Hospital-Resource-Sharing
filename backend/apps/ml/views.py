"""Views for ML orchestration APIs."""
import uuid

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import (
    CanManageMLModelVersions,
    CanManageMLOperations,
    CanManageMLTrainingLifecycle,
    CanViewMLForecast,
    CanViewMLJobs,
    CanViewMLOutbreak,
    CanViewMLSuggestions,
)

from .inference_services import create_json_inference_job

from .serializers import (
    FacilityMLSettingPatchSerializer,
    FacilityMLSettingSerializer,
    MLJobCancelSerializer,
    MLJobCreateSerializer,
    MLJobEventSerializer,
    MLModelVersionReviewSerializer,
    MLModelVersionRollbackSerializer,
    MLJobRetrySerializer,
    MLScheduleCreateSerializer,
    MLScheduleSerializer,
    MLScheduleUpdateSerializer,
    MLTrainingCallbackSerializer,
    MLTrainingDatasetGenerateSerializer,
    MLTrainingDatasetReviewSerializer,
    MLTrainingJobCreateSerializer,
    Model1PredictSerializer,
    Model2PredictSerializer,
    ServerBCallbackSerializer,
)
from .services import (
    cancel_ml_job,
    create_ml_job,
    create_schedule,
    get_forecast_results,
    get_latest_forecast_for_facility,
    get_latest_outbreak_for_facility,
    get_ml_job,
    get_outbreak_results,
    get_request_suggestions,
    get_schedule,
    list_job_events,
    list_ml_jobs,
    list_schedules,
    process_server_b_callback,
    retry_ml_job,
    serialize_job,
    set_schedule_active,
    update_facility_settings,
    update_schedule,
)
from .training_services import (
    activate_model_version,
    create_training_dataset_snapshot,
    create_training_job,
    deactivate_model_version,
    get_model_version,
    get_training_dataset_snapshot,
    get_training_job,
    list_active_model_configs,
    list_model_versions,
    list_training_dataset_snapshots,
    list_training_jobs,
    mark_model_version_approved,
    mark_model_version_reviewed,
    process_training_callback,
    review_training_dataset_snapshot,
    rollback_active_model_version,
)


def _request_id(request) -> str:
    return request.headers.get("X-Request-Id") or str(uuid.uuid4())


def _success_response(request, data, *, status_code=status.HTTP_200_OK, meta=None):
    payload = {
        "success": True,
        "data": data,
        "meta": {"request_id": _request_id(request)},
    }
    if meta:
        payload["meta"].update(meta)
    return Response(payload, status=status_code)


class MLJobCollectionView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request):
        serializer = MLJobCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = create_ml_job(
            actor=request.user,
            validated_data=serializer.validated_data,
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)

    def get(self, request):
        jobs, page, limit, total = list_ml_jobs(request.user, request.query_params)
        data = {
            "items": [serialize_job(job) for job in jobs],
        }
        return _success_response(
            request,
            data,
            meta={
                "page": page,
                "limit": limit,
                "total": total,
            },
        )


class MLJobDetailView(APIView):
    permission_classes = [IsAuthenticated, CanViewMLJobs]

    def get(self, request, job_id):
        job = get_ml_job(job_id, request.user)
        return _success_response(request, {"job": serialize_job(job)})


class MLJobRetryView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request, job_id):
        job = get_ml_job(job_id, request.user)
        serializer = MLJobRetrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = retry_ml_job(
            job=job,
            actor=request.user,
            reason=serializer.validated_data.get("reason", ""),
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)


class MLJobCancelView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request, job_id):
        job = get_ml_job(job_id, request.user)
        serializer = MLJobCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = cancel_ml_job(
            job=job,
            actor=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)


class MLJobEventsView(APIView):
    permission_classes = [IsAuthenticated, CanViewMLJobs]

    def get(self, request, job_id):
        job = get_ml_job(job_id, request.user)
        events = list_job_events(job, request.user)
        return _success_response(request, {"items": MLJobEventSerializer(events, many=True).data})


class MLScheduleCollectionView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request):
        serializer = MLScheduleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = create_schedule(request.user, serializer.validated_data)
        return _success_response(
            request,
            {"schedule": MLScheduleSerializer(schedule).data},
            status_code=status.HTTP_201_CREATED,
        )

    def get(self, request):
        schedules = list_schedules(request.user, request.query_params)
        return _success_response(request, {"items": MLScheduleSerializer(schedules, many=True).data})


class MLScheduleDetailView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def patch(self, request, schedule_id):
        schedule = get_schedule(schedule_id, request.user)
        serializer = MLScheduleUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_schedule(schedule, request.user, serializer.validated_data)
        return _success_response(request, {"schedule": MLScheduleSerializer(updated).data})


class MLScheduleActivateView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request, schedule_id):
        schedule = get_schedule(schedule_id, request.user)
        updated = set_schedule_active(schedule, request.user, is_active=True)
        return _success_response(request, {"schedule": MLScheduleSerializer(updated).data})


class MLScheduleDeactivateView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request, schedule_id):
        schedule = get_schedule(schedule_id, request.user)
        updated = set_schedule_active(schedule, request.user, is_active=False)
        return _success_response(request, {"schedule": MLScheduleSerializer(updated).data})


class MLForecastResultView(APIView):
    permission_classes = [IsAuthenticated, CanViewMLForecast]

    def get(self, request, job_id):
        job = get_ml_job(job_id, request.user)
        data = get_forecast_results(job, request.user)
        return _success_response(request, data)


class MLOutbreakResultView(APIView):
    permission_classes = [IsAuthenticated, CanViewMLOutbreak]

    def get(self, request, job_id):
        job = get_ml_job(job_id, request.user)
        data = get_outbreak_results(job, request.user)
        return _success_response(request, data)


class LatestForecastFacilityView(APIView):
    permission_classes = [IsAuthenticated, CanViewMLForecast]

    def get(self, request, facility_id):
        data = get_latest_forecast_for_facility(request.user, facility_id)
        return _success_response(request, data)


class LatestOutbreakFacilityView(APIView):
    permission_classes = [IsAuthenticated, CanViewMLOutbreak]

    def get(self, request, facility_id):
        data = get_latest_outbreak_for_facility(request.user, facility_id)
        return _success_response(request, data)


class RequestSuggestionFacilityView(APIView):
    permission_classes = [IsAuthenticated, CanViewMLSuggestions]

    def get(self, request, facility_id):
        data = get_request_suggestions(request.user, facility_id)
        return _success_response(request, data)


class FacilitySettingsPatchView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def patch(self, request, facility_id):
        serializer = FacilityMLSettingPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        setting = update_facility_settings(request.user, facility_id, serializer.validated_data)
        return _success_response(request, {"setting": FacilityMLSettingSerializer(setting).data})


class Model1PredictView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request):
        serializer = Model1PredictSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = create_json_inference_job(
            request.user,
            model_key="model1",
            validated_data=serializer.validated_data,
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)


class Model2PredictView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLOperations]

    def post(self, request):
        serializer = Model2PredictSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = create_json_inference_job(
            request.user,
            model_key="model2",
            validated_data=serializer.validated_data,
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)


class MLTrainingDatasetGenerateView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def post(self, request):
        serializer = MLTrainingDatasetGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = create_training_dataset_snapshot(request.user, serializer.validated_data)
        return _success_response(request, data, status_code=status.HTTP_201_CREATED)


class MLTrainingDatasetCollectionView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def get(self, request):
        items = list_training_dataset_snapshots(request.user, request.query_params)
        return _success_response(request, {"items": items})


class MLTrainingDatasetDetailView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def get(self, request, dataset_id):
        data = get_training_dataset_snapshot(request.user, dataset_id)
        return _success_response(request, data)


class MLTrainingDatasetApproveView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def post(self, request, dataset_id):
        serializer = MLTrainingDatasetReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = review_training_dataset_snapshot(
            request.user,
            dataset_id,
            approve=True,
            notes=serializer.validated_data.get("notes", ""),
        )
        return _success_response(request, data)


class MLTrainingDatasetRejectView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def post(self, request, dataset_id):
        serializer = MLTrainingDatasetReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = review_training_dataset_snapshot(
            request.user,
            dataset_id,
            approve=False,
            notes=serializer.validated_data.get("notes", ""),
        )
        return _success_response(request, data)


class MLTrainingJobCollectionView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def post(self, request):
        serializer = MLTrainingJobCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = create_training_job(
            request.user,
            serializer.validated_data,
            request.headers.get("Idempotency-Key", ""),
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)

    def get(self, request):
        items = list_training_jobs(request.user, request.query_params)
        return _success_response(request, {"items": items})


class MLTrainingJobDetailView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def get(self, request, training_job_id):
        data = get_training_job(request.user, training_job_id)
        return _success_response(request, data)


class MLModelVersionCollectionView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def get(self, request):
        items = list_model_versions(request.user, request.query_params)
        return _success_response(request, {"items": items})


class MLModelVersionDetailView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def get(self, request, version_id):
        data = get_model_version(request.user, version_id)
        return _success_response(request, data)


class MLModelVersionReviewView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def post(self, request, version_id):
        serializer = MLModelVersionReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = mark_model_version_reviewed(request.user, version_id, serializer.validated_data.get("notes", ""))
        return _success_response(request, data)


class MLModelVersionApproveView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLModelVersions]

    def post(self, request, version_id):
        serializer = MLModelVersionReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = mark_model_version_approved(request.user, version_id, serializer.validated_data.get("notes", ""))
        return _success_response(request, data)


class MLModelVersionActivateView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLModelVersions]

    def post(self, request, version_id):
        data = activate_model_version(request.user, version_id)
        return _success_response(request, data)


class MLModelVersionDeactivateView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLModelVersions]

    def post(self, request, version_id):
        data = deactivate_model_version(request.user, version_id)
        return _success_response(request, data)


class MLModelVersionRollbackView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLModelVersions]

    def post(self, request, version_id):
        serializer = MLModelVersionRollbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = rollback_active_model_version(
            request.user,
            version_id,
            serializer.validated_data["target_version_id"],
        )
        return _success_response(request, data)


class ActiveModelConfigView(APIView):
    permission_classes = [IsAuthenticated, CanManageMLTrainingLifecycle]

    def get(self, request):
        items = list_active_model_configs(request.user)
        return _success_response(request, {"items": items})


class ServerBTrainingCallbackView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_payload = request.body.decode("utf-8", errors="ignore")
        serializer = MLTrainingCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = process_training_callback(
            serializer.validated_data,
            request.headers,
            signature_payload=raw_payload,
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)


class ServerBCallbackView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_payload = request.body.decode("utf-8", errors="ignore")
        serializer = ServerBCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = process_server_b_callback(
            serializer.validated_data,
            request.headers,
            signature_payload=raw_payload,
        )
        return _success_response(request, data, status_code=status.HTTP_202_ACCEPTED)
