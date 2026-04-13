from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

REQUIRED_INPUT_FILES = ("sales.csv", "healthcares.csv", "medicines.csv")


def _sigmoid(values: pd.Series) -> pd.Series:
    clipped = np.clip(values.astype(float), -8.0, 8.0)
    return 1.0 / (1.0 + np.exp(-clipped))


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _ensure_required_files(root: Path) -> None:
    missing = [name for name in REQUIRED_INPUT_FILES if not (root / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"Missing outbreak input files in {root}: {', '.join(sorted(missing))}"
        )


def _load_inputs(root: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    _ensure_required_files(root)

    sales = pd.read_csv(root / "sales.csv")
    healthcares = pd.read_csv(root / "healthcares.csv")

    required_sales_columns = {"date", "healthcare_id", "medicine_name", "quantity_sold"}
    required_healthcare_columns = {"healthcare_id", "upazila", "lat", "lon"}

    if not required_sales_columns.issubset(sales.columns):
        missing = sorted(required_sales_columns - set(sales.columns))
        raise ValueError(f"sales.csv is missing columns: {missing}")

    if not required_healthcare_columns.issubset(healthcares.columns):
        missing = sorted(required_healthcare_columns - set(healthcares.columns))
        raise ValueError(f"healthcares.csv is missing columns: {missing}")

    sales = sales.copy()
    sales["date"] = pd.to_datetime(sales["date"], errors="coerce")
    sales = sales.dropna(subset=["date"])
    sales["quantity_sold"] = pd.to_numeric(sales["quantity_sold"], errors="coerce").fillna(0.0)

    healthcares = healthcares.copy()
    healthcares["lat"] = pd.to_numeric(healthcares["lat"], errors="coerce")
    healthcares["lon"] = pd.to_numeric(healthcares["lon"], errors="coerce")
    healthcares = healthcares.dropna(subset=["lat", "lon"])

    return sales, healthcares


def _build_edges(healthcares: pd.DataFrame, radius_km: float) -> tuple[list[str], list[dict]]:
    healthcares = healthcares.sort_values("healthcare_id").reset_index(drop=True)
    node_ids = healthcares["healthcare_id"].tolist()

    edges: list[dict] = []
    for i in range(len(healthcares)):
        for j in range(i + 1, len(healthcares)):
            row_i = healthcares.iloc[i]
            row_j = healthcares.iloc[j]
            distance = _haversine_km(row_i["lat"], row_i["lon"], row_j["lat"], row_j["lon"])
            if distance <= radius_km:
                edges.append(
                    {
                        "from_idx": i,
                        "to_idx": j,
                        "from_id": row_i["healthcare_id"],
                        "to_id": row_j["healthcare_id"],
                        "distance_km": round(distance, 3),
                    }
                )

    return node_ids, edges


def _build_neighbor_index(node_ids: list[str], edges: list[dict]) -> dict[str, list[dict]]:
    neighbors: dict[str, list[dict]] = {node_id: [] for node_id in node_ids}

    for edge in edges:
        from_id = str(edge["from_id"])
        to_id = str(edge["to_id"])
        distance_km = round(float(edge["distance_km"]), 3)

        neighbors.setdefault(from_id, []).append(
            {"healthcare_id": to_id, "distance_km": distance_km}
        )
        neighbors.setdefault(to_id, []).append(
            {"healthcare_id": from_id, "distance_km": distance_km}
        )

    for node_id in neighbors:
        neighbors[node_id] = sorted(
            neighbors[node_id],
            key=lambda item: (float(item["distance_km"]), str(item["healthcare_id"])),
        )

    return neighbors


def _neighbor_rows(
    node_ids: list[str],
    edges: list[dict],
    healthcares: pd.DataFrame,
    max_neighbors: int | None = None,
) -> dict[str, list[dict]]:
    if max_neighbors is not None and max_neighbors < 1:
        raise ValueError("max_neighbors must be >= 1 when provided")

    upazila_lookup = (
        healthcares[["healthcare_id", "upazila"]]
        .drop_duplicates(subset=["healthcare_id"])
        .set_index("healthcare_id")["upazila"]
        .astype(str)
        .to_dict()
    )

    neighbor_index = _build_neighbor_index(node_ids=node_ids, edges=edges)
    rows: dict[str, list[dict]] = {}

    for node_id in node_ids:
        linked = neighbor_index.get(node_id, [])
        if max_neighbors is not None:
            linked = linked[:max_neighbors]

        rows[node_id] = [
            {
                "healthcare_id": str(item["healthcare_id"]),
                "upazila": upazila_lookup.get(str(item["healthcare_id"]), ""),
                "distance_km": round(float(item["distance_km"]), 3),
            }
            for item in linked
        ]

    return rows


def _save_graph_dataset(
    root: Path,
    sales: pd.DataFrame,
    node_ids: list[str],
    edges: list[dict],
    sequence_length: int,
) -> Path:
    sales_with_date = sales.copy()
    sales_with_date["date_str"] = sales_with_date["date"].dt.strftime("%Y-%m-%d")

    daily_totals = (
        sales_with_date.groupby(["date_str", "healthcare_id"], as_index=False)["quantity_sold"]
        .sum()
    )

    max_total = max(float(daily_totals["quantity_sold"].max()), 1.0)
    totals_lookup = {
        (row["date_str"], row["healthcare_id"]): float(row["quantity_sold"])
        for _, row in daily_totals.iterrows()
    }

    dates = sorted(daily_totals["date_str"].unique().tolist())
    snapshots = []
    for day_index, date_str in enumerate(dates):
        node_feats = []
        for node_id in node_ids:
            value = totals_lookup.get((date_str, node_id), 0.0)
            norm = value / max_total
            # Keep a 5-feature shape to stay compatible with the ST-GNN training scripts.
            node_feats.append([norm, 0.0, 0.0, 0.0, 0.0])

        snapshots.append(
            {
                "day": day_index,
                "date": date_str,
                "node_ids": node_ids,
                "node_feats": node_feats,
                "node_labels": [],
                "edges": edges,
                "sequence_length": sequence_length,
            }
        )

    out_path = root / "graph_dataset.json"
    out_path.write_text(json.dumps(snapshots, indent=2), encoding="utf-8")
    return out_path


def _heuristic_outbreak_inference(
    sales: pd.DataFrame,
    healthcares: pd.DataFrame,
    node_ids: list[str],
    edges: list[dict],
    sequence_length: int,
) -> pd.DataFrame:
    sales_with_day = sales.copy()
    sales_with_day["day"] = sales_with_day["date"].dt.date

    daily_totals = (
        sales_with_day.groupby(["day", "healthcare_id"], as_index=False)["quantity_sold"]
        .sum()
    )

    pivot = daily_totals.pivot(index="day", columns="healthcare_id", values="quantity_sold").fillna(0.0)
    for node_id in node_ids:
        if node_id not in pivot.columns:
            pivot[node_id] = 0.0
    pivot = pivot.reindex(columns=node_ids)

    if pivot.empty:
        base = pd.Series(0.0, index=node_ids)
        recent = pd.Series(0.0, index=node_ids)
    else:
        recent_window = min(sequence_length, len(pivot))
        recent = pivot.tail(recent_window).mean(axis=0)

        baseline_source = pivot.iloc[:-recent_window] if len(pivot) > recent_window else pivot
        baseline_window = min(sequence_length, len(baseline_source))
        base = baseline_source.tail(baseline_window).mean(axis=0)

    trend = (recent - base) / (base + 1.0)

    neighbor_index = _build_neighbor_index(node_ids=node_ids, edges=edges)

    neighbor_trend = {}
    global_trend = float(trend.mean()) if len(trend) else 0.0
    for node_id in node_ids:
        linked = [neighbor["healthcare_id"] for neighbor in neighbor_index.get(node_id, [])]
        if not linked:
            neighbor_trend[node_id] = global_trend
            continue
        neighbor_trend[node_id] = float(trend.loc[linked].mean())

    trend_std = float(trend.std()) if float(trend.std()) > 1e-6 else 1.0
    trend_z = (trend - float(trend.mean())) / trend_std
    neighbor_series = pd.Series(neighbor_trend)
    neighbor_std = float(neighbor_series.std()) if float(neighbor_series.std()) > 1e-6 else 1.0
    neighbor_z = (neighbor_series - float(neighbor_series.mean())) / neighbor_std

    logits = 1.2 * trend_z + 0.8 * neighbor_z
    probabilities = _sigmoid(logits)

    results = healthcares[["healthcare_id", "upazila"]].copy()
    results = results.drop_duplicates(subset=["healthcare_id"]).set_index("healthcare_id")
    results = results.reindex(node_ids)
    results["outbreak_probability"] = probabilities.reindex(node_ids).fillna(0.0)
    results["outbreak_flag"] = results["outbreak_probability"] >= 0.5

    return results.reset_index()


def _run_outbreak_pipeline_core(
    input_dir: str,
    model_path: str | None,
    graph_radius_km: float,
    sequence_length: int,
) -> tuple[pd.DataFrame, pd.DataFrame, list[str], list[dict]]:
    root = Path(input_dir)
    logger.info("Outbreak pipeline started in %s", root)

    sales, healthcares = _load_inputs(root)
    node_ids, edges = _build_edges(healthcares, radius_km=graph_radius_km)

    graph_path = _save_graph_dataset(
        root=root,
        sales=sales,
        node_ids=node_ids,
        edges=edges,
        sequence_length=sequence_length,
    )
    logger.info("Graph dataset generated at %s", graph_path)

    if model_path and Path(model_path).exists():
        logger.info("ST-GNN model checkpoint detected at %s", model_path)
        logger.info("Using deterministic runtime heuristic for API inference compatibility")

    result_df = _heuristic_outbreak_inference(
        sales=sales,
        healthcares=healthcares,
        node_ids=node_ids,
        edges=edges,
        sequence_length=sequence_length,
    )

    result_df["outbreak_probability"] = result_df["outbreak_probability"].clip(0.0, 1.0)
    result_df["outbreak_probability"] = result_df["outbreak_probability"].round(4)
    result_df["outbreak_flag"] = result_df["outbreak_flag"].astype(bool)

    return result_df, healthcares, node_ids, edges


def _to_standardized_rows(result_df: pd.DataFrame) -> list[dict]:
    return result_df[["healthcare_id", "upazila", "outbreak_probability", "outbreak_flag"]].to_dict(
        orient="records"
    )


def run_outbreak_pipeline(
    input_dir: str,
    model_path: str | None = None,
    graph_radius_km: float = 10.0,
    sequence_length: int = 7,
) -> list[dict]:
    result_df, _, _, _ = _run_outbreak_pipeline_core(
        input_dir=input_dir,
        model_path=model_path,
        graph_radius_km=graph_radius_km,
        sequence_length=sequence_length,
    )

    rows = _to_standardized_rows(result_df)

    logger.info("Outbreak pipeline produced %s rows", len(rows))
    return rows


def run_outbreak_pipeline_with_neighbors(
    input_dir: str,
    model_path: str | None = None,
    graph_radius_km: float = 10.0,
    sequence_length: int = 7,
    max_neighbors: int | None = None,
) -> dict[str, object]:
    """Run outbreak inference and return rows plus graph-based neighboring healthcares.

    This helper keeps `run_outbreak_pipeline` backward compatible while exposing
    reusable neighbor-node context for medicine request routing and outbreak
    notification workflows.
    """
    result_df, healthcares, node_ids, edges = _run_outbreak_pipeline_core(
        input_dir=input_dir,
        model_path=model_path,
        graph_radius_km=graph_radius_km,
        sequence_length=sequence_length,
    )

    rows = _to_standardized_rows(result_df)
    neighbors = _neighbor_rows(
        node_ids=node_ids,
        edges=edges,
        healthcares=healthcares,
        max_neighbors=max_neighbors,
    )

    logger.info(
        "Outbreak pipeline produced %s rows with neighbor metadata for %s nodes",
        len(rows),
        len(neighbors),
    )
    return {
        "results": rows,
        "neighbors": neighbors,
    }
