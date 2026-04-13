from fastapi.testclient import TestClient

from server_b_main import app
from shared.services.job_status_service import JobStatusService
from shared.services.model_registry_service import ModelRegistryService


class _FakeForecastWorkflowOrchestrator:
    def __init__(self):
        self.inference_calls = []
        self.training_calls = []

    def process_forecast_inference_job(self, request, external_job_id: str) -> None:
        self.inference_calls.append((request, external_job_id))

    def process_forecast_training_job(self, request, external_job_id: str) -> None:
        self.training_calls.append((request, external_job_id))


class _FakeOutbreakWorkflowOrchestrator:
    def __init__(self):
        self.inference_calls = []
        self.training_calls = []

    def process_outbreak_inference_job(self, request, external_job_id: str) -> None:
        self.inference_calls.append((request, external_job_id))

    def process_outbreak_training_job(self, request, external_job_id: str) -> None:
        self.training_calls.append((request, external_job_id))


def test_model1_json_inference_endpoint_accepts_and_tracks_pending_job():
    original_forecast = app.state.forecast_orchestrator
    original_job_status = app.state.job_status_service

    fake = _FakeForecastWorkflowOrchestrator()
    app.state.forecast_orchestrator = fake
    app.state.job_status_service = JobStatusService()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/inference/model1/predict",
            headers={"Idempotency-Key": "idem-model1-json"},
            json={
                "job_id": "8f8be762-ea56-4d17-90b0-8148df6fbcf4",
                "prediction_horizon_days": 7,
                "input": {
                    "rows": [
                        {
                            "facility_id": "F001",
                            "resource_catalog_id": "MED001",
                            "features": {
                                "rolling_mean_7": 12.0,
                                "lag_1_sales": 9.0,
                            },
                        }
                    ]
                },
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
        assert body["status"] == "pending"
        assert body["external_job_id"].startswith("srvb-forecast-")
        assert len(fake.inference_calls) == 1

        job = app.state.job_status_service.get_job("8f8be762-ea56-4d17-90b0-8148df6fbcf4")
        assert job is not None
        assert job["status"] == "pending"
    finally:
        app.state.forecast_orchestrator = original_forecast
        app.state.job_status_service = original_job_status


def test_model2_json_inference_endpoint_accepts_and_tracks_pending_job():
    original_outbreak = app.state.outbreak_orchestrator
    original_job_status = app.state.job_status_service

    fake = _FakeOutbreakWorkflowOrchestrator()
    app.state.outbreak_orchestrator = fake
    app.state.job_status_service = JobStatusService()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/inference/model2/predict",
            headers={"Idempotency-Key": "idem-model2-json"},
            json={
                "job_id": "26b928ac-4536-4a55-88b4-16995e8fa5ff",
                "prediction_horizon_days": 7,
                "max_neighbors": 2,
                "input": {
                    "rows": [
                        {
                            "facility_id": "PH001",
                            "upazila": "Joypurhat Sadar",
                            "features": {
                                "recent_avg_sales": 15.0,
                                "baseline_avg_sales": 10.0,
                                "neighbor_trend_score": 0.4,
                            },
                        }
                    ],
                    "neighbors": {
                        "PH001": [
                            {
                                "facility_id": "PH002",
                                "distance_km": 1.2,
                            }
                        ]
                    },
                },
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
        assert body["status"] == "pending"
        assert body["external_job_id"].startswith("srvb-outbreak-")
        assert len(fake.inference_calls) == 1

        job = app.state.job_status_service.get_job("26b928ac-4536-4a55-88b4-16995e8fa5ff")
        assert job is not None
        assert job["status"] == "pending"
    finally:
        app.state.outbreak_orchestrator = original_outbreak
        app.state.job_status_service = original_job_status


def test_model1_training_endpoint_accepts_and_tracks_pending_job():
    original_forecast = app.state.forecast_orchestrator
    original_job_status = app.state.job_status_service

    fake = _FakeForecastWorkflowOrchestrator()
    app.state.forecast_orchestrator = fake
    app.state.job_status_service = JobStatusService()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/training/model1/train",
            headers={"Idempotency-Key": "idem-train-model1"},
            json={
                "job_id": "5f325b90-a8e3-44a6-91de-33f8bbd7ce0f",
                "input": {
                    "dataset_snapshot_uri": "minio://ml-input/snapshots/s100",
                },
                "date_range": {
                    "start_date": "2024-01-01",
                    "end_date": "2024-02-01",
                },
                "training_params": {
                    "horizon_days": 7,
                    "buffer_days": 3,
                },
                "requested_version_label": "candidate-a",
            },
        )

        assert response.status_code == 202
        body = response.json()
        assert body["job_type"] == "forecast_training"
        assert body["status"] == "pending"
        assert body["external_job_id"].startswith("srvb-training-model1-")
        assert len(fake.training_calls) == 1
    finally:
        app.state.forecast_orchestrator = original_forecast
        app.state.job_status_service = original_job_status


def test_model2_training_endpoint_accepts_and_tracks_pending_job():
    original_outbreak = app.state.outbreak_orchestrator
    original_job_status = app.state.job_status_service

    fake = _FakeOutbreakWorkflowOrchestrator()
    app.state.outbreak_orchestrator = fake
    app.state.job_status_service = JobStatusService()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/training/model2/train",
            headers={"Idempotency-Key": "idem-train-model2"},
            json={
                "job_id": "b0e3bb46-cb34-4f8f-99f0-ab9cb01e33cc",
                "input": {
                    "dataset_snapshot_uri": "minio://ml-input/snapshots/s200",
                },
                "date_range": {
                    "start_date": "2024-01-01",
                    "end_date": "2024-02-01",
                },
                "training_params": {
                    "trend_weight": 1.1,
                    "neighbor_weight": 0.9,
                },
                "requested_version_label": "candidate-b",
            },
        )

        assert response.status_code == 202
        body = response.json()
        assert body["job_type"] == "outbreak_training"
        assert body["status"] == "pending"
        assert body["external_job_id"].startswith("srvb-training-model2-")
        assert len(fake.training_calls) == 1
    finally:
        app.state.outbreak_orchestrator = original_outbreak
        app.state.job_status_service = original_job_status


def test_model_registry_activate_and_rollback_endpoints(tmp_path):
    original_registry = app.state.model_registry_service

    test_registry = ModelRegistryService(
        registry_path=tmp_path / "registry.json",
        model2_default_artifact=None,
    )
    test_registry.register_version(
        model_type="model1",
        version="model1-v1",
        artifact_uri="/tmp/model1-v1",
        status="trained",
        metadata={"source": "unit_test"},
    )
    test_registry.register_version(
        model_type="model1",
        version="model1-v2",
        artifact_uri="/tmp/model1-v2",
        status="trained",
        metadata={"source": "unit_test"},
    )

    app.state.model_registry_service = test_registry

    try:
        client = TestClient(app)

        list_models_resp = client.get("/api/v1/models/")
        assert list_models_resp.status_code == 200
        assert {item["model_type"] for item in list_models_resp.json()["models"]} == {"model1", "model2"}

        activate_v1_resp = client.post(
            "/api/v1/models/model1/activate",
            json={"version": "model1-v1"},
        )
        assert activate_v1_resp.status_code == 200
        assert activate_v1_resp.json()["active_version"] == "model1-v1"

        activate_v2_resp = client.post(
            "/api/v1/models/model1/activate",
            json={"version": "model1-v2"},
        )
        assert activate_v2_resp.status_code == 200
        assert activate_v2_resp.json()["active_version"] == "model1-v2"

        rollback_resp = client.post(
            "/api/v1/models/model1/rollback",
            json={"target_version": "model1-v1"},
        )
        assert rollback_resp.status_code == 200
        assert rollback_resp.json()["active_version"] == "model1-v1"

        versions_resp = client.get("/api/v1/models/model1/versions")
        assert versions_resp.status_code == 200
        assert versions_resp.json()["active_version"] == "model1-v1"
    finally:
        app.state.model_registry_service = original_registry


def test_job_status_polling_endpoint_returns_current_status():
    original_job_status = app.state.job_status_service
    app.state.job_status_service = JobStatusService()

    try:
        app.state.job_status_service.create_job(
            job_id="f53e3386-7199-4bc6-ad7a-db3a0ce7f87f",
            external_job_id="srvb-forecast-f53e3386-7199-4bc6-ad7a-db3a0ce7f87f",
            job_type="forecast",
            model_type="model1",
            request_id="req-1",
        )
        app.state.job_status_service.update_status(
            external_job_id="srvb-forecast-f53e3386-7199-4bc6-ad7a-db3a0ce7f87f",
            status="processing",
        )

        client = TestClient(app)
        response = client.get("/api/v1/ml/jobs/f53e3386-7199-4bc6-ad7a-db3a0ce7f87f")

        assert response.status_code == 200
        body = response.json()
        assert body["job_id"] == "f53e3386-7199-4bc6-ad7a-db3a0ce7f87f"
        assert body["status"] == "processing"
        assert body["request_id"] == "req-1"
    finally:
        app.state.job_status_service = original_job_status
