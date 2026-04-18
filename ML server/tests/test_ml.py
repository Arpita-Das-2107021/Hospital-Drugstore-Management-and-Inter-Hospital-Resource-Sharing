from pathlib import Path

import pandas as pd

from app_forecast.services.ml_service import MLService


def test_run_forecast_maps_required_fields(monkeypatch):
    sharing_df = pd.DataFrame(
        {
            "medicine_name": ["Paracetamol"],
            "shareable_amount": [50.0],
            "restock_alert": [False],
        }
    )

    def fake_run_pipeline(base_dir: str, test_days: int):
        return {
            "sharing_dataframe_per_hospital": {
                "H1": sharing_df,
            }
        }

    monkeypatch.setattr("app_forecast.services.ml_service.run_pipeline", fake_run_pipeline)

    service = MLService(base_data_dir=Path("."), test_days=7)
    result_df, rows = service.run_forecast(Path("."))

    assert len(rows) == 1
    assert rows[0]["hospital_id"] == "H1"
    assert rows[0]["medicine_name"] == "Paracetamol"
    assert rows[0]["shareable_quantity"] == 50
    assert rows[0]["restock"] is False
    assert rows[0]["restock_amount"] is None
    assert rows[0]["alert"] is False

    assert list(result_df.columns) == [
        "hospital_id",
        "medicine_name",
        "shareable_quantity",
        "restock",
        "restock_amount",
        "alert",
    ]


def test_run_forecast_v1_maps_pure_ml_fields(monkeypatch):
    pred_df = pd.DataFrame(
        {
            "ds": pd.to_datetime(["2024-01-01", "2024-01-02"]),
            "y_actual": [100.0, 120.0],
            "y_pred": [110.0, 130.0],
        }
    )

    def fake_run_pipeline(base_dir: str, test_days: int):
        return {
            "forecast_results_per_hospital": {
                "F001": {
                    "MED001": {
                        "predictions": pred_df,
                        "mae": 12.0,
                    }
                }
            }
        }

    monkeypatch.setattr("app_forecast.services.ml_service.run_pipeline", fake_run_pipeline)

    service = MLService(base_data_dir=Path("."), test_days=7)
    result_df, rows = service.run_forecast_v1(Path("."), prediction_horizon_days=14)

    assert len(rows) == 1
    assert rows[0]["facility_id"] == "F001"
    assert rows[0]["resource_catalog_id"] == "MED001"
    assert rows[0]["predicted_demand"] == 240.0
    assert 0.0 <= rows[0]["confidence_score"] <= 1.0
    assert list(result_df.columns) == [
        "facility_id",
        "resource_catalog_id",
        "predicted_demand",
        "confidence_score",
    ]


def test_prepare_runtime_dataset_from_inputs_copies_files(tmp_path: Path):
    source_sales = tmp_path / "source_sales.csv"
    source_sales.write_text("date,healthcare_id,medicine_name,quantity_sold,upazila\n", encoding="utf-8")
    source_medicines = tmp_path / "source_medicines.csv"
    source_medicines.write_text("medicine_name,base_daily_sales\n", encoding="utf-8")
    source_facilities = tmp_path / "source_facilities.csv"
    source_facilities.write_text("healthcare_id,upazila,lat,lon\n", encoding="utf-8")

    base_data = tmp_path / "base_data"
    base_data.mkdir()
    (base_data / "outbreaks_ground_truth.csv").write_text("start_day,end_day,upazilas\n", encoding="utf-8")

    service = MLService(base_data_dir=base_data, test_days=7)
    prepared = service.prepare_runtime_dataset_from_inputs(
        source_sales,
        source_medicines,
        source_facilities,
        tmp_path / "runtime",
    )

    assert (prepared / "sales.csv").exists()
    assert (prepared / "medicines.csv").exists()
    assert (prepared / "healthcares.csv").exists()
    assert (prepared / "outbreaks_ground_truth.csv").exists()
