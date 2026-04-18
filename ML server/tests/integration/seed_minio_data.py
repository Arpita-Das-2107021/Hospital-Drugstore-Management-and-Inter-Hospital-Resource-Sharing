from __future__ import annotations

import os
import time
from pathlib import Path

from minio import Minio

ROOT = Path(__file__).resolve().parents[2]

ENDPOINT = os.getenv("MINIO_ENDPOINT", "host.docker.internal:9200")
ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
BUCKET = os.getenv("MINIO_INPUT_BUCKET", "ml-input")

OBJECTS = [
    (ROOT / "sales.csv", "snapshots/e2e/sales.csv"),
    (ROOT / "sales2.csv", "snapshots/e2e_v2/sales.csv"),
    (ROOT / "medicines.csv", "snapshots/e2e/medicines.csv"),
    (ROOT / "medicines.csv", "snapshots/e2e_v2/medicines.csv"),
    (ROOT / "healthcares.csv", "snapshots/e2e/facilities.csv"),
    (ROOT / "healthcares.csv", "snapshots/e2e_v2/facilities.csv"),
    (ROOT / "outbreaks_ground_truth.csv", "snapshots/e2e/outbreaks_ground_truth.csv"),
    (ROOT / "outbreaks_ground_truth.csv", "snapshots/e2e_v2/outbreaks_ground_truth.csv"),
]


def _wait_for_minio(client: Minio, timeout_seconds: int = 30) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            client.bucket_exists(BUCKET)
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("MinIO is not reachable within timeout")


def main() -> None:
    client = Minio(
        ENDPOINT,
        access_key=ACCESS_KEY,
        secret_key=SECRET_KEY,
        secure=SECURE,
    )

    _wait_for_minio(client)

    if not client.bucket_exists(BUCKET):
        client.make_bucket(BUCKET)

    for source_path, object_name in OBJECTS:
        if not source_path.exists():
            raise FileNotFoundError(f"Missing source dataset file: {source_path}")

        client.fput_object(
            BUCKET,
            object_name,
            str(source_path),
            content_type="text/csv",
        )
        print(f"uploaded {source_path.name} -> minio://{BUCKET}/{object_name}")

    print("seed completed")


if __name__ == "__main__":
    main()
