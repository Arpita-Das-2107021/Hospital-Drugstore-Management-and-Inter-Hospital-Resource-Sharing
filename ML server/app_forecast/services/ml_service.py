import logging
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd

from model1.forecast_hrsp import (
    predict_global_shareable,
    run_pipeline,
    save_model_artifacts,
    train_global_shareable_model,
)
from model1.prepare_hrsp_data import prepare_hrsp_global_shareable_data

logger = logging.getLogger(__name__)


class MLService:
    def __init__(self, base_data_dir: Path, test_days: int = 7) -> None:
        self.base_data_dir = base_data_dir
        self.test_days = test_days

    def prepare_runtime_dataset(self, sales_csv_path: Path, runtime_dir: Path) -> Path:
        runtime_dir.mkdir(parents=True, exist_ok=True)

        target_sales = runtime_dir / "sales.csv"
        shutil.copy2(sales_csv_path, target_sales)

        # Existing pipeline expects these files to exist in the same base folder.
        for file_name in ["medicines.csv", "outbreaks_ground_truth.csv", "healthcares.csv"]:
            src = self.base_data_dir / file_name
            if not src.exists():
                raise FileNotFoundError(f"Required pipeline dependency not found: {src}")
            shutil.copy2(src, runtime_dir / file_name)

        return runtime_dir

    def prepare_runtime_dataset_from_inputs(
        self,
        sales_csv_path: Path,
        medicines_csv_path: Path,
        facilities_csv_path: Path,
        runtime_dir: Path,
    ) -> Path:
        """Prepare runtime folder from explicit request-provided files (v1 API)."""
        runtime_dir.mkdir(parents=True, exist_ok=True)

        shutil.copy2(sales_csv_path, runtime_dir / "sales.csv")
        shutil.copy2(medicines_csv_path, runtime_dir / "medicines.csv")
        shutil.copy2(facilities_csv_path, runtime_dir / "healthcares.csv")

        # Forecast pipeline still expects a disease CSV to exist; reuse static baseline.
        disease_src = self.base_data_dir / "outbreaks_ground_truth.csv"
        if not disease_src.exists():
            raise FileNotFoundError(f"Required pipeline dependency not found: {disease_src}")
        shutil.copy2(disease_src, runtime_dir / "outbreaks_ground_truth.csv")

        return runtime_dir

    def run_forecast(self, runtime_dir: Path) -> tuple[pd.DataFrame, list[dict]]:
        logger.info("Running ML pipeline in %s", runtime_dir)
        pipeline_output = run_pipeline(base_dir=str(runtime_dir), test_days=self.test_days)

        sharing_per_hospital = pipeline_output["sharing_dataframe_per_hospital"]
        rows: list[dict] = []

        for hospital_id, sharing_df in sharing_per_hospital.items():
            if sharing_df is None or sharing_df.empty:
                continue

            for _, row in sharing_df.iterrows():
                result_row = {
                    "hospital_id": str(hospital_id),
                    "medicine_name": str(row["medicine_name"]),
                    "shareable_quantity": int(round(float(row["shareable_amount"]))),
                    "restock": bool(row["restock_alert"]),
                    # Placeholder for future model support.
                    "restock_amount": None,
                    "alert": bool(row["restock_alert"]),
                }
                rows.append(result_row)

        result_df = pd.DataFrame(rows)
        if result_df.empty:
            result_df = pd.DataFrame(
                columns=[
                    "hospital_id",
                    "medicine_name",
                    "shareable_quantity",
                    "restock",
                    "restock_amount",
                    "alert",
                ]
            )

        return result_df, rows

    @staticmethod
    def _confidence_score(predictions: pd.DataFrame, mae: float) -> float:
        if predictions is None or predictions.empty:
            return 0.0

        if "y_actual" in predictions.columns:
            anchor = float(predictions["y_actual"].mean())
        else:
            anchor = float(predictions["y_pred"].mean()) if "y_pred" in predictions.columns else 0.0

        anchor = max(anchor, 1.0)
        error = max(float(mae) if pd.notna(mae) else 0.0, 0.0)
        score = 1.0 - (error / (anchor + error + 1e-9))
        return round(float(min(max(score, 0.0), 1.0)), 4)

    def run_forecast_v1(self, runtime_dir: Path, prediction_horizon_days: int) -> tuple[pd.DataFrame, list[dict]]:
        """Run forecast pipeline and emit pure ML output rows for API v1 callback."""
        logger.info("Running ML v1 pipeline in %s", runtime_dir)
        pipeline_output = run_pipeline(base_dir=str(runtime_dir), test_days=prediction_horizon_days)

        forecast_per_hospital = pipeline_output.get("forecast_results_per_hospital", {})
        rows: list[dict] = []

        for facility_id, medicine_results in forecast_per_hospital.items():
            for resource_catalog_id, item in medicine_results.items():
                predictions = item.get("predictions", pd.DataFrame())
                predicted_demand = float(predictions["y_pred"].sum()) if not predictions.empty else 0.0
                predicted_demand = max(predicted_demand, 0.0)
                confidence_score = self._confidence_score(predictions, float(item.get("mae", 0.0)))

                rows.append(
                    {
                        "facility_id": str(facility_id),
                        "resource_catalog_id": str(resource_catalog_id),
                        "predicted_demand": round(predicted_demand, 4),
                        "confidence_score": confidence_score,
                    }
                )

        result_df = pd.DataFrame(rows)
        if result_df.empty:
            result_df = pd.DataFrame(
                columns=[
                    "facility_id",
                    "resource_catalog_id",
                    "predicted_demand",
                    "confidence_score",
                ]
            )

        return result_df, rows

    @staticmethod
    def _safe_float(value: object, default: float = 0.0) -> float:
        try:
            if value is None:
                return float(default)
            return float(value)
        except (TypeError, ValueError):
            return float(default)

    @staticmethod
    def _normalize_version_label(label: str | None, prefix: str) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        suffix = uuid4().hex[:8]
        if not label:
            return f"{prefix}-v{timestamp}-{suffix}"

        cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in label.strip())
        cleaned = "-".join(part for part in cleaned.split("-") if part).lower()
        if not cleaned:
            return f"{prefix}-v{timestamp}-{suffix}"
        return f"{prefix}-{cleaned}-v{timestamp}-{suffix}"

    def _load_model1_artifacts(self, artifact_uri: str) -> tuple[dict, dict, dict]:
        artifact_dir = Path(artifact_uri)
        if artifact_dir.is_file():
            artifact_dir = artifact_dir.parent

        model_path = artifact_dir / "model.npz"
        scaler_path = artifact_dir / "scaler.json"
        encoder_path = artifact_dir / "encoder.json"
        preprocessing_path = artifact_dir / "preprocessing.json"
        metadata_path = artifact_dir / "metadata.json"

        if not model_path.exists():
            raise FileNotFoundError(f"Model artifact not found: {model_path}")

        model_npz = np.load(model_path)
        weights = model_npz["weights"].astype(float).tolist()
        regularization = float(model_npz.get("regularization", np.asarray([1.0], dtype=float))[0])

        scaler_payload = json.loads(scaler_path.read_text(encoding="utf-8"))
        encoder_payload = json.loads(encoder_path.read_text(encoding="utf-8"))
        preprocessing_payload = (
            json.loads(preprocessing_path.read_text(encoding="utf-8"))
            if preprocessing_path.exists()
            else {}
        )
        metadata_payload = (
            json.loads(metadata_path.read_text(encoding="utf-8"))
            if metadata_path.exists()
            else {}
        )

        numeric_columns = list(scaler_payload.get("numeric_columns", []))
        categorical_columns = list(encoder_payload.get("categorical_columns", []))

        encoded_feature_names = preprocessing_payload.get("encoded_feature_names")
        if not encoded_feature_names:
            encoded_feature_names = ["bias", *numeric_columns]
            for col in categorical_columns:
                categories = encoder_payload.get("categories", {}).get(col, [])
                encoded_feature_names.extend([f"{col}={category}" for category in categories])

        preprocessor = {
            "numeric_columns": numeric_columns,
            "categorical_columns": categorical_columns,
            "scaler_mean": scaler_payload.get("mean", {}),
            "scaler_std": scaler_payload.get("std", {}),
            "encoder_categories": encoder_payload.get("categories", {}),
            "encoded_feature_names": encoded_feature_names,
        }
        model_artifact = {
            "weights": weights,
            "regularization": regularization,
            "model_type": metadata_payload.get("model_type", "global_shareable_ridge"),
        }

        return model_artifact, preprocessor, metadata_payload

    def _rows_to_feature_frame(self, rows: list[dict], preprocessor: dict) -> pd.DataFrame:
        categorical_columns = list(preprocessor.get("categorical_columns", []))
        numeric_columns = list(preprocessor.get("numeric_columns", []))

        prepared_rows: list[dict] = []
        for row in rows:
            feature_map = dict(row.get("features") or {})
            feature_map.setdefault("healthcare_id", row.get("facility_id", "UNKNOWN"))
            feature_map.setdefault("medicine_name", row.get("resource_catalog_id", "UNKNOWN"))
            feature_map.setdefault("upazila", "UNKNOWN")
            feature_map.setdefault("signals_disease", "Unknown")

            normalized: dict[str, object] = {}
            for col in categorical_columns:
                normalized[col] = str(feature_map.get(col, "UNKNOWN"))
            for col in numeric_columns:
                normalized[col] = self._safe_float(feature_map.get(col), 0.0)

            prepared_rows.append(normalized)

        if not prepared_rows:
            return pd.DataFrame(columns=[*categorical_columns, *numeric_columns])

        frame = pd.DataFrame(prepared_rows)
        ordered_columns = [*categorical_columns, *numeric_columns]
        for col in ordered_columns:
            if col not in frame.columns:
                frame[col] = 0.0 if col in numeric_columns else "UNKNOWN"

        return frame[ordered_columns]

    def run_forecast_json_inference(
        self,
        rows: list[dict],
        artifact_uri: str,
    ) -> tuple[pd.DataFrame, list[dict]]:
        model_artifact, preprocessor, metadata = self._load_model1_artifacts(artifact_uri)
        features_df = self._rows_to_feature_frame(rows, preprocessor)
        predictions = predict_global_shareable(model_artifact, preprocessor, features_df)

        global_mae = self._safe_float(metadata.get("global_validation_mae"), 0.0)
        anchor = max(float(np.mean(predictions)) if len(predictions) else 1.0, 1.0)
        confidence = round(float(min(max(1.0 - (global_mae / (anchor + global_mae + 1e-9)), 0.0), 1.0)), 4)

        result_rows: list[dict] = []
        for idx, row in enumerate(rows):
            predicted = float(predictions[idx]) if idx < len(predictions) else 0.0
            result_rows.append(
                {
                    "facility_id": str(row.get("facility_id", "")),
                    "resource_catalog_id": str(row.get("resource_catalog_id", "")),
                    "predicted_demand": round(max(predicted, 0.0), 4),
                    "confidence_score": confidence,
                }
            )

        result_df = pd.DataFrame(result_rows)
        if result_df.empty:
            result_df = pd.DataFrame(
                columns=[
                    "facility_id",
                    "resource_catalog_id",
                    "predicted_demand",
                    "confidence_score",
                ]
            )

        return result_df, result_rows

    def train_global_model_from_csv(
        self,
        runtime_dir: Path,
        requested_version_label: str | None,
        training_params: dict[str, object] | None = None,
    ) -> dict:
        params = dict(training_params or {})
        horizon_days = max(int(self._safe_float(params.get("horizon_days"), self.test_days)), 1)
        test_days = max(int(self._safe_float(params.get("test_days"), self.test_days)), 1)
        buffer_days = max(int(self._safe_float(params.get("buffer_days"), 3)), 0)
        share_ratio = self._safe_float(params.get("share_ratio"), 0.8)
        share_ratio = min(max(share_ratio, 0.0), 1.0)

        model_version = self._normalize_version_label(requested_version_label, "model1-global-shareable")

        dataset = prepare_hrsp_global_shareable_data(
            base_dir=str(runtime_dir),
            horizon_days=horizon_days,
            test_days=test_days,
            buffer_days=buffer_days,
            share_ratio=share_ratio,
        )
        training_output = train_global_shareable_model(dataset=dataset, model_version=model_version)

        metadata = dict(training_output["metadata"])
        metadata["training_params"] = {
            "horizon_days": horizon_days,
            "test_days": test_days,
            "buffer_days": buffer_days,
            "share_ratio": share_ratio,
            **{k: v for k, v in params.items() if k not in {"horizon_days", "test_days", "buffer_days", "share_ratio"}},
        }
        metadata["requested_version_label"] = requested_version_label
        metadata["workflow"] = "training"

        artifacts = save_model_artifacts(
            base_dir=str(runtime_dir),
            model_version=model_version,
            model_artifact=training_output["model_artifact"],
            preprocessor=training_output["preprocessor"],
            metadata=metadata,
            activate_version=False,
            inactive_registry_status="trained",
        )

        return {
            **artifacts,
            "global_validation_mae": float(training_output["global_mae"]),
            "horizon_days": horizon_days,
            "test_days": test_days,
        }
