import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.core.files import File
from django.db import transaction

from .models import MessageAttachment


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def transcode_chat_video_attachment_task(self, attachment_id: str) -> None:
    attachment = MessageAttachment.objects.filter(id=attachment_id).first()
    if not attachment:
        return

    if attachment.media_kind != MessageAttachment.MediaKind.VIDEO:
        return

    with transaction.atomic():
        attachment.processing_status = MessageAttachment.ProcessingStatus.PROCESSING
        attachment.processing_error = ""
        attachment.save(update_fields=["processing_status", "processing_error"])

    input_path = ""
    output_path = ""

    try:
        suffix = Path(attachment.original_name or attachment.file.name).suffix or ".bin"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as src_tmp:
            input_path = src_tmp.name
            with attachment.file.open("rb") as stream:
                shutil.copyfileobj(stream, src_tmp)

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as dst_tmp:
            output_path = dst_tmp.name

        cmd = [
            settings.CHAT_FFMPEG_BINARY,
            "-y",
            "-i",
            input_path,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            str(settings.CHAT_VIDEO_CRF),
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            output_path,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        output_size = os.path.getsize(output_path)
        old_file_name = attachment.file.name

        encoded_name = f"{Path(attachment.original_name).stem or 'video'}.mp4"
        with open(output_path, "rb") as encoded_stream:
            attachment.file.save(encoded_name, File(encoded_stream), save=False)

        attachment.content_type = "video/mp4"
        attachment.file_size = output_size
        attachment.encoded_codec = "h264"
        attachment.processing_status = MessageAttachment.ProcessingStatus.READY
        attachment.processing_error = ""
        attachment.save(
            update_fields=[
                "file",
                "content_type",
                "file_size",
                "encoded_codec",
                "processing_status",
                "processing_error",
            ]
        )

        if old_file_name and old_file_name != attachment.file.name:
            attachment.file.storage.delete(old_file_name)

    except Exception as exc:
        attachment.processing_status = MessageAttachment.ProcessingStatus.FAILED
        attachment.processing_error = str(exc)[:1000]
        attachment.save(update_fields=["processing_status", "processing_error"])
        raise
    finally:
        if input_path and os.path.exists(input_path):
            os.remove(input_path)
        if output_path and os.path.exists(output_path):
            os.remove(output_path)
