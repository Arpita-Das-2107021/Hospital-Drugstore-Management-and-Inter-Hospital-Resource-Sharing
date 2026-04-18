from pathlib import Path

from fastapi import FastAPI

from app_outbreak.config import settings
from app_outbreak.routes import router
from app_outbreak.services.ml_service import OutbreakMLService
from app_outbreak.utils import OutbreakJobOrchestrator, configure_logging
from shared.services.callback_service import CallbackService
from shared.services.error_handlers import register_validation_error_handler
from shared.services.minio_service import MinIOService

configure_logging()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="HRSP outbreak microservice for healthcare-level outbreak prediction.",
)

ml_service = OutbreakMLService(
    base_data_dir=Path(settings.base_data_dir),
    model_path=settings.outbreak_model_path,
    graph_radius_km=settings.graph_radius,
    sequence_length=settings.sequence_length,
)
minio_service = MinIOService(
    endpoint=settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
    results_bucket=settings.minio_outbreak_bucket,
)
callback_service = CallbackService(
    timeout_seconds=settings.callback_timeout_seconds,
    max_retries=settings.callback_max_retries,
)

app.state.outbreak_orchestrator = OutbreakJobOrchestrator(
    ml_service=ml_service,
    minio_service=minio_service,
    callback_service=callback_service,
)

app.include_router(router)
register_validation_error_handler(app)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
