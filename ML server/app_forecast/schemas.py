from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ForecastRequest(BaseModel):
    data_path: str = Field(..., examples=["minio://bucket/sales_20260322.csv"])
    callback_url: str = Field(..., examples=["http://server-a/api/ml_callback"])
    desired_ready_time: str = Field(..., examples=["08:00"])

    @field_validator("data_path")
    @classmethod
    def validate_data_path(cls, value: str) -> str:
        if not value.startswith("minio://"):
            raise ValueError("data_path must start with minio://")
        return value


class ForecastAcceptedResponse(BaseModel):
    status: str = "accepted"
    message: str = "Forecast job started"


class ForecastResultItem(BaseModel):
    hospital_id: str
    medicine_name: str
    shareable_quantity: int
    restock: bool
    restock_amount: Optional[int] = None
    alert: bool


class CallbackPayload(BaseModel):
    results: list[ForecastResultItem]
    file_path: str
    generated_at: datetime


class V1ForecastInput(BaseModel):
    snapshot_id: UUID
    sales_file_path: str = Field(..., examples=["minio://ml-input/snapshots/123/sales.csv"])
    medicines_file_path: str = Field(..., examples=["minio://ml-input/snapshots/123/medicines.csv"])
    facilities_file_path: str = Field(..., examples=["minio://ml-input/snapshots/123/facilities.csv"])

    @field_validator("sales_file_path", "medicines_file_path", "facilities_file_path")
    @classmethod
    def validate_minio_paths(cls, value: str) -> str:
        if not value.startswith("minio://"):
            raise ValueError("input file paths must start with minio://")
        return value


class V1CallbackConfig(BaseModel):
    url: str = Field(..., examples=["https://server-a/api/v1/ml/callbacks/server-b/"])
    timeout_seconds: int = Field(default=10, gt=0)


class V1ForecastJobRequest(BaseModel):
    job_id: UUID
    prediction_horizon_days: int = Field(..., gt=0)
    input: V1ForecastInput
    model_version: str = Field(default="forecast-v1")
    callback: V1CallbackConfig


class V1AcceptedResponse(BaseModel):
    accepted: bool = True
    job_id: UUID
    job_type: str
    external_job_id: str
    status: str = "accepted"


class V1ForecastResultItem(BaseModel):
    facility_id: str
    resource_catalog_id: str
    predicted_demand: float = Field(..., ge=0.0)
    confidence_score: float = Field(..., ge=0.0, le=1.0)


class V1ErrorInfo(BaseModel):
    code: str
    message: str


class V1ForecastCallbackPayload(BaseModel):
    job_id: UUID
    job_type: str = "forecast"
    external_job_id: str
    model_version: str
    prediction_horizon_days: int = Field(..., gt=0)
    status: str
    completed_at: datetime
    results: list[V1ForecastResultItem]
    error: V1ErrorInfo | None = None


class V1ErrorResponse(BaseModel):
    accepted: bool = False
    error: dict[str, Any]
