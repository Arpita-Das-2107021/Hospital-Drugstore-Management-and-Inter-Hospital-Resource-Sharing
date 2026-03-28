import threading
import json

import boto3
from botocore.exceptions import ClientError
from django.conf import settings

_bucket_ready = False
_bucket_lock = threading.Lock()


def use_minio_chat_storage() -> bool:
    return bool(getattr(settings, "USE_MINIO_CHAT_STORAGE", False))


def ensure_chat_bucket_exists() -> None:
    global _bucket_ready

    if not use_minio_chat_storage():
        return
    if not getattr(settings, "MINIO_AUTO_CREATE_BUCKET", True):
        return

    with _bucket_lock:
        if _bucket_ready:
            return

        client = boto3.client(
            "s3",
            endpoint_url=settings.MINIO_ENDPOINT_URL,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            region_name=settings.MINIO_REGION_NAME,
        )

        try:
            client.head_bucket(Bucket=settings.MINIO_BUCKET_NAME)
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code in {"404", "NoSuchBucket", "NotFound"}:
                client.create_bucket(Bucket=settings.MINIO_BUCKET_NAME)
            else:
                raise

        if getattr(settings, "MINIO_PUBLIC_READ", True):
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": "*",
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{settings.MINIO_BUCKET_NAME}/*"],
                    }
                ],
            }
            client.put_bucket_policy(Bucket=settings.MINIO_BUCKET_NAME, Policy=json.dumps(policy))

        _bucket_ready = True
