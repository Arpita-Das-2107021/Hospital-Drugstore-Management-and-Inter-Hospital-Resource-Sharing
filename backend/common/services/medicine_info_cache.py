"""Cache helpers for medicine info enrichment payloads."""

import hashlib
import re
from typing import Any

from django.core.cache import cache

from common.services.medicine_translation_service import normalize_medicine_language


class MedicineInfoCache:
    """Provide deterministic cache keys and fresh/stale cache primitives."""

    _FRESH_KEY_PREFIX = "medicine"
    _STALE_KEY_SUFFIX = "stale"
    _UNKNOWN_KEY = "unknown"

    @classmethod
    def normalize_lookup(cls, value: str) -> str:
        """Normalize medicine names to stable lowercase slug values."""
        source = " ".join(str(value or "").split()).strip().lower()
        if not source:
            return ""

        # Keep deterministic keys regardless of user formatting differences.
        normalized = re.sub(r"[^a-z0-9]+", "-", source)
        normalized = re.sub(r"-+", "-", normalized).strip("-")
        if normalized:
            return normalized

        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
        return f"id-{digest}"

    @classmethod
    def fresh_key(cls, medicine_name: str, language: str = "en") -> str:
        suffix = cls.normalize_lookup(medicine_name) or cls._UNKNOWN_KEY
        normalized_language = normalize_medicine_language(language)
        return f"{cls._FRESH_KEY_PREFIX}:{suffix}:{normalized_language}"

    @classmethod
    def stale_key(cls, medicine_name: str, language: str = "en") -> str:
        suffix = cls.normalize_lookup(medicine_name) or cls._UNKNOWN_KEY
        normalized_language = normalize_medicine_language(language)
        return f"{cls._FRESH_KEY_PREFIX}:{suffix}:{normalized_language}:{cls._STALE_KEY_SUFFIX}"

    @classmethod
    def get_fresh(cls, medicine_name: str, language: str = "en") -> dict[str, Any] | None:
        payload = cache.get(cls.fresh_key(medicine_name, language=language))
        return payload if isinstance(payload, dict) else None

    @classmethod
    def get_stale(cls, medicine_name: str, language: str = "en") -> dict[str, Any] | None:
        payload = cache.get(cls.stale_key(medicine_name, language=language))
        return payload if isinstance(payload, dict) else None

    @classmethod
    def set_success_payload(
        cls,
        medicine_name: str,
        payload: dict[str, Any],
        *,
        language: str = "en",
        fresh_ttl_seconds: int,
        stale_ttl_seconds: int,
    ) -> None:
        if not isinstance(payload, dict):
            return

        if fresh_ttl_seconds > 0:
            cache.set(
                cls.fresh_key(medicine_name, language=language),
                payload,
                timeout=fresh_ttl_seconds,
            )
        if stale_ttl_seconds > 0:
            cache.set(
                cls.stale_key(medicine_name, language=language),
                payload,
                timeout=stale_ttl_seconds,
            )

    @classmethod
    def invalidate(
        cls,
        medicine_name: str,
        *,
        language: str = "en",
        include_stale: bool = False,
    ) -> None:
        cache.delete(cls.fresh_key(medicine_name, language=language))
        if include_stale:
            cache.delete(cls.stale_key(medicine_name, language=language))
