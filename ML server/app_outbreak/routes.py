import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request, status

from app_outbreak.schemas import (
    OutbreakAcceptedResponse,
    OutbreakRequest,
    V1AcceptedResponse,
    V1OutbreakJobRequest,
)
from app_outbreak.utils import OutbreakJobOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter()


def get_orchestrator(request: Request) -> OutbreakJobOrchestrator:
    return request.app.state.outbreak_orchestrator


@router.post("/run_outbreak", response_model=OutbreakAcceptedResponse)
def run_outbreak(
    request_body: OutbreakRequest,
    background_tasks: BackgroundTasks,
    orchestrator: OutbreakJobOrchestrator = Depends(get_orchestrator),
) -> OutbreakAcceptedResponse:
    logger.info("Accepted outbreak job for data_path=%s", request_body.data_path)
    background_tasks.add_task(orchestrator.process_outbreak_job, request_body)
    return OutbreakAcceptedResponse()


@router.post(
    "/api/v1/ml/jobs/outbreak",
    response_model=V1AcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_outbreak_v1(
    request_body: V1OutbreakJobRequest,
    background_tasks: BackgroundTasks,
    orchestrator: OutbreakJobOrchestrator = Depends(get_orchestrator),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> V1AcceptedResponse:
    logger.info(
        "Accepted outbreak v1 job_id=%s snapshot_id=%s idempotency_key=%s",
        request_body.job_id,
        request_body.input.snapshot_id,
        idempotency_key,
    )

    external_job_id = f"srvb-outbreak-{request_body.job_id}"
    background_tasks.add_task(
        orchestrator.process_outbreak_job_v1,
        request_body,
        external_job_id,
    )

    return V1AcceptedResponse(
        job_id=request_body.job_id,
        job_type="outbreak",
        external_job_id=external_job_id,
    )
