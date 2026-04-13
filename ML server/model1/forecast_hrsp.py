from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from model1.prepare_hrsp_data import prepare_hrsp_global_shareable_data


MODEL_PREFIX = "model1-global-shareable"
MODEL_LABEL = "global_shareable_ridge"
MODEL_SCHEMA_VERSION = "2.0.0"
REGISTRY_SCHEMA_VERSION = "1.0"
RIDGE_REGULARIZATION = 1.0
TARGET_DEFINITION = (
    "shareable_amount = max(current_stock - (future_horizon_demand + demand_uncertainty) "
    "- safety_buffer, 0) * share_ratio"
)


def mae_score(y_true: pd.Series, y_pred: pd.Series) -> float:
    """Compute Mean Absolute Error (MAE)."""
    y_true_np = pd.to_numeric(y_true, errors="coerce").fillna(0.0).to_numpy(dtype=float)
    y_pred_np = pd.to_numeric(y_pred, errors="coerce").fillna(0.0).to_numpy(dtype=float)
    if y_true_np.size == 0:
        return 0.0
    return float(np.mean(np.abs(y_true_np - y_pred_np)))


def _write_json(path: Path, payload: dict) -> None:
    """Write JSON to disk with stable formatting."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file_obj:
        json.dump(payload, file_obj, indent=2, sort_keys=True)


def _build_model_version() -> str:
    """Generate unique model version name for registry tracking."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    suffix = uuid4().hex[:8]
    return f"{MODEL_PREFIX}-v{timestamp}-{suffix}"


def _resolve_artifact_root() -> Path:
    """Resolve stable artifact root with optional environment override."""
    override = os.environ.get("MODEL1_ARTIFACT_DIR")
    if override:
        return Path(override)

    # Persist outside request runtime folders so model registry survives job temp cleanup.
    return Path(__file__).resolve().parents[1] / "model1_artifacts"


def fit_preprocessor(
    frame: pd.DataFrame,
    categorical_columns: list[str],
    numeric_columns: list[str],
) -> dict:
    """Fit simple scaler + one-hot encoder artifacts for tabular global model."""
    scaler_mean: dict[str, float] = {}
    scaler_std: dict[str, float] = {}
    encoder_categories: dict[str, list[str]] = {}

    for col in numeric_columns:
        series = pd.to_numeric(frame[col], errors="coerce").fillna(0.0)
        mean = float(series.mean())
        std = float(series.std(ddof=0))
        scaler_mean[col] = mean
        scaler_std[col] = std if std > 1e-9 else 1.0

    for col in categorical_columns:
        categories = sorted(frame[col].fillna("UNKNOWN").astype(str).unique().tolist())
        if not categories:
            categories = ["UNKNOWN"]
        encoder_categories[col] = categories

    encoded_feature_names = ["bias"]
    encoded_feature_names.extend(numeric_columns)
    for col in categorical_columns:
        encoded_feature_names.extend([f"{col}={category}" for category in encoder_categories[col]])

    return {
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "scaler_mean": scaler_mean,
        "scaler_std": scaler_std,
        "encoder_categories": encoder_categories,
        "encoded_feature_names": encoded_feature_names,
    }


def transform_features(frame: pd.DataFrame, preprocessor: dict) -> np.ndarray:
    """Transform tabular features using stored scaling and one-hot mappings."""
    if frame.empty:
        return np.zeros((0, len(preprocessor["encoded_feature_names"])), dtype=float)

    blocks = [np.ones((len(frame), 1), dtype=float)]

    for col in preprocessor["numeric_columns"]:
        values = pd.to_numeric(frame[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        mean = float(preprocessor["scaler_mean"][col])
        std = float(preprocessor["scaler_std"][col])
        scaled = (values - mean) / std
        blocks.append(scaled.reshape(-1, 1))

    for col in preprocessor["categorical_columns"]:
        values = frame[col].fillna("UNKNOWN").astype(str)
        for category in preprocessor["encoder_categories"][col]:
            one_hot = (values == category).to_numpy(dtype=float)
            blocks.append(one_hot.reshape(-1, 1))

    return np.hstack(blocks)


def fit_global_ridge_model(
    train_df: pd.DataFrame,
    target_column: str,
    preprocessor: dict,
    regularization: float = RIDGE_REGULARIZATION,
) -> dict:
    """Fit one global ridge-regression model over all entities combined."""
    x_matrix = transform_features(train_df, preprocessor)
    y_vector = pd.to_numeric(train_df[target_column], errors="coerce").fillna(0.0).to_numpy(dtype=float)

    if x_matrix.shape[0] == 0:
        raise ValueError("Training matrix is empty; cannot fit global model.")

    gram = x_matrix.T @ x_matrix
    penalty = np.eye(gram.shape[0], dtype=float) * float(max(regularization, 0.0))
    penalty[0, 0] = 0.0

    weights = np.linalg.pinv(gram + penalty) @ x_matrix.T @ y_vector

    return {
        "weights": weights.tolist(),
        "regularization": float(regularization),
        "model_type": MODEL_LABEL,
    }


def predict_global_shareable(model_artifact: dict, preprocessor: dict, frame: pd.DataFrame) -> np.ndarray:
    """Predict shareable amount using the global model artifact."""
    if frame.empty:
        return np.array([], dtype=float)

    x_matrix = transform_features(frame, preprocessor)
    weights = np.asarray(model_artifact["weights"], dtype=float)
    predictions = x_matrix @ weights
    return np.clip(predictions, a_min=0.0, a_max=None)


def _default_registry_payload() -> dict:
    """Return empty registry skeleton."""
    return {
        "registry_schema_version": REGISTRY_SCHEMA_VERSION,
        "active_model_version": None,
        "model_versions": [],
    }


def _load_registry(registry_path: Path) -> dict:
    """Load model registry from disk, falling back to default structure."""
    if not registry_path.exists():
        return _default_registry_payload()

    try:
        with registry_path.open("r", encoding="utf-8") as file_obj:
            payload = json.load(file_obj)
    except (OSError, json.JSONDecodeError):
        return _default_registry_payload()

    if not isinstance(payload, dict):
        return _default_registry_payload()

    payload.setdefault("registry_schema_version", REGISTRY_SCHEMA_VERSION)
    payload.setdefault("active_model_version", None)
    payload.setdefault("model_versions", [])
    return payload


def _persist_registry(registry_path: Path, registry_payload: dict) -> None:
    """Persist registry payload to JSON."""
    _write_json(registry_path, registry_payload)


def _refresh_registry_status(registry_payload: dict) -> dict:
    """Refresh active/archived status labels in registry entries."""
    active_version = registry_payload.get("active_model_version")
    for entry in registry_payload.get("model_versions", []):
        entry["status"] = "active" if entry.get("version") == active_version else "archived"
    return registry_payload


def register_model_version(
    registry_path: Path,
    model_version: str,
    artifact_dir: Path,
    metadata_path: Path,
    training_date: str,
    activate_version: bool = True,
    inactive_status: str = "archived",
) -> dict:
    """Register a model version and optionally mark it active."""
    registry_payload = _load_registry(registry_path)
    versions = registry_payload.get("model_versions", [])

    matching_entry = next((entry for entry in versions if entry.get("version") == model_version), None)
    if matching_entry is None:
        matching_entry = {
            "version": model_version,
            "created_at": training_date,
            "artifact_dir": str(artifact_dir),
            "metadata_path": str(metadata_path),
            "status": inactive_status,
        }
        versions.append(matching_entry)
    else:
        matching_entry["artifact_dir"] = str(artifact_dir)
        matching_entry["metadata_path"] = str(metadata_path)
        matching_entry.setdefault("created_at", training_date)

    registry_payload["model_versions"] = versions
    if activate_version:
        registry_payload["active_model_version"] = model_version
        _refresh_registry_status(registry_payload)
    else:
        matching_entry["status"] = inactive_status

    _persist_registry(registry_path, registry_payload)
    return registry_payload


def set_active_model_version(registry_path: Path, model_version: str) -> dict:
    """Set any registered model version as active."""
    registry_payload = _load_registry(registry_path)
    versions = [entry.get("version") for entry in registry_payload.get("model_versions", [])]
    if model_version not in versions:
        raise ValueError(f"Model version not found in registry: {model_version}")

    registry_payload["active_model_version"] = model_version
    _refresh_registry_status(registry_payload)
    _persist_registry(registry_path, registry_payload)
    return registry_payload


def rollback_active_model_version(registry_path: Path, target_version: str | None = None) -> str:
    """Rollback active model to previous (or explicitly requested) version."""
    registry_payload = _load_registry(registry_path)
    version_entries = registry_payload.get("model_versions", [])
    versions = [entry.get("version") for entry in version_entries]

    if not versions:
        raise ValueError("No model versions available for rollback.")

    if target_version is not None:
        if target_version not in versions:
            raise ValueError(f"Target rollback version not found: {target_version}")
        chosen_version = target_version
    else:
        active = registry_payload.get("active_model_version")
        if active not in versions:
            raise ValueError("Active model version not found in registry.")
        active_idx = versions.index(active)
        if active_idx == 0:
            raise ValueError("No previous model version available for rollback.")
        chosen_version = versions[active_idx - 1]

    set_active_model_version(registry_path, chosen_version)
    return chosen_version


def save_model_artifacts(
    base_dir: str,
    model_version: str,
    model_artifact: dict,
    preprocessor: dict,
    metadata: dict,
    activate_version: bool = True,
    inactive_registry_status: str = "archived",
) -> dict:
    """Save model weights, preprocessing artifacts, metadata, and registry."""
    artifact_root = _resolve_artifact_root()
    version_dir = artifact_root / model_version
    version_dir.mkdir(parents=True, exist_ok=True)

    model_path = version_dir / "model.npz"
    np.savez_compressed(
        model_path,
        weights=np.asarray(model_artifact["weights"], dtype=float),
        regularization=np.asarray([model_artifact.get("regularization", RIDGE_REGULARIZATION)], dtype=float),
    )

    scaler_path = version_dir / "scaler.json"
    _write_json(
        scaler_path,
        {
            "numeric_columns": preprocessor["numeric_columns"],
            "mean": preprocessor["scaler_mean"],
            "std": preprocessor["scaler_std"],
        },
    )

    encoder_path = version_dir / "encoder.json"
    _write_json(
        encoder_path,
        {
            "categorical_columns": preprocessor["categorical_columns"],
            "categories": preprocessor["encoder_categories"],
        },
    )

    preprocessing_path = version_dir / "preprocessing.json"
    _write_json(
        preprocessing_path,
        {
            "encoded_feature_names": preprocessor["encoded_feature_names"],
            "input_feature_columns": preprocessor["categorical_columns"] + preprocessor["numeric_columns"],
            "transform": "standard_scale_numeric_plus_one_hot_categorical",
        },
    )

    metadata_path = version_dir / "metadata.json"
    _write_json(metadata_path, metadata)

    registry_path = artifact_root / "registry.json"
    register_model_version(
        registry_path=registry_path,
        model_version=model_version,
        artifact_dir=version_dir,
        metadata_path=metadata_path,
        training_date=metadata["training_date"],
        activate_version=activate_version,
        inactive_status=inactive_registry_status,
    )

    return {
        "model_version": model_version,
        "artifact_root": str(artifact_root),
        "artifact_dir": str(version_dir),
        "model_path": str(model_path),
        "scaler_path": str(scaler_path),
        "encoder_path": str(encoder_path),
        "preprocessing_path": str(preprocessing_path),
        "metadata_path": str(metadata_path),
        "registry_path": str(registry_path),
    }


def train_global_shareable_model(dataset: dict, model_version: str) -> dict:
    """Train one global model and produce both validation and inference predictions."""
    train_df = dataset["train"].copy()
    test_df = dataset["test"].copy()
    inference_df = dataset["inference"].copy()

    if train_df.empty:
        raise ValueError("Global train split is empty. Cannot fit model.")

    target_column = dataset["target_column"]
    categorical_columns = dataset["categorical_columns"]
    numeric_columns = dataset["numeric_columns"]

    preprocessor = fit_preprocessor(
        frame=train_df,
        categorical_columns=categorical_columns,
        numeric_columns=numeric_columns,
    )
    model_artifact = fit_global_ridge_model(
        train_df=train_df,
        target_column=target_column,
        preprocessor=preprocessor,
    )

    test_predictions = test_df.copy()
    test_predictions["prediction_shareable_amount"] = predict_global_shareable(
        model_artifact,
        preprocessor,
        test_df,
    )

    inference_predictions = inference_df.copy()
    inference_predictions["prediction_shareable_amount"] = predict_global_shareable(
        model_artifact,
        preprocessor,
        inference_df,
    )

    global_mae = mae_score(
        test_predictions[target_column],
        test_predictions["prediction_shareable_amount"],
    )

    training_date = datetime.now(timezone.utc).isoformat()
    metadata = {
        "training_date": training_date,
        "schema_version": MODEL_SCHEMA_VERSION,
        "model_version": model_version,
        "model_type": MODEL_LABEL,
        "feature_list": categorical_columns + numeric_columns,
        "encoded_feature_count": len(preprocessor["encoded_feature_names"]),
        "target_definition": TARGET_DEFINITION,
        "horizon_days": dataset["horizon_days"],
        "buffer_days": dataset["buffer_days"],
        "share_ratio": dataset["share_ratio"],
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "global_validation_mae": float(global_mae),
    }

    return {
        "model_artifact": model_artifact,
        "preprocessor": preprocessor,
        "metadata": metadata,
        "test_predictions": test_predictions,
        "inference_predictions": inference_predictions,
        "global_mae": global_mae,
    }


def build_forecast_results_per_hospital(
    test_predictions: pd.DataFrame,
    target_column: str,
    model_version: str,
) -> dict:
    """Build compatibility structure expected by existing API service layer."""
    results: dict[str, dict] = {}
    if test_predictions.empty:
        return results

    grouped = test_predictions.groupby(["healthcare_id", "medicine_name"], sort=True)
    for (healthcare_id, medicine_name), group_df in grouped:
        pred_df = group_df[["date", target_column, "prediction_shareable_amount"]].copy()
        pred_df = pred_df.rename(
            columns={
                "date": "ds",
                target_column: "y_actual",
                "prediction_shareable_amount": "y_pred",
            }
        )
        pred_df = pred_df.sort_values("ds").reset_index(drop=True)

        entry = {
            "predictions": pred_df,
            "mae": mae_score(pred_df["y_actual"], pred_df["y_pred"]),
            "model": MODEL_LABEL,
            "model_version": model_version,
        }
        results.setdefault(str(healthcare_id), {})[str(medicine_name)] = entry

    return results


def build_sharing_dataframe_per_hospital(
    inference_predictions: pd.DataFrame,
    horizon_days: int,
) -> dict:
    """Build per-hospital shareable output tables for callback compatibility."""
    if inference_predictions.empty:
        return {}

    df = inference_predictions.copy()
    df["predicted_demand"] = (df["rolling_mean_7"] * float(horizon_days)).clip(lower=0.0)
    df["adjusted_demand"] = (df["predicted_demand"] + df["demand_uncertainty"]).clip(lower=0.0)
    df["current_stock"] = df["current_stock_estimate"].clip(lower=0.0)
    df["shareable_amount"] = df["prediction_shareable_amount"].clip(lower=0.0)
    df["restock_alert"] = (df["current_stock"] < (df["adjusted_demand"] + df["safety_buffer"])) | (
        df["shareable_amount"] <= 0.0
    )

    df["predicted_demand"] = df["predicted_demand"].round(2)
    df["adjusted_demand"] = df["adjusted_demand"].round(2)
    df["current_stock"] = df["current_stock"].round(2)
    df["shareable_amount"] = df["shareable_amount"].round(2)

    out_columns = [
        "medicine_name",
        "predicted_demand",
        "adjusted_demand",
        "current_stock",
        "shareable_amount",
        "restock_alert",
    ]

    sharing_per_hospital: dict[str, pd.DataFrame] = {}
    for healthcare_id, hospital_df in df.groupby("healthcare_id", sort=True):
        out = hospital_df[out_columns].copy().sort_values("medicine_name").reset_index(drop=True)
        sharing_per_hospital[str(healthcare_id)] = out

    return sharing_per_hospital


def plot_sample_medicine(
    results: dict,
    medicine_name: str | None = None,
    output_path: str = "sample_forecast.png",
) -> str:
    """Plot actual vs predicted shareable amount for one sample medicine."""
    if not results:
        raise ValueError("Results dictionary is empty. Nothing to plot.")

    sample_name = medicine_name if medicine_name in results else sorted(results.keys())[0]
    sample_df = results[sample_name]["predictions"]
    model_name = results[sample_name].get("model", "unknown")
    sample_mae = results[sample_name].get("mae", np.nan)

    plt.figure(figsize=(10, 5))
    plt.plot(sample_df["ds"], sample_df["y_actual"], marker="o", label="Actual shareable")
    plt.plot(sample_df["ds"], sample_df["y_pred"], marker="o", label="Predicted shareable")
    if pd.notna(sample_mae):
        title_suffix = f" | model={model_name}, MAE={sample_mae:.2f}"
    else:
        title_suffix = f" | model={model_name}"
    plt.title(f"Global Model Shareable Prediction: {sample_name}{title_suffix}")
    plt.xlabel("Date")
    plt.ylabel("Shareable Amount")
    plt.grid(alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()

    return sample_name


def plot_per_hospital_samples(all_results: dict, output_dir: Path) -> dict:
    """Save one sample actual-vs-predicted plot per hospital."""
    output_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: dict[str, str] = {}

    for hospital_id, hospital_results in all_results.items():
        if not hospital_results:
            continue

        sample_medicine = max(
            hospital_results,
            key=lambda med: float(hospital_results[med]["predictions"]["y_actual"].sum()),
        )
        file_name = f"{hospital_id}_{sample_medicine.replace(' ', '_').replace('/', '-')}.png"
        plot_path = output_dir / file_name
        plot_sample_medicine(
            hospital_results,
            medicine_name=sample_medicine,
            output_path=str(plot_path),
        )
        saved_paths[hospital_id] = str(plot_path)

    return saved_paths


def clear_existing_plots(output_dir: Path) -> int:
    """Remove old PNG plots before writing a fresh model run set."""
    if not output_dir.exists():
        return 0

    removed = 0
    for plot_file in output_dir.glob("*.png"):
        plot_file.unlink(missing_ok=True)
        removed += 1
    return removed


def run_pipeline(base_dir: str = ".", test_days: int = 7) -> dict:
    """Train one global shareable model and emit existing pipeline output contract."""
    dataset = prepare_hrsp_global_shareable_data(
        base_dir=base_dir,
        horizon_days=test_days,
        test_days=test_days,
    )

    model_version = _build_model_version()
    training_output = train_global_shareable_model(dataset=dataset, model_version=model_version)

    artifact_paths = save_model_artifacts(
        base_dir=base_dir,
        model_version=model_version,
        model_artifact=training_output["model_artifact"],
        preprocessor=training_output["preprocessor"],
        metadata=training_output["metadata"],
    )

    forecast_results = build_forecast_results_per_hospital(
        test_predictions=training_output["test_predictions"],
        target_column=dataset["target_column"],
        model_version=model_version,
    )
    sharing_dataframes = build_sharing_dataframe_per_hospital(
        inference_predictions=training_output["inference_predictions"],
        horizon_days=dataset["horizon_days"],
    )

    graph_dir = Path(base_dir) / "graphs"
    clear_existing_plots(graph_dir)
    graph_paths = plot_per_hospital_samples(forecast_results, graph_dir)

    registry_path = Path(artifact_paths["registry_path"])
    registry_payload = _load_registry(registry_path)

    return {
        "forecast_results_per_hospital": forecast_results,
        "sharing_dataframe_per_hospital": sharing_dataframes,
        "graph_paths": graph_paths,
        "model_artifacts": artifact_paths,
        "model_registry": {
            "registry_path": str(registry_path),
            "active_model_version": registry_payload.get("active_model_version"),
            "available_versions": [
                entry.get("version") for entry in registry_payload.get("model_versions", [])
            ],
        },
    }


if __name__ == "__main__":
    run_pipeline(base_dir=".", test_days=7)
