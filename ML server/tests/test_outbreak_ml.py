from pathlib import Path

import pandas as pd

from app_outbreak.services.ml_service import OutbreakMLService


def test_run_outbreak_maps_required_fields(monkeypatch):
    pipeline_rows = [
        {
            "healthcare_id": "PH001",
            "upazila": "Joypurhat Sadar",
            "outbreak_probability": 0.85,
            "outbreak_flag": True,
        }
    ]

    def fake_pipeline(input_dir: str, model_path: str, graph_radius_km: float, sequence_length: int):
        return pipeline_rows

    monkeypatch.setattr("app_outbreak.services.ml_service.run_outbreak_pipeline", fake_pipeline)

    service = OutbreakMLService(
        base_data_dir=Path("."),
        model_path="model2/models/stgnn_model.pt",
        graph_radius_km=10.0,
        sequence_length=7,
    )
    result_df, rows = service.run_outbreak(Path("."))

    assert len(rows) == 1
    assert rows[0]["healthcare_id"] == "PH001"
    assert rows[0]["upazila"] == "Joypurhat Sadar"
    assert rows[0]["outbreak_probability"] == 0.85
    assert rows[0]["outbreak_flag"] is True

    assert list(result_df.columns) == [
        "healthcare_id",
        "upazila",
        "outbreak_probability",
        "outbreak_flag",
    ]


def test_prepare_runtime_dataset_copies_required_files(tmp_path: Path):
    source_sales = tmp_path / "source_sales.csv"
    source_sales.write_text("date,healthcare_id,medicine_name,quantity_sold,upazila\n", encoding="utf-8")

    base_data = tmp_path / "base_data"
    base_data.mkdir()
    (base_data / "healthcares.csv").write_text("healthcare_id,upazila,lat,lon\n", encoding="utf-8")
    (base_data / "medicines.csv").write_text("medicine_name,signals_disease\n", encoding="utf-8")

    runtime_dir = tmp_path / "runtime"

    service = OutbreakMLService(
        base_data_dir=base_data,
        model_path="model2/models/stgnn_model.pt",
        graph_radius_km=10.0,
        sequence_length=7,
    )
    prepared = service.prepare_runtime_dataset(source_sales, runtime_dir)

    assert (prepared / "sales.csv").exists()
    assert (prepared / "healthcares.csv").exists()
    assert (prepared / "medicines.csv").exists()


def test_run_outbreak_v1_maps_required_fields(monkeypatch):
    pipeline_payload = {
        "results": [
            {
                "healthcare_id": "PH001",
                "upazila": "Joypurhat Sadar",
                "outbreak_probability": 0.85,
                "outbreak_flag": True,
            }
        ],
        "neighbors": {
            "PH001": [
                {
                    "healthcare_id": "PH002",
                    "upazila": "Akkelpur",
                    "distance_km": 1.2,
                }
            ]
        },
    }

    def fake_pipeline(
        input_dir: str,
        model_path: str,
        graph_radius_km: float,
        sequence_length: int,
        max_neighbors: int,
    ):
        return pipeline_payload

    monkeypatch.setattr(
        "app_outbreak.services.ml_service.run_outbreak_pipeline_with_neighbors",
        fake_pipeline,
    )

    service = OutbreakMLService(
        base_data_dir=Path("."),
        model_path="model2/models/stgnn_model.pt",
        graph_radius_km=10.0,
        sequence_length=7,
    )
    result_df, rows, neighbors = service.run_outbreak_v1(Path("."), max_neighbors=20)

    assert len(rows) == 1
    assert rows[0]["facility_id"] == "PH001"
    assert rows[0]["outbreak_probability"] == 0.85
    assert rows[0]["outbreak_flag"] is True
    assert neighbors == {"PH001": [{"facility_id": "PH002", "distance_km": 1.2}]}
    assert list(result_df.columns) == ["facility_id", "outbreak_probability", "outbreak_flag"]


def test_prepare_runtime_dataset_from_inputs_copies_required_files(tmp_path: Path):
    source_sales = tmp_path / "source_sales.csv"
    source_sales.write_text("date,healthcare_id,medicine_name,quantity_sold,upazila\n", encoding="utf-8")
    source_facilities = tmp_path / "source_facilities.csv"
    source_facilities.write_text("healthcare_id,upazila,lat,lon\n", encoding="utf-8")

    base_data = tmp_path / "base_data"
    base_data.mkdir()
    (base_data / "medicines.csv").write_text("medicine_name,signals_disease\n", encoding="utf-8")

    service = OutbreakMLService(
        base_data_dir=base_data,
        model_path="model2/models/stgnn_model.pt",
        graph_radius_km=10.0,
        sequence_length=7,
    )
    prepared = service.prepare_runtime_dataset_from_inputs(
        source_sales,
        source_facilities,
        tmp_path / "runtime_v1",
    )

    assert (prepared / "sales.csv").exists()
    assert (prepared / "healthcares.csv").exists()
    assert (prepared / "medicines.csv").exists()
