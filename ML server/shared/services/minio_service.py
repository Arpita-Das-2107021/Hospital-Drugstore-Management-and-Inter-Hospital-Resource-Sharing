import io
import logging
from pathlib import Path

import pandas as pd
from minio import Minio

logger = logging.getLogger(__name__)


class MinIOService:
    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        secure: bool,
        results_bucket: str,
    ) -> None:
        self.results_bucket = results_bucket
        self._client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )

    @staticmethod
    def parse_minio_uri(uri: str) -> tuple[str, str]:
        if not uri.startswith("minio://"):
            raise ValueError("Expected minio URI with prefix minio://")

        path = uri[len("minio://") :]
        if "/" not in path:
            raise ValueError("Expected minio URI format minio://bucket/object")

        bucket, object_name = path.split("/", 1)
        return bucket, object_name

    def ensure_results_bucket(self) -> None:
        if not self._client.bucket_exists(self.results_bucket):
            logger.info("Creating MinIO bucket: %s", self.results_bucket)
            self._client.make_bucket(self.results_bucket)

    def download_file(self, minio_uri: str, destination_path: Path) -> Path:
        bucket, object_name = self.parse_minio_uri(minio_uri)

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        logger.info("Downloading %s/%s to %s", bucket, object_name, destination_path)
        self._client.fget_object(bucket, object_name, str(destination_path))
        return destination_path

    def upload_results_csv(self, result_df: pd.DataFrame, object_name: str) -> str:
        self.ensure_results_bucket()

        csv_bytes = result_df.to_csv(index=False).encode("utf-8")
        stream = io.BytesIO(csv_bytes)

        logger.info("Uploading results to bucket=%s object=%s", self.results_bucket, object_name)
        self._client.put_object(
            self.results_bucket,
            object_name,
            stream,
            length=len(csv_bytes),
            content_type="text/csv",
        )

        return f"minio://{self.results_bucket}/{object_name}"
