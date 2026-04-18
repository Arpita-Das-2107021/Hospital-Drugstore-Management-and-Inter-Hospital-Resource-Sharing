"""Helpers for building public-facing media URLs from Django file fields."""

from django.conf import settings


def resolve_media_file_url(file_field, request=None) -> str | None:
    """Return a URL that is reachable from the browser for the given media file field."""
    if not file_field:
        return None

    if bool(getattr(settings, "USE_MINIO_CHAT_STORAGE", False)):
        object_key = str(getattr(file_field, "name", "") or "").lstrip("/")
        public_endpoint = str(getattr(settings, "MINIO_PUBLIC_ENDPOINT", "") or "").strip().rstrip("/")
        bucket_name = str(getattr(settings, "MINIO_BUCKET_NAME", "") or "").strip().strip("/")
        if object_key and public_endpoint and bucket_name:
            return f"{public_endpoint}/{bucket_name}/{object_key}"

    try:
        raw_url = file_field.url
    except Exception:  # noqa: BLE001
        return None

    if request:
        try:
            return request.build_absolute_uri(raw_url)
        except Exception:  # noqa: BLE001
            return raw_url
    return raw_url