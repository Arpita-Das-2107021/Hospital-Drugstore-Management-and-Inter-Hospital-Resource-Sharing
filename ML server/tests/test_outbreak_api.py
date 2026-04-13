from fastapi.testclient import TestClient

from app_outbreak.main import app
from app_outbreak.routes import get_orchestrator
from app_outbreak.schemas import OutbreakRequest


class FakeOutbreakOrchestrator:
    def __init__(self):
        self.calls = []
        self.v1_calls = []

    def process_outbreak_job(self, request: OutbreakRequest) -> None:
        self.calls.append(request)

    def process_outbreak_job_v1(self, request, external_job_id: str) -> None:
        self.v1_calls.append((request, external_job_id))


def test_run_outbreak_accepts_and_schedules_background_task():
    fake = FakeOutbreakOrchestrator()
    app.dependency_overrides[get_orchestrator] = lambda: fake

    client = TestClient(app)
    response = client.post(
        "/run_outbreak",
        json={
            "data_path": "minio://ml-outbreak-input/sales.csv",
            "callback_url": "http://server-a/api/outbreak_callback",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert len(fake.calls) == 1

    app.dependency_overrides.clear()


def test_run_outbreak_rejects_invalid_data_path():
    client = TestClient(app)

    response = client.post(
        "/run_outbreak",
        json={
            "data_path": "s3://ml-outbreak-input/sales.csv",
            "callback_url": "http://server-a/api/outbreak_callback",
        },
    )

    assert response.status_code == 422


def test_run_outbreak_v1_accepts_and_returns_contract():
    fake = FakeOutbreakOrchestrator()
    app.dependency_overrides[get_orchestrator] = lambda: fake

    client = TestClient(app)
    response = client.post(
        "/api/v1/ml/jobs/outbreak",
        headers={"Idempotency-Key": "idem-456"},
        json={
            "job_id": "2d6af991-d2d8-4f16-bef7-6b15094e43f6",
            "prediction_horizon_days": 14,
            "input": {
                "snapshot_id": "a67cb8c9-804e-4504-b39d-bf86a21431dc",
                "sales_file_path": "minio://ml-input/snapshots/s1/sales.csv",
                "facilities_file_path": "minio://ml-input/snapshots/s1/facilities.csv",
            },
            "model_version": "outbreak-v1",
            "max_neighbors": 20,
            "callback": {
                "url": "https://server-a/api/v1/ml/callbacks/server-b/",
                "timeout_seconds": 10,
            },
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] is True
    assert body["job_type"] == "outbreak"
    assert body["status"] == "accepted"
    assert body["job_id"] == "2d6af991-d2d8-4f16-bef7-6b15094e43f6"
    assert body["external_job_id"].startswith("srvb-outbreak-")
    assert len(fake.v1_calls) == 1

    app.dependency_overrides.clear()


def test_run_outbreak_v1_requires_idempotency_key():
    client = TestClient(app)
    response = client.post(
        "/api/v1/ml/jobs/outbreak",
        json={
            "job_id": "2d6af991-d2d8-4f16-bef7-6b15094e43f6",
            "prediction_horizon_days": 14,
            "input": {
                "snapshot_id": "a67cb8c9-804e-4504-b39d-bf86a21431dc",
                "sales_file_path": "minio://ml-input/snapshots/s1/sales.csv",
                "facilities_file_path": "minio://ml-input/snapshots/s1/facilities.csv",
            },
            "model_version": "outbreak-v1",
            "max_neighbors": 20,
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
