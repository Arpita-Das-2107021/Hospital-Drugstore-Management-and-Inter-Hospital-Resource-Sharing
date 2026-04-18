from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, status

from app_forecast.config import settings as forecast_settings
from app_forecast.routes import router as forecast_router
from app_forecast.services.ml_service import MLService
from app_forecast.utils import ForecastJobOrchestrator, configure_logging
from app_outbreak.config import settings as outbreak_settings
from app_outbreak.routes import router as outbreak_router
from app_outbreak.services.ml_service import OutbreakMLService
from app_outbreak.utils import OutbreakJobOrchestrator
from shared.schemas import (
    ActivateVersionRequest,
    JobAcceptedResponse,
    JobStatusResponse,
    Model1InferenceRequest,
    Model1TrainingRequest,
    Model2InferenceRequest,
    Model2TrainingRequest,
    RollbackVersionRequest,
)
from shared.services.callback_service import CallbackService
from shared.services.error_handlers import register_validation_error_handler
from shared.services.job_status_service import JobStatusService
from shared.services.model_registry_service import ModelRegistryService
from shared.services.minio_service import MinIOService

configure_logging()

app = FastAPI(
    title="HRSP Server B Multi-Model API",
    version="1.0.0",
    description="Combined API serving forecast and outbreak models.",
)

forecast_ml_service = MLService(
    base_data_dir=Path(forecast_settings.base_data_dir),
    test_days=forecast_settings.test_days,
)
forecast_minio_service = MinIOService(
    endpoint=forecast_settings.minio_endpoint,
    access_key=forecast_settings.minio_access_key,
    secret_key=forecast_settings.minio_secret_key,
    secure=forecast_settings.minio_secure,
    results_bucket=forecast_settings.minio_results_bucket,
)
forecast_callback_service = CallbackService(
    timeout_seconds=forecast_settings.callback_timeout_seconds,
    max_retries=forecast_settings.callback_max_retries,
)

outbreak_ml_service = OutbreakMLService(
    base_data_dir=Path(outbreak_settings.base_data_dir),
    model_path=outbreak_settings.outbreak_model_path,
    graph_radius_km=outbreak_settings.graph_radius,
    sequence_length=outbreak_settings.sequence_length,
)
outbreak_minio_service = MinIOService(
    endpoint=outbreak_settings.minio_endpoint,
    access_key=outbreak_settings.minio_access_key,
    secret_key=outbreak_settings.minio_secret_key,
    secure=outbreak_settings.minio_secure,
    results_bucket=outbreak_settings.minio_outbreak_bucket,
)
outbreak_callback_service = CallbackService(
    timeout_seconds=outbreak_settings.callback_timeout_seconds,
    max_retries=outbreak_settings.callback_max_retries,
)

model_registry_service = ModelRegistryService(
    registry_path=Path("model_registry") / "registry.json",
    model2_default_artifact=outbreak_settings.outbreak_model_path,
)
job_status_service = JobStatusService()

app.state.forecast_orchestrator = ForecastJobOrchestrator(
    ml_service=forecast_ml_service,
    minio_service=forecast_minio_service,
    callback_service=forecast_callback_service,
    job_status_service=job_status_service,
    model_registry_service=model_registry_service,
)
app.state.outbreak_orchestrator = OutbreakJobOrchestrator(
    ml_service=outbreak_ml_service,
    minio_service=outbreak_minio_service,
    callback_service=outbreak_callback_service,
    job_status_service=job_status_service,
    model_registry_service=model_registry_service,
)
app.state.model_registry_service = model_registry_service
app.state.job_status_service = job_status_service

app.include_router(forecast_router)
app.include_router(outbreak_router)
register_validation_error_handler(app)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "models": ["forecast", "outbreak"],
    }


@app.post(
    "/api/v1/inference/model1/predict",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_model1_json_inference(
    request_body: Model1InferenceRequest,
    background_tasks: BackgroundTasks,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> JobAcceptedResponse:
    external_job_id = f"srvb-forecast-{request_body.job_id}"
    app.state.job_status_service.create_job(
        job_id=request_body.job_id,
        external_job_id=external_job_id,
        job_type="forecast",
        model_type="model1",
        request_id=request_id,
        metadata={
            "idempotency_key": idempotency_key,
            "workflow": "json_inference",
        },
    )

    background_tasks.add_task(
        app.state.forecast_orchestrator.process_forecast_inference_job,
        request_body,
        external_job_id,
    )

    return JobAcceptedResponse(
        job_id=request_body.job_id,
        job_type="forecast",
        external_job_id=external_job_id,
        status="pending",
    )


@app.post(
    "/api/v1/inference/model2/predict",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_model2_json_inference(
    request_body: Model2InferenceRequest,
    background_tasks: BackgroundTasks,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> JobAcceptedResponse:
    external_job_id = f"srvb-outbreak-{request_body.job_id}"
    app.state.job_status_service.create_job(
        job_id=request_body.job_id,
        external_job_id=external_job_id,
        job_type="outbreak",
        model_type="model2",
        request_id=request_id,
        metadata={
            "idempotency_key": idempotency_key,
            "workflow": "json_inference",
        },
    )

    background_tasks.add_task(
        app.state.outbreak_orchestrator.process_outbreak_inference_job,
        request_body,
        external_job_id,
    )

    return JobAcceptedResponse(
        job_id=request_body.job_id,
        job_type="outbreak",
        external_job_id=external_job_id,
        status="pending",
    )


@app.post(
    "/api/v1/training/model1/train",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_model1_training(
    request_body: Model1TrainingRequest,
    background_tasks: BackgroundTasks,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> JobAcceptedResponse:
    external_job_id = f"srvb-training-model1-{request_body.job_id}"
    app.state.job_status_service.create_job(
        job_id=request_body.job_id,
        external_job_id=external_job_id,
        job_type="forecast_training",
        model_type="model1",
        request_id=request_id,
        metadata={
            "idempotency_key": idempotency_key,
            "workflow": "training",
            "requested_version_label": request_body.requested_version_label,
        },
    )

    background_tasks.add_task(
        app.state.forecast_orchestrator.process_forecast_training_job,
        request_body,
        external_job_id,
    )

    return JobAcceptedResponse(
        job_id=request_body.job_id,
        job_type="forecast_training",
        external_job_id=external_job_id,
        status="pending",
    )


@app.post(
    "/api/v1/training/model2/train",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_model2_training(
    request_body: Model2TrainingRequest,
    background_tasks: BackgroundTasks,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> JobAcceptedResponse:
    external_job_id = f"srvb-training-model2-{request_body.job_id}"
    app.state.job_status_service.create_job(
        job_id=request_body.job_id,
        external_job_id=external_job_id,
        job_type="outbreak_training",
        model_type="model2",
        request_id=request_id,
        metadata={
            "idempotency_key": idempotency_key,
            "workflow": "training",
            "requested_version_label": request_body.requested_version_label,
        },
    )

    background_tasks.add_task(
        app.state.outbreak_orchestrator.process_outbreak_training_job,
        request_body,
        external_job_id,
    )

    return JobAcceptedResponse(
        job_id=request_body.job_id,
        job_type="outbreak_training",
        external_job_id=external_job_id,
        status="pending",
    )


@app.get("/api/v1/ml/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str) -> JobStatusResponse:
    job = app.state.job_status_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(**job)


@app.get("/api/v1/models/")
def list_models() -> dict:
    return {"models": app.state.model_registry_service.list_models()}


@app.get("/api/v1/models/{model_type}/versions")
def list_model_versions(model_type: str) -> dict:
    try:
        versions = app.state.model_registry_service.list_versions(model_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    active_version = None
    for model_summary in app.state.model_registry_service.list_models():
        if model_summary["model_type"] == model_type:
            active_version = model_summary.get("active_version")
            break

    return {
        "model_type": model_type,
        "active_version": active_version,
        "versions": versions,
    }


@app.post("/api/v1/models/{model_type}/activate")
def activate_model_version(model_type: str, request_body: ActivateVersionRequest) -> dict:
    try:
        entry = app.state.model_registry_service.activate_version(model_type, request_body.version)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "model_type": model_type,
        "active_version": entry.get("version"),
        "entry": entry,
    }


@app.post("/api/v1/models/{model_type}/rollback")
def rollback_model_version(model_type: str, request_body: RollbackVersionRequest) -> dict:
    try:
        entry = app.state.model_registry_service.rollback_version(
            model_type,
            target_version=request_body.target_version,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "model_type": model_type,
        "active_version": entry.get("version"),
        "entry": entry,
    }
