import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request, status

from app_forecast.schemas import (
    ForecastAcceptedResponse,
    ForecastRequest,
    V1AcceptedResponse,
    V1ForecastJobRequest,
)
from app_forecast.utils import ForecastJobOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter()


def get_orchestrator(request: Request) -> ForecastJobOrchestrator:
    return request.app.state.forecast_orchestrator


@router.post("/run_forecast", response_model=ForecastAcceptedResponse)
def run_forecast(
    request_body: ForecastRequest,
    background_tasks: BackgroundTasks,
    orchestrator: ForecastJobOrchestrator = Depends(get_orchestrator),
) -> ForecastAcceptedResponse:
    logger.info("Accepted forecast job for data_path=%s", request_body.data_path)
    background_tasks.add_task(orchestrator.process_forecast_job, request_body)
    return ForecastAcceptedResponse()


@router.post(
    "/api/v1/ml/jobs/forecast",
    response_model=V1AcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_forecast_v1(
    request_body: V1ForecastJobRequest,
    background_tasks: BackgroundTasks,
    orchestrator: ForecastJobOrchestrator = Depends(get_orchestrator),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> V1AcceptedResponse:
    logger.info(
        "Accepted forecast v1 job_id=%s snapshot_id=%s idempotency_key=%s",
        request_body.job_id,
        request_body.input.snapshot_id,
        idempotency_key,
    )

    external_job_id = f"srvb-forecast-{request_body.job_id}"
    background_tasks.add_task(
        orchestrator.process_forecast_job_v1,
        request_body,
        external_job_id,
    )

    return V1AcceptedResponse(
        job_id=request_body.job_id,
        job_type="forecast",
        external_job_id=external_job_id,
    )
