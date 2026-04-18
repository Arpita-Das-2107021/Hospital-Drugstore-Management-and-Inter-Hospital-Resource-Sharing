from pathlib import Path

import pandas as pd

from shared.services.minio_service import MinIOService


class FakeMinioClient:
    def __init__(self):
        self.bucket_exists_called = False
        self.make_bucket_called = False
        self.fget_calls = []
        self.put_calls = []

    def bucket_exists(self, name: str) -> bool:
        self.bucket_exists_called = True
        return False

    def make_bucket(self, name: str) -> None:
        self.make_bucket_called = True

    def fget_object(self, bucket: str, object_name: str, destination: str) -> None:
        self.fget_calls.append((bucket, object_name, destination))

    def put_object(self, bucket: str, object_name: str, stream, length: int, content_type: str) -> None:
        self.put_calls.append((bucket, object_name, length, content_type))


def test_parse_minio_uri():
    bucket, obj = MinIOService.parse_minio_uri("minio://my-bucket/path/file.csv")
    assert bucket == "my-bucket"
    assert obj == "path/file.csv"


def test_upload_and_download(monkeypatch, tmp_path: Path):
    fake_client = FakeMinioClient()

    service = MinIOService(
        endpoint="localhost:9000",
        access_key="minioadmin",
        secret_key="minioadmin",
        secure=False,
        results_bucket="ml-forecast",
    )
    service._client = fake_client

    destination = tmp_path / "sales.csv"
    service.download_file("minio://raw/sales.csv", destination)
    assert fake_client.fget_calls[0][0] == "raw"

    df = pd.DataFrame([{"hospital_id": "1", "medicine_name": "Paracetamol"}])
    uri = service.upload_results_csv(df, "results.csv")

    assert uri == "minio://ml-forecast/results.csv"
    assert fake_client.make_bucket_called is True
    assert len(fake_client.put_calls) == 1
