"""Translation helpers for localized medicine information payloads."""

from __future__ import annotations

import copy
import logging
from typing import Any, Protocol

import requests
from django.conf import settings

from apps.core.services.gemini_service import GeminiService, GeminiServiceError

logger = logging.getLogger("hrsp.medicine_info")


SUPPORTED_MEDICINE_LANGUAGES = {"en", "bn"}


class TranslationServiceError(RuntimeError):
    """Raised when a translation provider cannot produce usable output."""


def normalize_medicine_language(language: str | None) -> str:
    """Normalize language to supported values with safe fallback."""
    normalized = str(language or "").strip().lower()
    if normalized in SUPPORTED_MEDICINE_LANGUAGES:
        return normalized
    return "en"


class ITranslationService(Protocol):
    """Pluggable translation interface for medicine localization."""

    def translate_text_async(self, text: str, target_language: str) -> str:
        """Translate a plain text value into the target language."""

    def translate_medicine_fields_async(
        self,
        medicine_data: dict[str, Any],
        target_language: str,
    ) -> dict[str, Any]:
        """Translate supported user-facing medicine fields."""


def _translate_medicine_fields_with_provider(
    medicine_data: dict[str, Any],
    target_language: str,
    provider: ITranslationService,
) -> dict[str, Any]:
    translated = copy.deepcopy(medicine_data) if isinstance(medicine_data, dict) else {}
    if not translated:
        return {}

    for field_name in MedicineTranslationService.translatable_root_fields():
        if field_name not in translated:
            continue
        translated[field_name] = MedicineTranslationService.translate_field_value(
            translated[field_name],
            target_language,
            provider,
        )

    details = translated.get("details")
    if isinstance(details, dict):
        for field_name in MedicineTranslationService.translatable_detail_fields():
            if field_name not in details:
                continue
            details[field_name] = MedicineTranslationService.translate_field_value(
                details[field_name],
                target_language,
                provider,
            )

    return translated


class TranslatorAPITranslationService(ITranslationService):
    """Primary translator API provider when translator credentials are configured."""

    def __init__(self) -> None:
        self.api_url = str(getattr(settings, "MEDICINE_TRANSLATOR_API_URL", "") or "").strip()
        self.api_key = str(getattr(settings, "MEDICINE_TRANSLATOR_API_KEY", "") or "").strip()
        self.key_header = str(
            getattr(settings, "MEDICINE_TRANSLATOR_API_KEY_HEADER", "Authorization") or "Authorization"
        ).strip()
        self.key_prefix = str(getattr(settings, "MEDICINE_TRANSLATOR_API_KEY_PREFIX", "Bearer") or "").strip()
        self.timeout_seconds = int(getattr(settings, "MEDICINE_TRANSLATOR_TIMEOUT_SECONDS", 10) or 10)

    def is_configured(self) -> bool:
        return bool(self.api_url and self.api_key)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            value = f"{self.key_prefix} {self.api_key}".strip() if self.key_prefix else self.api_key
            headers[self.key_header] = value
        return headers

    def _payload(self, *, text: str, target_language: str) -> dict[str, Any]:
        return {
            "text": text,
            "target_language": target_language,
            "source_language": "en",
            "targetLanguage": target_language,
            "sourceLanguage": "en",
        }

    def _extract_translation(self, payload: Any) -> str:
        if isinstance(payload, str):
            return payload.strip()

        if isinstance(payload, list):
            for item in payload:
                translated = self._extract_translation(item)
                if translated:
                    return translated
            return ""

        if not isinstance(payload, dict):
            return ""

        for key in (
            "translated_text",
            "translatedText",
            "translated",
            "translation",
            "text",
        ):
            value = str(payload.get(key) or "").strip()
            if value:
                return value

        if isinstance(payload.get("translations"), list):
            translated = self._extract_translation(payload.get("translations"))
            if translated:
                return translated

        if isinstance(payload.get("data"), (dict, list, str)):
            translated = self._extract_translation(payload.get("data"))
            if translated:
                return translated

        return ""

    def translate_text_async(self, text: str, target_language: str) -> str:
        source_text = str(text or "")
        if not source_text.strip():
            return source_text

        language = normalize_medicine_language(target_language)
        if language == "en":
            return source_text

        if not self.is_configured():
            raise TranslationServiceError("Translator API is not configured.")

        try:
            response = requests.post(
                self.api_url,
                json=self._payload(text=source_text, target_language=language),
                headers=self._headers(),
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise TranslationServiceError("Translator API request failed.") from exc

        if response.status_code >= 400:
            raise TranslationServiceError(f"Translator API returned status {response.status_code}.")

        try:
            payload = response.json()
        except ValueError:
            payload = response.text

        translated = self._extract_translation(payload)
        if not translated:
            raise TranslationServiceError("Translator API returned empty translation.")
        return translated

    def translate_medicine_fields_async(
        self,
        medicine_data: dict[str, Any],
        target_language: str,
    ) -> dict[str, Any]:
        return _translate_medicine_fields_with_provider(medicine_data, target_language, self)


class LLMTranslationService(ITranslationService):
    """Gemini translation provider used as fallback when translator API is unavailable."""

    def translate_text_async(self, text: str, target_language: str) -> str:
        source_text = str(text or "")
        if not source_text.strip():
            return source_text

        language = normalize_medicine_language(target_language)
        if language == "en":
            return source_text

        prompt = (
            "Translate the following patient-facing medicine information text from English to Bengali (bn). "
            "Keep medicine names, dosage strengths, units, frequencies, route terms, and numeric values unchanged. "
            "Use natural, clinically clear Bengali suitable for hospital/pharmacy users. "
            "Use Bangla script only (no mixed Devanagari or Roman substitutions). "
            "Do not add or remove medical facts. "
            "Return only the translated text with no explanations.\n\n"
            f"Text:\n{source_text}"
        )

        try:
            translated = GeminiService().ask(prompt=prompt, language=language)
        except GeminiServiceError as exc:
            raise TranslationServiceError("Gemini translation failed.") from exc

        normalized_translated = str(translated or "").strip()
        if not normalized_translated:
            raise TranslationServiceError("LLM translation returned empty text.")
        return normalized_translated

    def translate_medicine_fields_async(
        self,
        medicine_data: dict[str, Any],
        target_language: str,
    ) -> dict[str, Any]:
        return _translate_medicine_fields_with_provider(medicine_data, target_language, self)


class FallbackTranslationService(ITranslationService):
    """Translation chain: primary translator API, then LLM fallback."""

    def __init__(self, providers: list[ITranslationService] | None = None) -> None:
        configured_providers = list(providers or [])
        if configured_providers:
            self.providers = configured_providers
            return

        translator_provider = TranslatorAPITranslationService()
        if translator_provider.is_configured():
            self.providers = [translator_provider, LLMTranslationService()]
            return
        self.providers = [LLMTranslationService()]

    def translate_text_async(self, text: str, target_language: str) -> str:
        source_text = str(text or "")
        if not source_text.strip():
            return source_text

        language = normalize_medicine_language(target_language)
        if language == "en":
            return source_text

        failures: list[str] = []
        for provider in self.providers:
            provider_name = provider.__class__.__name__
            try:
                translated = provider.translate_text_async(source_text, language)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Medicine translation provider failed",
                    extra={
                        "provider": provider_name,
                        "language": language,
                        "error": str(exc),
                    },
                )
                failures.append(f"{provider_name}: {exc}")
                continue

            normalized = str(translated or "").strip()
            if normalized:
                return normalized
            failures.append(f"{provider_name}: empty_translation")

        details = "; ".join(failures) if failures else "No translation providers configured."
        raise TranslationServiceError(f"All translation providers failed. {details}")

    def translate_medicine_fields_async(
        self,
        medicine_data: dict[str, Any],
        target_language: str,
    ) -> dict[str, Any]:
        return _translate_medicine_fields_with_provider(medicine_data, target_language, self)


class MedicineTranslationService:
    """Localized medicine response adapter with pluggable providers."""

    _ROOT_TRANSLATABLE_FIELDS = {
        "description",
        "uses",
        "use_cases",
        "indications",
        "side_effects",
        "sideEffects",
        "warnings",
        "dosage_instructions",
        "dosageInstructions",
        "dosage_guidance",
        "age_guidance",
        "storage_instructions",
        "storageInstructions",
        "storage_guidance",
    }
    _DETAIL_TRANSLATABLE_FIELDS = {
        "summary",
        "description",
        "warnings",
        "dosageInstructions",
        "storageInstructions",
    }

    @classmethod
    def translatable_root_fields(cls) -> set[str]:
        return set(cls._ROOT_TRANSLATABLE_FIELDS)

    @classmethod
    def translatable_detail_fields(cls) -> set[str]:
        return set(cls._DETAIL_TRANSLATABLE_FIELDS)

    @classmethod
    def translate_field_value(
        cls,
        value: Any,
        target_language: str,
        translation_service: ITranslationService,
    ) -> Any:
        if value is None:
            return None

        if isinstance(value, str):
            source = value.strip()
            if not source:
                return value
            return translation_service.translate_text_async(source, target_language)

        if isinstance(value, list):
            translated_items: list[Any] = []
            for item in value:
                if item is None:
                    translated_items.append(item)
                    continue
                if isinstance(item, str):
                    source = item.strip()
                    if not source:
                        translated_items.append(item)
                        continue
                    translated_items.append(
                        translation_service.translate_text_async(source, target_language)
                    )
                    continue
                translated_items.append(item)
            return translated_items

        return value

    @classmethod
    def translate_medicine_response(
        cls,
        data: dict[str, Any],
        target_language: str,
        *,
        translation_service: ITranslationService | None = None,
    ) -> dict[str, Any]:
        language = normalize_medicine_language(target_language)
        if language == "en":
            return copy.deepcopy(data)

        active_service: ITranslationService = translation_service or FallbackTranslationService()
        return active_service.translate_medicine_fields_async(data, language)

    # Keep a PascalCase alias for compatibility with API requirements.
    @classmethod
    def TranslateMedicineResponse(
        cls,
        data: dict[str, Any],
        targetLanguage: str,
    ) -> dict[str, Any]:
        return cls.translate_medicine_response(data, targetLanguage)
