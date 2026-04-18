from fastapi.testclient import TestClient

from server_b_main import app


class _FakeForecastOrchestrator:
    def __init__(self):
        self.v1_calls = []

    def process_forecast_job_v1(self, request, external_job_id: str) -> None:
        self.v1_calls.append((request, external_job_id))


class _FakeOutbreakOrchestrator:
    def __init__(self):
        self.v1_calls = []

    def process_outbreak_job_v1(self, request, external_job_id: str) -> None:
        self.v1_calls.append((request, external_job_id))


def test_combined_app_v1_forecast_endpoint_accepts():
    original = app.state.forecast_orchestrator
    fake = _FakeForecastOrchestrator()
    app.state.forecast_orchestrator = fake

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/ml/jobs/forecast",
            headers={"Idempotency-Key": "idem-combined-forecast"},
            json={
                "job_id": "91a0e82f-c2fa-49fc-9f03-8f8fcafebcf2",
                "prediction_horizon_days": 14,
                "input": {
                    "snapshot_id": "6de49d95-7eb6-4f1f-bdc4-efb8da45351e",
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
        assert response.json()["job_type"] == "forecast"
        assert len(fake.v1_calls) == 1
    finally:
        app.state.forecast_orchestrator = original


def test_combined_app_v1_outbreak_endpoint_accepts():
    original = app.state.outbreak_orchestrator
    fake = _FakeOutbreakOrchestrator()
    app.state.outbreak_orchestrator = fake

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/ml/jobs/outbreak",
            headers={"Idempotency-Key": "idem-combined-outbreak"},
            json={
                "job_id": "1d1a7233-713a-4f47-9c11-8c1d0ec6b8f8",
                "prediction_horizon_days": 14,
                "input": {
                    "snapshot_id": "591fbe48-7338-46ff-8e54-271b070dbbf9",
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
        assert response.json()["job_type"] == "outbreak"
        assert len(fake.v1_calls) == 1
    finally:
        app.state.outbreak_orchestrator = original
