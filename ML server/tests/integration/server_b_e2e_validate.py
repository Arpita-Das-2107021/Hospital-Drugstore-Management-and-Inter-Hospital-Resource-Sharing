from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

import requests
from requests import ConnectionError as RequestsConnectionError

SERVER_B_BASE = os.getenv("SERVER_B_BASE_URL", "http://host.docker.internal:8100")
CALLBACK_BASE = os.getenv("CALLBACK_BASE_URL", "http://host.docker.internal:18100")
TIMEOUT_SECONDS = int(os.getenv("E2E_TIMEOUT_SECONDS", "180"))


class ValidationError(RuntimeError):
    pass


@dataclass
class JobResult:
    job_id: str
    external_job_id: str
    statuses: list[str]
    final_payload: dict[str, Any]


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def _request(method: str, path: str, expected_status: int | None = None, **kwargs) -> requests.Response:
    url = f"{SERVER_B_BASE}{path}"
    retry_count = int(kwargs.pop("_retry_count", 0))

    try:
        response = requests.request(method, url, timeout=30, **kwargs)
    except RequestsConnectionError as exc:
        if retry_count < 5:
            time.sleep(1)
            return _request(method, path, expected_status=expected_status, _retry_count=retry_count + 1, **kwargs)
        raise ValidationError(f"Connection error for {method} {path}: {exc}") from exc

    if expected_status is not None and response.status_code != expected_status:
        raise ValidationError(
            f"Unexpected status for {method} {path}: {response.status_code} {response.text}"
        )
    return response


def _wait_for_server_ready() -> None:
    start = time.time()
    while time.time() - start < 30:
        try:
            response = requests.get(f"{SERVER_B_BASE}/health", timeout=5)
            if response.status_code == 200:
                return
        except requests.RequestException:
            pass
        time.sleep(1)

    raise ValidationError("Server B did not become ready within 30 seconds")


def _callback_request(method: str, path: str, expected_status: int | None = None, **kwargs) -> requests.Response:
    url = f"{CALLBACK_BASE}{path}"
    response = requests.request(method, url, timeout=30, **kwargs)
    if expected_status is not None and response.status_code != expected_status:
        raise ValidationError(
            f"Unexpected callback status for {method} {path}: {response.status_code} {response.text}"
        )
    return response


def _poll_job(job_id: str) -> JobResult:
    statuses: list[str] = []
    start = time.time()
    last_payload: dict[str, Any] | None = None

    while time.time() - start < TIMEOUT_SECONDS:
        response = _request("GET", f"/api/v1/ml/jobs/{job_id}", expected_status=200)
        payload = response.json()
        last_payload = payload
        current_status = str(payload.get("status"))
        statuses.append(current_status)
        if current_status in {"completed", "failed"}:
            return JobResult(
                job_id=str(payload.get("job_id")),
                external_job_id=str(payload.get("external_job_id")),
                statuses=statuses,
                final_payload=payload,
            )
        time.sleep(1)

    raise ValidationError(f"Job did not reach terminal status in time: {job_id}")


def _find_callback_by_job_id(job_id: str) -> dict[str, Any]:
    response = _callback_request("GET", "/events", expected_status=200)
    events = response.json().get("events", [])
    for event in reversed(events):
        body = event.get("body", {})
        if str(body.get("job_id")) == job_id:
            return event
    raise ValidationError(f"No callback captured for job_id={job_id}")


def _submit_inference_model1(model_version: str | None = None, expect_http: int = 202) -> tuple[str, dict[str, Any]]:
    job_id = str(uuid.uuid4())
    payload = {
        "job_id": job_id,
        "prediction_horizon_days": 7,
        "input": {
            "rows": [
                {
                    "facility_id": "F001",
                    "resource_catalog_id": "MED_PARACETAMOL",
                    "features": {
                        "rolling_mean_7": 12.0,
                        "lag_1_sales": 10.0,
                        "base_daily_sales": 8.0,
                        "outbreak_multiplier": 1.2,
                    },
                },
                {
                    "facility_id": "F002",
                    "resource_catalog_id": "MED_ORS",
                    "features": {
                        "rolling_mean_7": 5.0,
                        "lag_1_sales": 4.0,
                        "base_daily_sales": 3.0,
                        "outbreak_multiplier": 1.1,
                    },
                },
            ]
        },
        "callback": {
            "url": f"{CALLBACK_BASE}/api/v1/ml/callbacks/server-b/",
            "timeout_seconds": 10,
        },
    }
    if model_version:
        payload["model_version"] = model_version

    response = _request(
        "POST",
        "/api/v1/inference/model1/predict",
        expected_status=expect_http,
        headers={"Idempotency-Key": f"idem-m1-{job_id}"},
        json=payload,
    )
    return job_id, response.json()


def _submit_inference_model2(model_version: str | None = None, expect_http: int = 202) -> tuple[str, dict[str, Any]]:
    job_id = str(uuid.uuid4())
    payload = {
        "job_id": job_id,
        "prediction_horizon_days": 7,
        "max_neighbors": 3,
        "input": {
            "rows": [
                {
                    "facility_id": "PH001",
                    "upazila": "Joypurhat Sadar",
                    "features": {
                        "recent_avg_sales": 18.0,
                        "baseline_avg_sales": 9.0,
                        "neighbor_trend_score": 0.4,
                        "outbreak_signal": 1.0,
                    },
                },
                {
                    "facility_id": "PH002",
                    "upazila": "Akkelpur",
                    "features": {
                        "recent_avg_sales": 8.0,
                        "baseline_avg_sales": 10.0,
                        "neighbor_trend_score": -0.2,
                        "outbreak_signal": 0.0,
                    },
                },
            ],
            "neighbors": {
                "PH001": [
                    {"facility_id": "PH003", "distance_km": 1.2},
                    {"facility_id": "PH004", "distance_km": 3.4},
                ],
                "PH002": [
                    {"facility_id": "PH001", "distance_km": 1.2},
                ],
            },
        },
        "callback": {
            "url": f"{CALLBACK_BASE}/api/v1/ml/callbacks/server-b/",
            "timeout_seconds": 10,
        },
    }
    if model_version:
        payload["model_version"] = model_version

    response = _request(
        "POST",
        "/api/v1/inference/model2/predict",
        expected_status=expect_http,
        headers={"Idempotency-Key": f"idem-m2-{job_id}"},
        json=payload,
    )
    return job_id, response.json()


def _submit_training_model1(snapshot_uri: str, requested_label: str) -> tuple[str, dict[str, Any]]:
    job_id = str(uuid.uuid4())
    payload = {
        "job_id": job_id,
        "input": {
            "dataset_snapshot_uri": snapshot_uri,
        },
        "date_range": {
            "start_date": "2024-01-01",
            "end_date": "2025-12-31",
        },
        "training_params": {
            "horizon_days": 7,
            "test_days": 7,
            "buffer_days": 3,
            "share_ratio": 0.8,
        },
        "requested_version_label": requested_label,
        "callback": {
            "url": f"{CALLBACK_BASE}/api/v1/ml/callbacks/server-b/",
            "timeout_seconds": 10,
        },
    }

    response = _request(
        "POST",
        "/api/v1/training/model1/train",
        expected_status=202,
        headers={"Idempotency-Key": f"idem-train-m1-{job_id}"},
        json=payload,
    )
    return job_id, response.json()


def _submit_training_model2(snapshot_uri: str, requested_label: str) -> tuple[str, dict[str, Any]]:
    job_id = str(uuid.uuid4())
    payload = {
        "job_id": job_id,
        "input": {
            "dataset_snapshot_uri": snapshot_uri,
        },
        "date_range": {
            "start_date": "2024-01-01",
            "end_date": "2025-12-31",
        },
        "training_params": {
            "trend_weight": 1.1,
            "neighbor_weight": 0.9,
            "outbreak_weight": 0.5,
            "threshold": 0.5,
        },
        "requested_version_label": requested_label,
        "callback": {
            "url": f"{CALLBACK_BASE}/api/v1/ml/callbacks/server-b/",
            "timeout_seconds": 10,
        },
    }

    response = _request(
        "POST",
        "/api/v1/training/model2/train",
        expected_status=202,
        headers={"Idempotency-Key": f"idem-train-m2-{job_id}"},
        json=payload,
    )
    return job_id, response.json()


def _model_versions(model_type: str) -> dict[str, Any]:
    return _request("GET", f"/api/v1/models/{model_type}/versions", expected_status=200).json()


def _activate(model_type: str, version: str) -> dict[str, Any]:
    return _request(
        "POST",
        f"/api/v1/models/{model_type}/activate",
        expected_status=200,
        json={"version": version},
    ).json()


def _rollback(model_type: str, target_version: str | None = None) -> dict[str, Any]:
    payload = {"target_version": target_version}
    return _request(
        "POST",
        f"/api/v1/models/{model_type}/rollback",
        expected_status=200,
        json=payload,
    ).json()


def _latest_version(versions_payload: dict[str, Any]) -> dict[str, Any]:
    versions = versions_payload.get("versions", [])
    if not versions:
        raise ValidationError("No versions available")
    return versions[-1]


def main() -> None:
    report: dict[str, Any] = {
        "phase1": {},
        "phase2_prediction": {},
        "phase2_training": {},
        "phase3_compatibility": {},
        "phase4_negative_and_rollback": {},
    }

    _wait_for_server_ready()
    health = _request("GET", "/health", expected_status=200).json()
    _assert(health.get("status") == "ok", "Server health check failed")

    _callback_request("DELETE", "/events", expected_status=200)

    model1_before = _model_versions("model1")
    model2_before = _model_versions("model2")

    report["phase1"]["before"] = {
        "model1_active": model1_before.get("active_version"),
        "model2_active": model2_before.get("active_version"),
        "model1_versions": len(model1_before.get("versions", [])),
        "model2_versions": len(model2_before.get("versions", [])),
    }

    # Train model1, verify trained but not auto-activated, then activate.
    model1_train_job_id, model1_train_accept = _submit_training_model1(
        snapshot_uri="minio://ml-input/snapshots/e2e",
        requested_label="phase1-model1",
    )
    _assert(model1_train_accept.get("status") == "pending", "Model1 training did not return pending status")
    model1_train_result = _poll_job(model1_train_job_id)
    _assert(model1_train_result.final_payload.get("status") == "completed", "Model1 training job did not complete")

    model1_mid = _model_versions("model1")
    trained_model1 = _latest_version(model1_mid)
    _assert(trained_model1.get("status") == "trained", "Model1 new version is not in trained state")
    _assert(
        trained_model1.get("approval_status") == "pending_approval",
        "Model1 new version approval status is not pending_approval",
    )
    _assert(
        model1_mid.get("active_version") != trained_model1.get("version"),
        "Model1 new version was auto-activated unexpectedly",
    )

    activated_model1 = _activate("model1", str(trained_model1.get("version")))
    _assert(activated_model1.get("active_version") == trained_model1.get("version"), "Model1 activation failed")

    # Train model2, verify trained but not auto-activated, then activate.
    model2_train_job_id, model2_train_accept = _submit_training_model2(
        snapshot_uri="minio://ml-input/snapshots/e2e",
        requested_label="phase1-model2",
    )
    _assert(model2_train_accept.get("status") == "pending", "Model2 training did not return pending status")
    model2_train_result = _poll_job(model2_train_job_id)
    _assert(model2_train_result.final_payload.get("status") == "completed", "Model2 training job did not complete")

    model2_mid = _model_versions("model2")
    trained_model2 = _latest_version(model2_mid)
    _assert(trained_model2.get("status") == "trained", "Model2 new version is not in trained state")
    _assert(
        trained_model2.get("approval_status") == "pending_approval",
        "Model2 new version approval status is not pending_approval",
    )
    _assert(
        model2_mid.get("active_version") != trained_model2.get("version"),
        "Model2 new version was auto-activated unexpectedly",
    )

    activated_model2 = _activate("model2", str(trained_model2.get("version")))
    _assert(activated_model2.get("active_version") == trained_model2.get("version"), "Model2 activation failed")

    model1_after = _model_versions("model1")
    model2_after = _model_versions("model2")

    report["phase1"]["after"] = {
        "model1_active": model1_after.get("active_version"),
        "model2_active": model2_after.get("active_version"),
        "model1_active_artifact": _latest_version(model1_after).get("artifact_uri"),
        "model2_active_artifact": _latest_version(model2_after).get("artifact_uri"),
        "model1_state": _latest_version(model1_after).get("status"),
        "model2_state": _latest_version(model2_after).get("status"),
    }

    # Prediction with default active version.
    model1_pred_job_id, model1_pred_accept = _submit_inference_model1()
    _assert(model1_pred_accept.get("status") == "pending", "Model1 prediction did not return pending")
    model1_pred_result = _poll_job(model1_pred_job_id)
    _assert(model1_pred_result.final_payload.get("status") == "completed", "Model1 prediction did not complete")
    callback_model1 = _find_callback_by_job_id(model1_pred_job_id)

    model2_pred_job_id, model2_pred_accept = _submit_inference_model2()
    _assert(model2_pred_accept.get("status") == "pending", "Model2 prediction did not return pending")
    model2_pred_result = _poll_job(model2_pred_job_id)
    _assert(model2_pred_result.final_payload.get("status") == "completed", "Model2 prediction did not complete")
    callback_model2 = _find_callback_by_job_id(model2_pred_job_id)

    report["phase2_prediction"] = {
        "model1": {
            "accept": model1_pred_accept,
            "statuses": model1_pred_result.statuses,
            "final": model1_pred_result.final_payload,
            "callback_body": callback_model1.get("body"),
        },
        "model2": {
            "accept": model2_pred_accept,
            "statuses": model2_pred_result.statuses,
            "final": model2_pred_result.final_payload,
            "callback_body": callback_model2.get("body"),
        },
    }

    # Explicit version request.
    explicit_model1_job_id, _ = _submit_inference_model1(model_version=model1_after.get("active_version"))
    explicit_model1_result = _poll_job(explicit_model1_job_id)
    _assert(explicit_model1_result.final_payload.get("status") == "completed", "Explicit model1 version failed")

    explicit_model2_job_id, _ = _submit_inference_model2(model_version=model2_after.get("active_version"))
    explicit_model2_result = _poll_job(explicit_model2_job_id)
    _assert(explicit_model2_result.final_payload.get("status") == "completed", "Explicit model2 version failed")

    # Invalid version request should be accepted initially but fail in processing.
    invalid_job_id, invalid_accept = _submit_inference_model1(model_version="does-not-exist-version")
    _assert(invalid_accept.get("status") == "pending", "Invalid model version request was not accepted as async job")
    invalid_result = _poll_job(invalid_job_id)
    _assert(invalid_result.final_payload.get("status") == "failed", "Invalid model version did not fail")

    # Missing required fields should fail request validation.
    missing_response = _request(
        "POST",
        "/api/v1/inference/model1/predict",
        expected_status=422,
        headers={"Idempotency-Key": f"idem-invalid-{uuid.uuid4()}"},
        json={
            "job_id": str(uuid.uuid4()),
            "prediction_horizon_days": 7,
            "input": {"rows": []},
            "callback": {"url": f"{CALLBACK_BASE}/api/v1/ml/callbacks/server-b/", "timeout_seconds": 10},
        },
    )
    missing_payload = missing_response.json()
    _assert(missing_payload.get("accepted") is False, "Validation error envelope mismatch")
    _assert(missing_payload.get("error", {}).get("code") == "validation_error", "Validation error code mismatch")

    # Train second model1 candidate to test rollback behavior.
    second_model1_train_job_id, _ = _submit_training_model1(
        snapshot_uri="minio://ml-input/snapshots/e2e_v2",
        requested_label="phase4-model1-second",
    )
    second_model1_train_result = _poll_job(second_model1_train_job_id)
    _assert(second_model1_train_result.final_payload.get("status") == "completed", "Second model1 training failed")

    model1_versions_after_second = _model_versions("model1")
    latest_model1 = _latest_version(model1_versions_after_second)
    latest_model1_version = str(latest_model1.get("version"))
    _activate("model1", latest_model1_version)

    rollback_result = _rollback("model1", target_version=str(trained_model1.get("version")))
    _assert(
        rollback_result.get("active_version") == trained_model1.get("version"),
        "Rollback did not set expected model1 active version",
    )

    after_rollback_job_id, _ = _submit_inference_model1()
    after_rollback_result = _poll_job(after_rollback_job_id)
    _assert(after_rollback_result.final_payload.get("status") == "completed", "Prediction after rollback failed")
    callback_after_rollback = _find_callback_by_job_id(after_rollback_job_id)
    _assert(
        callback_after_rollback.get("body", {}).get("model_version") == trained_model1.get("version"),
        "Prediction after rollback did not use rolled back active version",
    )

    report["phase2_training"] = {
        "model1_train_job": model1_train_result.final_payload,
        "model2_train_job": model2_train_result.final_payload,
        "model1_trained_version": trained_model1,
        "model2_trained_version": trained_model2,
    }

    report["phase3_compatibility"] = {
        "forecast_callback_has_expected_fields": sorted(
            list(callback_model1.get("body", {}).keys())
        ),
        "outbreak_callback_has_expected_fields": sorted(
            list(callback_model2.get("body", {}).keys())
        ),
        "validation_error_envelope": missing_payload,
    }

    report["phase4_negative_and_rollback"] = {
        "invalid_version_job": invalid_result.final_payload,
        "rollback_result": rollback_result,
        "post_rollback_callback": callback_after_rollback.get("body"),
    }

    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
