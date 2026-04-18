from pathlib import Path

from model2.pipeline import run_outbreak_pipeline, run_outbreak_pipeline_with_neighbors


def test_run_outbreak_pipeline_returns_standardized_rows(tmp_path: Path):
    (tmp_path / "sales.csv").write_text(
        "date,healthcare_id,medicine_name,quantity_sold,upazila\n"
        "2024-01-01,PH001,Paracetamol,10,Joypurhat Sadar\n"
        "2024-01-01,PH002,Paracetamol,9,Akkelpur\n"
        "2024-01-02,PH001,Paracetamol,25,Joypurhat Sadar\n"
        "2024-01-02,PH002,Paracetamol,11,Akkelpur\n",
        encoding="utf-8",
    )
    (tmp_path / "healthcares.csv").write_text(
        "healthcare_id,upazila,lat,lon\n"
        "PH001,Joypurhat Sadar,24.9,89.0\n"
        "PH002,Akkelpur,24.95,89.04\n",
        encoding="utf-8",
    )
    (tmp_path / "medicines.csv").write_text(
        "medicine_name,base_daily_sales,outbreak_multiplier,signals_disease\n"
        "Paracetamol,30,3.5,Fever/Flu\n",
        encoding="utf-8",
    )

    rows = run_outbreak_pipeline(str(tmp_path), graph_radius_km=12.0, sequence_length=2)

    assert len(rows) == 2
    assert set(rows[0].keys()) == {
        "healthcare_id",
        "upazila",
        "outbreak_probability",
        "outbreak_flag",
    }
    assert isinstance(rows[0]["outbreak_flag"], bool)
    assert 0.0 <= rows[0]["outbreak_probability"] <= 1.0
    assert (tmp_path / "graph_dataset.json").exists()


def test_run_outbreak_pipeline_with_neighbors_returns_neighbor_map(tmp_path: Path):
    (tmp_path / "sales.csv").write_text(
        "date,healthcare_id,medicine_name,quantity_sold,upazila\n"
        "2024-01-01,PH001,Paracetamol,10,Joypurhat Sadar\n"
        "2024-01-01,PH002,Paracetamol,9,Akkelpur\n"
        "2024-01-01,PH003,Paracetamol,5,Kalai\n"
        "2024-01-02,PH001,Paracetamol,25,Joypurhat Sadar\n"
        "2024-01-02,PH002,Paracetamol,11,Akkelpur\n"
        "2024-01-02,PH003,Paracetamol,6,Kalai\n",
        encoding="utf-8",
    )
    (tmp_path / "healthcares.csv").write_text(
        "healthcare_id,upazila,lat,lon\n"
        "PH001,Joypurhat Sadar,24.9000,89.0000\n"
        "PH002,Akkelpur,24.9040,89.0030\n"
        "PH003,Kalai,25.1500,89.3000\n",
        encoding="utf-8",
    )
    (tmp_path / "medicines.csv").write_text(
        "medicine_name,base_daily_sales,outbreak_multiplier,signals_disease\n"
        "Paracetamol,30,3.5,Fever/Flu\n",
        encoding="utf-8",
    )

    payload = run_outbreak_pipeline_with_neighbors(
        str(tmp_path),
        graph_radius_km=3.0,
        sequence_length=2,
    )

    assert set(payload.keys()) == {"results", "neighbors"}
    assert len(payload["results"]) == 3
    assert set(payload["neighbors"].keys()) == {"PH001", "PH002", "PH003"}

    assert len(payload["neighbors"]["PH001"]) == 1
    assert payload["neighbors"]["PH001"][0]["healthcare_id"] == "PH002"
    assert payload["neighbors"]["PH001"][0]["upazila"] == "Akkelpur"
    assert payload["neighbors"]["PH001"][0]["distance_km"] > 0

    assert len(payload["neighbors"]["PH002"]) == 1
    assert payload["neighbors"]["PH002"][0]["healthcare_id"] == "PH001"
    assert payload["neighbors"]["PH002"][0]["upazila"] == "Joypurhat Sadar"
    assert payload["neighbors"]["PH002"][0]["distance_km"] > 0
    assert payload["neighbors"]["PH001"][0]["distance_km"] == payload["neighbors"]["PH002"][0]["distance_km"]
    assert payload["neighbors"]["PH003"] == []


def test_run_outbreak_pipeline_with_neighbors_honors_max_neighbors(tmp_path: Path):
    (tmp_path / "sales.csv").write_text(
        "date,healthcare_id,medicine_name,quantity_sold,upazila\n"
        "2024-01-01,PH001,Paracetamol,10,Joypurhat Sadar\n"
        "2024-01-01,PH002,Paracetamol,9,Akkelpur\n"
        "2024-01-01,PH003,Paracetamol,7,Panchbibi\n"
        "2024-01-02,PH001,Paracetamol,11,Joypurhat Sadar\n"
        "2024-01-02,PH002,Paracetamol,8,Akkelpur\n"
        "2024-01-02,PH003,Paracetamol,6,Panchbibi\n",
        encoding="utf-8",
    )
    (tmp_path / "healthcares.csv").write_text(
        "healthcare_id,upazila,lat,lon\n"
        "PH001,Joypurhat Sadar,24.9000,89.0000\n"
        "PH002,Akkelpur,24.9015,89.0010\n"
        "PH003,Panchbibi,24.9030,89.0020\n",
        encoding="utf-8",
    )
    (tmp_path / "medicines.csv").write_text(
        "medicine_name,base_daily_sales,outbreak_multiplier,signals_disease\n"
        "Paracetamol,30,3.5,Fever/Flu\n",
        encoding="utf-8",
    )

    payload = run_outbreak_pipeline_with_neighbors(
        str(tmp_path),
        graph_radius_km=5.0,
        sequence_length=2,
        max_neighbors=1,
    )

    assert len(payload["neighbors"]["PH001"]) == 1
    assert len(payload["neighbors"]["PH002"]) == 1
    assert len(payload["neighbors"]["PH003"]) == 1
