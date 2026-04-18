"""Reusable Gemini API client for concise chat completions."""
from __future__ import annotations

import logging

import requests
from django.conf import settings

logger = logging.getLogger("hrsp.gemini")


class GeminiServiceError(RuntimeError):
    """Raised when Gemini service cannot provide a valid completion."""


class GeminiService:
    """Thin reusable wrapper around Gemini generateContent API."""

    _JSON_PROMPT_HINTS = (
        "return only valid json",
        "return json only",
        "do not use markdown",
        "do not include explanations outside json",
    )
    _TRANSLATION_PROMPT_HINTS = (
        "translate the following",
        "return only the translated text",
    )

    def __init__(self) -> None:
        self.api_key = settings.GEMINI_API_KEY
        self.api_url = settings.GEMINI_API_URL.rstrip("/")
        self.model = settings.GEMINI_MODEL
        self.model_fallbacks = list(getattr(settings, "GEMINI_MODEL_FALLBACKS", []))
        self.timeout_seconds = settings.GEMINI_REQUEST_TIMEOUT_SECONDS

    def _ensure_configured(self) -> None:
        if not self.api_key:
            raise GeminiServiceError("GEMINI_API_KEY is not configured.")

    def _candidate_models(self) -> list[str]:
        candidates: list[str] = []
        for item in [self.model, *self.model_fallbacks]:
            model_name = str(item or "").strip()
            if not model_name:
                continue
            if model_name not in candidates:
                candidates.append(model_name)
        return candidates

    def _temperature_for_prompt(self, prompt: str) -> float:
        prompt_text = str(prompt or "").lower()
        if any(hint in prompt_text for hint in self._JSON_PROMPT_HINTS):
            return 0.2
        if any(hint in prompt_text for hint in self._TRANSLATION_PROMPT_HINTS):
            return 0.25
        return 0.55

    def ask(self, *, prompt: str, language: str) -> str:
        self._ensure_configured()

        response_language = str(language or "en").strip().lower() or "en"
        language_quality_note = ""
        if response_language.startswith("bn"):
            language_quality_note = (
                " Use standard Bangla script only; avoid mixed scripts, mojibake, or duplicated punctuation."
            )
        system_instruction = (
            "You are a practical healthcare operations assistant. "
            "Provide context-aware, non-repetitive, user-helpful answers and avoid generic boilerplate. "
            f"Respond in language code '{response_language}' unless the user explicitly requests otherwise."
            f"{language_quality_note}"
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": f"{system_instruction}\n\n{prompt}"
                        }
                    ]
                }
            ],
            "generationConfig": {"temperature": self._temperature_for_prompt(prompt)},
        }

        failures: list[str] = []
        for model_name in self._candidate_models():
            endpoint = f"{self.api_url}/{model_name}:generateContent"
            try:
                response = requests.post(
                    endpoint,
                    params={"key": self.api_key},
                    json=payload,
                    timeout=self.timeout_seconds,
                )
            except requests.RequestException as exc:
                logger.exception("Gemini API request failed for model=%s", model_name)
                failures.append(f"{model_name}: request_error")
                continue

            if response.status_code >= 400:
                logger.error(
                    "Gemini API returned error for model=%s status=%s body=%s",
                    model_name,
                    response.status_code,
                    response.text[:500],
                )
                failures.append(f"{model_name}: status_{response.status_code}")
                # If a specific model is not available for this key/version, try next candidate.
                if response.status_code == 404:
                    continue
                raise GeminiServiceError("Gemini API returned an error response.")

            try:
                response_payload = response.json()
                content = response_payload["candidates"][0]["content"]["parts"][0]["text"]
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                logger.exception("Invalid Gemini API response format for model=%s", model_name)
                failures.append(f"{model_name}: invalid_response")
                continue

            text = str(content or "").strip()
            if text:
                return text

            failures.append(f"{model_name}: empty_response")

        if failures:
            raise GeminiServiceError(f"Gemini API failed for all candidate models. {'; '.join(failures)}")
        raise GeminiServiceError("Gemini API has no configured model candidates.")
