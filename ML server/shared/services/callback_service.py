import logging
import os
import uuid
import time
from datetime import datetime, timezone
from hashlib import sha256

import json

import requests

logger = logging.getLogger(__name__)


class CallbackService:
    def __init__(
        self,
        timeout_seconds: int = 10,
        max_retries: int = 3,
        signature_secret: str | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.signature_secret = signature_secret or os.getenv("CALLBACK_SIGNATURE_SECRET", "dev-secret")

    def _build_headers(self, payload: dict) -> dict[str, str]:
        request_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        raw = f"{timestamp}.{request_id}.{payload_json}.{self.signature_secret}"
        signature = sha256(raw.encode("utf-8")).hexdigest()

        return {
            "X-Signature": signature,
            "X-Timestamp": timestamp,
            "X-Request-Id": request_id,
        }

    def send_results(self, callback_url: str, payload: dict, timeout_seconds: int | None = None) -> None:
        last_error = None
        timeout = timeout_seconds if timeout_seconds is not None else self.timeout_seconds
        headers = self._build_headers(payload)

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info("Callback attempt %s to %s", attempt, callback_url)
                response = requests.post(
                    callback_url,
                    json=payload,
                    timeout=timeout,
                    headers=headers,
                )
                response.raise_for_status()
                logger.info("Callback succeeded on attempt %s", attempt)
                return
            except requests.RequestException as exc:
                last_error = exc
                logger.warning("Callback attempt %s failed: %s", attempt, exc)
                if attempt < self.max_retries:
                    # Exponential backoff: 1s, 2s, 4s.
                    time.sleep(2 ** (attempt - 1))

        raise RuntimeError(f"Callback failed after {self.max_retries} attempts") from last_error
