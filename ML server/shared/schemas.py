from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class CallbackConfig(BaseModel):
    url: str = Field(..., examples=["https://server-a/api/v1/ml/callbacks/server-b/"])
    timeout_seconds: int = Field(default=10, gt=0)


class JobAcceptedResponse(BaseModel):
    accepted: bool = True
    job_id: UUID
    job_type: str
    external_job_id: str
    status: str = "pending"


class JobStatusResponse(BaseModel):
    job_id: str
    external_job_id: str
    job_type: str
    model_type: str
    status: str
    request_id: str | None = None
    created_at: str
    updated_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: dict[str, Any] | None = None


class Model1InferenceRow(BaseModel):
    facility_id: str
    resource_catalog_id: str
    features: dict[str, Any] = Field(default_factory=dict)


class Model1InferenceInput(BaseModel):
    rows: list[Model1InferenceRow] = Field(default_factory=list, min_length=1)


class Model1InferenceRequest(BaseModel):
    job_id: UUID
    prediction_horizon_days: int = Field(default=7, gt=0)
    model_version: str | None = None
    input: Model1InferenceInput
    callback: CallbackConfig


class Model2InferenceRow(BaseModel):
    facility_id: str
    upazila: str | None = None
    features: dict[str, Any] = Field(default_factory=dict)


class Model2InferenceInput(BaseModel):
    rows: list[Model2InferenceRow] = Field(default_factory=list, min_length=1)
    neighbors: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


class Model2InferenceRequest(BaseModel):
    job_id: UUID
    prediction_horizon_days: int = Field(default=7, gt=0)
    model_version: str | None = None
    max_neighbors: int = Field(default=20, gt=0)
    input: Model2InferenceInput
    callback: CallbackConfig


class DateRange(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_bounds(self) -> "DateRange":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be <= end_date")
        return self


class Model1TrainingInput(BaseModel):
    snapshot_id: UUID | None = None
    dataset_snapshot_uri: str | None = None
    sales_file_path: str | None = None
    medicines_file_path: str | None = None
    facilities_file_path: str | None = None
    outbreaks_file_path: str | None = None

    @field_validator(
        "dataset_snapshot_uri",
        "sales_file_path",
        "medicines_file_path",
        "facilities_file_path",
        "outbreaks_file_path",
    )
    @classmethod
    def validate_minio_path_if_present(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.startswith("minio://"):
            raise ValueError("path fields must start with minio://")
        return value

    @model_validator(mode="after")
    def validate_source(self) -> "Model1TrainingInput":
        if self.dataset_snapshot_uri:
            return self
        required = [self.sales_file_path, self.medicines_file_path, self.facilities_file_path]
        if all(required):
            return self
        raise ValueError(
            "Provide either dataset_snapshot_uri or explicit sales/medicines/facilities minio paths"
        )


class Model2TrainingInput(BaseModel):
    snapshot_id: UUID | None = None
    dataset_snapshot_uri: str | None = None
    sales_file_path: str | None = None
    facilities_file_path: str | None = None
    medicines_file_path: str | None = None
    outbreaks_file_path: str | None = None

    @field_validator(
        "dataset_snapshot_uri",
        "sales_file_path",
        "facilities_file_path",
        "medicines_file_path",
        "outbreaks_file_path",
    )
    @classmethod
    def validate_minio_path_if_present(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.startswith("minio://"):
            raise ValueError("path fields must start with minio://")
        return value

    @model_validator(mode="after")
    def validate_source(self) -> "Model2TrainingInput":
        if self.dataset_snapshot_uri:
            return self
        if self.sales_file_path and self.facilities_file_path:
            return self
        raise ValueError(
            "Provide either dataset_snapshot_uri or explicit sales/facilities minio paths"
        )


class Model1TrainingRequest(BaseModel):
    job_id: UUID
    input: Model1TrainingInput
    date_range: DateRange | None = None
    training_params: dict[str, Any] = Field(default_factory=dict)
    requested_version_label: str | None = None
    callback: CallbackConfig | None = None


class Model2TrainingRequest(BaseModel):
    job_id: UUID
    input: Model2TrainingInput
    date_range: DateRange | None = None
    training_params: dict[str, Any] = Field(default_factory=dict)
    requested_version_label: str | None = None
    callback: CallbackConfig | None = None


class ActivateVersionRequest(BaseModel):
    version: str


class RollbackVersionRequest(BaseModel):
    target_version: str | None = None
