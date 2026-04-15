"""Upload admin-managed outbreaks_ground_truth.csv to MinIO."""

from __future__ import annotations

from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Upload outbreaks_ground_truth.csv to the ML dataset MinIO bucket."

    def add_arguments(self, parser):
        parser.add_argument("file_path", type=str, help="Path to outbreaks_ground_truth.csv")
        parser.add_argument(
            "--object-key",
            type=str,
            default="",
            help="Override object key (default: ML_OUTBREAK_GROUND_TRUTH_OBJECT_KEY setting).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow overwrite when object already exists.",
        )

    def handle(self, *args, **options):
        file_path = Path(options["file_path"]).expanduser().resolve()
        if not file_path.exists() or not file_path.is_file():
            raise CommandError(f"File does not exist: {file_path}")

        bucket_name = str(getattr(settings, "ML_DATASET_BUCKET_NAME", "ml-input")).strip()
        object_key = str(options.get("object_key") or getattr(settings, "ML_OUTBREAK_GROUND_TRUTH_OBJECT_KEY", "")).strip("/")
        if not object_key:
            raise CommandError("Object key is required. Set ML_OUTBREAK_GROUND_TRUTH_OBJECT_KEY or pass --object-key.")

        client = boto3.client(
            "s3",
            endpoint_url=settings.MINIO_ENDPOINT_URL,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            region_name=getattr(settings, "MINIO_REGION_NAME", "us-east-1"),
        )

        self._ensure_bucket_exists(client, bucket_name)

        exists = self._object_exists(client, bucket_name, object_key)
        if exists and not options.get("force", False):
            raise CommandError(
                "Ground truth object already exists. Use --force to overwrite explicitly."
            )

        content = file_path.read_bytes()
        client.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=content,
            ContentType="text/csv",
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Uploaded admin-managed ground truth to minio://{bucket_name}/{object_key}"
            )
        )

    def _ensure_bucket_exists(self, client, bucket_name: str) -> None:
        try:
            client.head_bucket(Bucket=bucket_name)
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchBucket", "NotFound"}:
                client.create_bucket(Bucket=bucket_name)
            else:
                raise CommandError(f"Unable to access bucket {bucket_name}: {exc}") from exc

    def _object_exists(self, client, bucket_name: str, object_key: str) -> bool:
        try:
            client.head_object(Bucket=bucket_name, Key=object_key)
            return True
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise CommandError(f"Unable to check object {object_key}: {exc}") from exc
