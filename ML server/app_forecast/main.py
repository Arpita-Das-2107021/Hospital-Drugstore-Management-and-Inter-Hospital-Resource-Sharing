from pathlib import Path

from fastapi import FastAPI

from app_forecast.config import settings
from app_forecast.routes import router
from app_forecast.services.ml_service import MLService
from app_forecast.utils import ForecastJobOrchestrator, configure_logging
from shared.services.callback_service import CallbackService
from shared.services.error_handlers import register_validation_error_handler
from shared.services.minio_service import MinIOService

configure_logging()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="HRSP forecast microservice for inventory sharing predictions.",
)

ml_service = MLService(base_data_dir=Path(settings.base_data_dir), test_days=settings.test_days)
minio_service = MinIOService(
    endpoint=settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
    results_bucket=settings.minio_results_bucket,
)
callback_service = CallbackService(
    timeout_seconds=settings.callback_timeout_seconds,
    max_retries=settings.callback_max_retries,
)

app.state.forecast_orchestrator = ForecastJobOrchestrator(
    ml_service=ml_service,
    minio_service=minio_service,
    callback_service=callback_service,
)

app.include_router(router)
register_validation_error_handler(app)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
