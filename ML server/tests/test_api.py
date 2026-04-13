from fastapi.testclient import TestClient

from app_forecast.main import app
from app_forecast.routes import get_orchestrator
from app_forecast.schemas import ForecastRequest


class FakeOrchestrator:
    def __init__(self):
        self.calls = []
        self.v1_calls = []

    def process_forecast_job(self, request: ForecastRequest) -> None:
        self.calls.append(request)

    def process_forecast_job_v1(self, request, external_job_id: str) -> None:
        self.v1_calls.append((request, external_job_id))


def test_run_forecast_accepts_and_schedules_background_task():
    fake = FakeOrchestrator()
    app.dependency_overrides[get_orchestrator] = lambda: fake

    client = TestClient(app)
    response = client.post(
        "/run_forecast",
        json={
            "data_path": "minio://incoming/sales_20260322.csv",
            "callback_url": "http://server-a/api/ml_callback",
            "desired_ready_time": "08:00",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert len(fake.calls) == 1

    app.dependency_overrides.clear()


def test_run_forecast_rejects_invalid_data_path():
    client = TestClient(app)

    response = client.post(
        "/run_forecast",
        json={
            "data_path": "s3://incoming/sales_20260322.csv",
            "callback_url": "http://server-a/api/ml_callback",
            "desired_ready_time": "08:00",
        },
    )

    assert response.status_code == 422


def test_run_forecast_v1_accepts_and_returns_contract():
    fake = FakeOrchestrator()
    app.dependency_overrides[get_orchestrator] = lambda: fake

    client = TestClient(app)
    response = client.post(
        "/api/v1/ml/jobs/forecast",
        headers={"Idempotency-Key": "idem-123"},
        json={
            "job_id": "8dc5aaef-7e66-4fbf-8772-863d09139f34",
            "prediction_horizon_days": 14,
            "input": {
                "snapshot_id": "d33f77f0-edf8-4511-9216-58daa7e06adf",
                "sales_file_path": "minio://ml-input/snapshots/s1/sales.csv",
                "medicines_file_path": "minio://ml-input/snapshots/s1/medicines.csv",
                "facilities_file_path": "minio://ml-input/snapshots/s1/facilities.csv",
            },
            "model_version": "forecast-v1",
            "callback": {
                "url": "https://server-a/api/v1/ml/callbacks/server-b/",
                "timeout_seconds": 10,
            },
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] is True
    assert body["job_type"] == "forecast"
    assert body["status"] == "accepted"
    assert body["job_id"] == "8dc5aaef-7e66-4fbf-8772-863d09139f34"
    assert body["external_job_id"].startswith("srvb-forecast-")
    assert len(fake.v1_calls) == 1

    app.dependency_overrides.clear()


def test_run_forecast_v1_requires_idempotency_key():
    client = TestClient(app)
    response = client.post(
        "/api/v1/ml/jobs/forecast",
        json={
            "job_id": "8dc5aaef-7e66-4fbf-8772-863d09139f34",
            "prediction_horizon_days": 14,
            "input": {
                "snapshot_id": "d33f77f0-edf8-4511-9216-58daa7e06adf",
                "sales_file_path": "minio://ml-input/snapshots/s1/sales.csv",
                "medicines_file_path": "minio://ml-input/snapshots/s1/medicines.csv",
                "facilities_file_path": "minio://ml-input/snapshots/s1/facilities.csv",
            },
            "model_version": "forecast-v1",
            "callback": {
                "url": "https://server-a/api/v1/ml/callbacks/server-b/",
                "timeout_seconds": 10,
            },
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["accepted"] is False
    assert body["error"]["code"] == "validation_error"
