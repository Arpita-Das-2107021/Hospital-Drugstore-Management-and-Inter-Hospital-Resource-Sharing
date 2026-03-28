from pathlib import Path

MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
DEFAULT_VIDEO_TRANSCODE_THRESHOLD_BYTES = 12 * 1024 * 1024  # 12 MB

ALLOWED_ATTACHMENT_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".pdf",
    ".csv",
    ".txt",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".zip",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".m4v",
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".aac",
    ".opus",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
VOICE_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".opus"}


def extension_for(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def infer_attachment_media_kind(*, content_type: str, filename: str, kind_hint: str | None = None) -> str:
    normalized_hint = (kind_hint or "").strip().lower()
    if normalized_hint in {"image", "file", "voice", "video"}:
        return normalized_hint

    normalized_content_type = (content_type or "").lower()
    ext = extension_for(filename)

    if normalized_content_type.startswith("image/") or ext in IMAGE_EXTENSIONS:
        return "image"
    if normalized_content_type.startswith("video/") or ext in VIDEO_EXTENSIONS:
        return "video"
    if normalized_content_type.startswith("audio/") or ext in VOICE_EXTENSIONS:
        return "voice"
    return "file"
