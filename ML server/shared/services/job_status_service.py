from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any
from uuid import UUID


class JobStatusService:
    """In-memory job lifecycle tracker for async background jobs."""

    TERMINAL_STATUSES = {"completed", "failed"}

    def __init__(self) -> None:
        self._lock = Lock()
        self._by_job_id: dict[str, dict[str, Any]] = {}
        self._by_external_job_id: dict[str, str] = {}

    @staticmethod
    def _utc_now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _normalize_job_id(job_id: UUID | str) -> str:
        return str(job_id)

    def create_job(
        self,
        *,
        job_id: UUID | str,
        external_job_id: str,
        job_type: str,
        model_type: str,
        request_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = self._utc_now()
        normalized_job_id = self._normalize_job_id(job_id)

        payload = {
            "job_id": normalized_job_id,
            "external_job_id": external_job_id,
            "job_type": job_type,
            "model_type": model_type,
            "status": "pending",
            "request_id": request_id,
            "created_at": now,
            "updated_at": now,
            "metadata": metadata or {},
            "error": None,
        }

        with self._lock:
            self._by_job_id[normalized_job_id] = payload
            self._by_external_job_id[external_job_id] = normalized_job_id

        return payload

    def update_status(
        self,
        *,
        external_job_id: str,
        status: str,
        error: dict[str, Any] | None = None,
        metadata_updates: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if status not in {"pending", "processing", "completed", "failed"}:
            raise ValueError(f"Unsupported status: {status}")

        with self._lock:
            job_id = self._by_external_job_id.get(external_job_id)
            if job_id is None:
                raise KeyError(f"Unknown external_job_id: {external_job_id}")

            job = self._by_job_id[job_id]
            job["status"] = status
            job["updated_at"] = self._utc_now()

            if metadata_updates:
                merged = dict(job.get("metadata", {}))
                merged.update(metadata_updates)
                job["metadata"] = merged

            if status == "failed":
                job["error"] = error or {"code": "job_failed", "message": "Job failed"}
            elif status in self.TERMINAL_STATUSES:
                job["error"] = None

            return dict(job)

    def get_job(self, job_id: UUID | str) -> dict[str, Any] | None:
        normalized_job_id = self._normalize_job_id(job_id)
        with self._lock:
            job = self._by_job_id.get(normalized_job_id)
            return dict(job) if job else None

    def get_job_by_external_id(self, external_job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job_id = self._by_external_job_id.get(external_job_id)
            if not job_id:
                return None
            job = self._by_job_id.get(job_id)
            return dict(job) if job else None
