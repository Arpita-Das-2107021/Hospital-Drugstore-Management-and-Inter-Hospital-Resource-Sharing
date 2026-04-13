import logging
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd

from model2.pipeline import run_outbreak_pipeline, run_outbreak_pipeline_with_neighbors

logger = logging.getLogger(__name__)


class OutbreakMLService:
    def __init__(
        self,
        base_data_dir: Path,
        model_path: str,
        graph_radius_km: float,
        sequence_length: int,
    ) -> None:
        self.base_data_dir = base_data_dir
        self.model_path = model_path
        self.graph_radius_km = graph_radius_km
        self.sequence_length = sequence_length

    def prepare_runtime_dataset(self, sales_csv_path: Path, runtime_dir: Path) -> Path:
        runtime_dir.mkdir(parents=True, exist_ok=True)

        target_sales = runtime_dir / "sales.csv"
        shutil.copy2(sales_csv_path, target_sales)

        # Keep runtime data self-contained so the model can run from one input folder.
        required = ["healthcares.csv", "medicines.csv"]
        optional = ["outbreaks_ground_truth.csv"]

        for file_name in required:
            src = self.base_data_dir / file_name
            if not src.exists():
                raise FileNotFoundError(f"Required outbreak dependency not found: {src}")
            shutil.copy2(src, runtime_dir / file_name)

        for file_name in optional:
            src = self.base_data_dir / file_name
            if src.exists():
                shutil.copy2(src, runtime_dir / file_name)

        return runtime_dir

    def prepare_runtime_dataset_from_inputs(
        self,
        sales_csv_path: Path,
        facilities_csv_path: Path,
        runtime_dir: Path,
    ) -> Path:
        """Prepare outbreak runtime dataset from explicit v1 request inputs."""
        runtime_dir.mkdir(parents=True, exist_ok=True)

        shutil.copy2(sales_csv_path, runtime_dir / "sales.csv")
        shutil.copy2(facilities_csv_path, runtime_dir / "healthcares.csv")

        # Outbreak pipeline validates medicines.csv as required input.
        medicines_src = self.base_data_dir / "medicines.csv"
        if not medicines_src.exists():
            raise FileNotFoundError(f"Required outbreak dependency not found: {medicines_src}")
        shutil.copy2(medicines_src, runtime_dir / "medicines.csv")

        optional = self.base_data_dir / "outbreaks_ground_truth.csv"
        if optional.exists():
            shutil.copy2(optional, runtime_dir / "outbreaks_ground_truth.csv")

        return runtime_dir

    def run_outbreak(self, runtime_dir: Path) -> tuple[pd.DataFrame, list[dict]]:
        logger.info("Running outbreak pipeline in %s", runtime_dir)

        rows = run_outbreak_pipeline(
            input_dir=str(runtime_dir),
            model_path=self.model_path,
            graph_radius_km=self.graph_radius_km,
            sequence_length=self.sequence_length,
        )

        result_df = pd.DataFrame(rows)
        if result_df.empty:
            result_df = pd.DataFrame(
                columns=["healthcare_id", "upazila", "outbreak_probability", "outbreak_flag"]
            )

        return result_df, rows

    def run_outbreak_v1(
        self,
        runtime_dir: Path,
        max_neighbors: int,
    ) -> tuple[pd.DataFrame, list[dict], dict[str, list[dict]]]:
        """Run outbreak pipeline and emit pure ML outputs plus neighbor candidates."""
        logger.info("Running outbreak v1 pipeline in %s", runtime_dir)

        payload = run_outbreak_pipeline_with_neighbors(
            input_dir=str(runtime_dir),
            model_path=self.model_path,
            graph_radius_km=self.graph_radius_km,
            sequence_length=self.sequence_length,
            max_neighbors=max_neighbors,
        )

        result_rows = [
            {
                "facility_id": str(row["healthcare_id"]),
                "outbreak_probability": float(row["outbreak_probability"]),
                "outbreak_flag": bool(row["outbreak_flag"]),
            }
            for row in payload.get("results", [])
        ]

        neighbors: dict[str, list[dict]] = {}
        for facility_id, linked in payload.get("neighbors", {}).items():
            neighbors[str(facility_id)] = [
                {
                    "facility_id": str(item["healthcare_id"]),
                    "distance_km": float(item["distance_km"]),
                }
                for item in linked
            ]

        result_df = pd.DataFrame(result_rows)
        if result_df.empty:
            result_df = pd.DataFrame(columns=["facility_id", "outbreak_probability", "outbreak_flag"])

        return result_df, result_rows, neighbors

    @staticmethod
    def _safe_float(value: object, default: float = 0.0) -> float:
        try:
            if value is None:
                return float(default)
            return float(value)
        except (TypeError, ValueError):
            return float(default)

    @staticmethod
    def _sigmoid(value: float) -> float:
        clipped = float(np.clip(value, -8.0, 8.0))
        return float(1.0 / (1.0 + np.exp(-clipped)))

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

    def _load_model2_artifact(self, artifact_uri: str) -> dict:
        artifact_path = Path(artifact_uri)
        if artifact_path.is_file() and artifact_path.suffix == ".json":
            model_payload = json.loads(artifact_path.read_text(encoding="utf-8"))
            return {
                "trend_weight": self._safe_float(model_payload.get("trend_weight"), 1.2),
                "neighbor_weight": self._safe_float(model_payload.get("neighbor_weight"), 0.8),
                "outbreak_weight": self._safe_float(model_payload.get("outbreak_weight"), 0.5),
                "bias": self._safe_float(model_payload.get("bias"), 0.0),
                "threshold": min(max(self._safe_float(model_payload.get("threshold"), 0.5), 0.0), 1.0),
            }

        if artifact_path.is_file() and artifact_path.suffix != ".json":
            return {
                "trend_weight": 1.2,
                "neighbor_weight": 0.8,
                "outbreak_weight": 0.5,
                "bias": 0.0,
                "threshold": 0.5,
            }

        model_json_path = artifact_path / "model.json"
        if model_json_path.exists():
            model_payload = json.loads(model_json_path.read_text(encoding="utf-8"))
            return {
                "trend_weight": self._safe_float(model_payload.get("trend_weight"), 1.2),
                "neighbor_weight": self._safe_float(model_payload.get("neighbor_weight"), 0.8),
                "outbreak_weight": self._safe_float(model_payload.get("outbreak_weight"), 0.5),
                "bias": self._safe_float(model_payload.get("bias"), 0.0),
                "threshold": min(max(self._safe_float(model_payload.get("threshold"), 0.5), 0.0), 1.0),
            }

        return {
            "trend_weight": 1.2,
            "neighbor_weight": 0.8,
            "outbreak_weight": 0.5,
            "bias": 0.0,
            "threshold": 0.5,
        }

    def run_outbreak_json_inference(
        self,
        rows: list[dict],
        artifact_uri: str,
        max_neighbors: int,
        neighbors_input: dict[str, list[dict]] | None = None,
    ) -> tuple[pd.DataFrame, list[dict], dict[str, list[dict]]]:
        model_params = self._load_model2_artifact(artifact_uri)
        neighbors_payload = neighbors_input or {}

        result_rows: list[dict] = []
        neighbors: dict[str, list[dict]] = {}

        for row in rows:
            feature_map = dict(row.get("features") or {})
            facility_id = str(row.get("facility_id", ""))

            recent_avg_sales = self._safe_float(
                feature_map.get("recent_avg_sales", feature_map.get("recent_sales", 0.0)),
                0.0,
            )
            baseline_avg_sales = self._safe_float(
                feature_map.get("baseline_avg_sales", feature_map.get("baseline_sales", recent_avg_sales)),
                recent_avg_sales,
            )
            neighbor_trend_score = self._safe_float(
                feature_map.get("neighbor_trend_score", feature_map.get("neighbor_trend", 0.0)),
                0.0,
            )
            outbreak_signal = self._safe_float(feature_map.get("outbreak_signal", 0.0), 0.0)

            trend_score = (recent_avg_sales - baseline_avg_sales) / (baseline_avg_sales + 1.0)
            logit = (
                model_params["bias"]
                + (model_params["trend_weight"] * trend_score)
                + (model_params["neighbor_weight"] * neighbor_trend_score)
                + (model_params["outbreak_weight"] * outbreak_signal)
            )
            outbreak_probability = round(self._sigmoid(logit), 4)
            outbreak_flag = outbreak_probability >= float(model_params["threshold"])

            result_rows.append(
                {
                    "facility_id": facility_id,
                    "outbreak_probability": outbreak_probability,
                    "outbreak_flag": bool(outbreak_flag),
                }
            )

            raw_neighbors = neighbors_payload.get(facility_id, [])
            normalized_neighbors: list[dict] = []
            for item in raw_neighbors:
                target_facility = str(item.get("facility_id", item.get("healthcare_id", "")))
                distance_km = max(self._safe_float(item.get("distance_km"), 0.0), 0.0)
                normalized_neighbors.append(
                    {
                        "facility_id": target_facility,
                        "distance_km": round(distance_km, 4),
                    }
                )

            normalized_neighbors.sort(key=lambda entry: (entry["distance_km"], entry["facility_id"]))
            if max_neighbors > 0:
                normalized_neighbors = normalized_neighbors[:max_neighbors]
            neighbors[facility_id] = normalized_neighbors

        result_df = pd.DataFrame(result_rows)
        if result_df.empty:
            result_df = pd.DataFrame(columns=["facility_id", "outbreak_probability", "outbreak_flag"])

        return result_df, result_rows, neighbors

    def train_outbreak_model_from_csv(
        self,
        runtime_dir: Path,
        requested_version_label: str | None,
        training_params: dict[str, object] | None = None,
    ) -> dict:
        params = dict(training_params or {})
        trend_weight = self._safe_float(params.get("trend_weight"), 1.2)
        neighbor_weight = self._safe_float(params.get("neighbor_weight"), 0.8)
        outbreak_weight = self._safe_float(params.get("outbreak_weight"), 0.5)
        threshold = min(max(self._safe_float(params.get("threshold"), 0.5), 0.0), 1.0)
        recent_window_days = max(int(self._safe_float(params.get("recent_window_days"), 7)), 1)
        baseline_window_days = max(int(self._safe_float(params.get("baseline_window_days"), 14)), 1)

        sales_path = runtime_dir / "sales.csv"
        if not sales_path.exists():
            raise FileNotFoundError(f"Missing sales.csv for outbreak training: {sales_path}")

        sales_df = pd.read_csv(sales_path)
        required_cols = {"date", "healthcare_id", "quantity_sold"}
        if not required_cols.issubset(set(sales_df.columns)):
            missing = sorted(required_cols - set(sales_df.columns))
            raise ValueError(f"sales.csv is missing required columns for training: {missing}")

        sales_df["date"] = pd.to_datetime(sales_df["date"], errors="coerce")
        sales_df = sales_df.dropna(subset=["date"])
        sales_df["quantity_sold"] = pd.to_numeric(sales_df["quantity_sold"], errors="coerce").fillna(0.0)

        daily_totals = (
            sales_df.groupby(["date", "healthcare_id"], as_index=False)["quantity_sold"]
            .sum()
            .sort_values(["date", "healthcare_id"])
        )
        if daily_totals.empty:
            raise ValueError("No usable rows in sales.csv after preprocessing")

        pivot = daily_totals.pivot(index="date", columns="healthcare_id", values="quantity_sold").fillna(0.0)
        recent = pivot.tail(min(recent_window_days, len(pivot))).mean(axis=0)

        if len(pivot) > recent_window_days:
            baseline_source = pivot.iloc[:-recent_window_days]
        else:
            baseline_source = pivot

        baseline = baseline_source.tail(min(baseline_window_days, len(baseline_source))).mean(axis=0)
        trend_series = ((recent - baseline) / (baseline + 1.0)).replace([np.inf, -np.inf], 0.0).fillna(0.0)
        learned_bias = -float(trend_series.mean()) if len(trend_series) else 0.0
        bias = self._safe_float(params.get("bias"), learned_bias)

        model_version = self._normalize_version_label(requested_version_label, "model2-outbreak")

        artifact_root_override = os.environ.get("MODEL2_ARTIFACT_DIR")
        if artifact_root_override:
            artifact_root = Path(artifact_root_override)
        else:
            artifact_root = Path(__file__).resolve().parents[2] / "model2_artifacts"

        version_dir = artifact_root / model_version
        version_dir.mkdir(parents=True, exist_ok=True)

        model_payload = {
            "model_version": model_version,
            "trend_weight": trend_weight,
            "neighbor_weight": neighbor_weight,
            "outbreak_weight": outbreak_weight,
            "bias": bias,
            "threshold": threshold,
            "recent_window_days": recent_window_days,
            "baseline_window_days": baseline_window_days,
        }

        model_path = version_dir / "model.json"
        model_path.write_text(json.dumps(model_payload, indent=2, sort_keys=True), encoding="utf-8")

        metadata_payload = {
            "training_date": datetime.now(timezone.utc).isoformat(),
            "model_version": model_version,
            "workflow": "training",
            "rows_used": int(len(daily_totals)),
            "distinct_facilities": int(daily_totals["healthcare_id"].nunique()),
            "date_start": str(daily_totals["date"].min().date()),
            "date_end": str(daily_totals["date"].max().date()),
            "training_params": {
                "trend_weight": trend_weight,
                "neighbor_weight": neighbor_weight,
                "outbreak_weight": outbreak_weight,
                "threshold": threshold,
                "recent_window_days": recent_window_days,
                "baseline_window_days": baseline_window_days,
                **{
                    k: v
                    for k, v in params.items()
                    if k
                    not in {
                        "trend_weight",
                        "neighbor_weight",
                        "outbreak_weight",
                        "threshold",
                        "recent_window_days",
                        "baseline_window_days",
                        "bias",
                    }
                },
            },
        }

        metadata_path = version_dir / "metadata.json"
        metadata_path.write_text(json.dumps(metadata_payload, indent=2, sort_keys=True), encoding="utf-8")

        source_checkpoint = Path(self.model_path)
        checkpoint_copy_path = None
        if source_checkpoint.exists() and source_checkpoint.is_file():
            checkpoint_copy_path = version_dir / source_checkpoint.name
            shutil.copy2(source_checkpoint, checkpoint_copy_path)

        return {
            "model_version": model_version,
            "artifact_root": str(artifact_root),
            "artifact_dir": str(version_dir),
            "model_path": str(model_path),
            "metadata_path": str(metadata_path),
            "checkpoint_path": str(checkpoint_copy_path) if checkpoint_copy_path else None,
        }
