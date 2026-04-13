import json
from pathlib import Path

import pandas as pd

from model1.forecast_hrsp import rollback_active_model_version, run_pipeline


def _write_global_training_inputs(base_dir: Path) -> None:
    healthcares = pd.DataFrame(
        [
            {
                "healthcare_id": "H1",
                "name": "Facility 1",
                "upazila": "Upazila-A",
                "lat": 23.71,
                "lon": 90.41,
            },
            {
                "healthcare_id": "H2",
                "name": "Facility 2",
                "upazila": "Upazila-B",
                "lat": 23.72,
                "lon": 90.42,
            },
        ]
    )
    medicines = pd.DataFrame(
        [
            {
                "medicine_name": "Med-A",
                "base_daily_sales": 12,
                "outbreak_multiplier": 2.5,
                "signals_disease": "Fever",
            },
            {
                "medicine_name": "Med-B",
                "base_daily_sales": 8,
                "outbreak_multiplier": 1.8,
                "signals_disease": "Respiratory",
            },
        ]
    )
    outbreaks = pd.DataFrame(
        [
            {
                "disease": "Seasonal Flu",
                "start_day": 5,
                "end_day": 15,
                "upazilas": "Upazila-A|Upazila-B",
                "medicines": "Med-A|Med-B",
            }
        ]
    )

    sales_rows = []
    all_dates = pd.date_range("2024-01-01", periods=32, freq="D")
    for day_idx, day in enumerate(all_dates, start=1):
        for facility in ["H1", "H2"]:
            for medicine in ["Med-A", "Med-B"]:
                facility_bias = 2 if facility == "H2" else 0
                medicine_bias = 3 if medicine == "Med-A" else 1
                outbreak_boost = 2 if 5 <= day_idx <= 15 and medicine == "Med-A" else 0
                quantity = 10 + (day_idx % 4) + facility_bias + medicine_bias + outbreak_boost
                sales_rows.append(
                    {
                        "date": day.strftime("%Y-%m-%d"),
                        "healthcare_id": facility,
                        "medicine_name": medicine,
                        "quantity_sold": quantity,
                        "upazila": "Upazila-A" if facility == "H1" else "Upazila-B",
                    }
                )

    sales = pd.DataFrame(sales_rows)

    sales.to_csv(base_dir / "sales.csv", index=False)
    medicines.to_csv(base_dir / "medicines.csv", index=False)
    healthcares.to_csv(base_dir / "healthcares.csv", index=False)
    outbreaks.to_csv(base_dir / "outbreaks_ground_truth.csv", index=False)


def test_run_pipeline_trains_global_model_and_saves_artifacts(tmp_path: Path, monkeypatch):
    _write_global_training_inputs(tmp_path)
    monkeypatch.setenv("MODEL1_ARTIFACT_DIR", str(tmp_path / "model1_artifacts_store"))

    output = run_pipeline(base_dir=str(tmp_path), test_days=5)

    assert "sharing_dataframe_per_hospital" in output
    assert "forecast_results_per_hospital" in output
    assert "model_artifacts" in output
    assert "model_registry" in output

    sharing = output["sharing_dataframe_per_hospital"]
    assert set(sharing.keys()) == {"H1", "H2"}

    required_cols = {
        "medicine_name",
        "predicted_demand",
        "adjusted_demand",
        "current_stock",
        "shareable_amount",
        "restock_alert",
    }
    for hospital_df in sharing.values():
        assert required_cols.issubset(set(hospital_df.columns))
        assert (hospital_df["shareable_amount"] >= 0).all()

    artifacts = output["model_artifacts"]
    for key in [
        "model_path",
        "scaler_path",
        "encoder_path",
        "preprocessing_path",
        "metadata_path",
        "registry_path",
    ]:
        assert Path(artifacts[key]).exists()

    metadata = json.loads(Path(artifacts["metadata_path"]).read_text(encoding="utf-8"))
    assert metadata["model_version"] == artifacts["model_version"]
    assert "shareable" in metadata["target_definition"].lower()


def test_model_registry_supports_rollback(tmp_path: Path, monkeypatch):
    _write_global_training_inputs(tmp_path)
    monkeypatch.setenv("MODEL1_ARTIFACT_DIR", str(tmp_path / "model1_artifacts_store"))

    first_output = run_pipeline(base_dir=str(tmp_path), test_days=5)
    second_output = run_pipeline(base_dir=str(tmp_path), test_days=5)

    first_version = first_output["model_artifacts"]["model_version"]
    second_version = second_output["model_artifacts"]["model_version"]
    assert first_version != second_version

    registry_path = Path(second_output["model_artifacts"]["registry_path"])
    registry_before = json.loads(registry_path.read_text(encoding="utf-8"))
    assert registry_before["active_model_version"] == second_version

    rolled_back_version = rollback_active_model_version(registry_path)
    assert rolled_back_version == first_version

    registry_after = json.loads(registry_path.read_text(encoding="utf-8"))
    assert registry_after["active_model_version"] == first_version
