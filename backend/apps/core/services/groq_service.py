"""Reusable Groq API client for concise chat completions."""
from __future__ import annotations

import logging

import requests
from django.conf import settings

logger = logging.getLogger("hrsp.groq")


class GroqServiceError(RuntimeError):
    """Raised when Groq service cannot provide a valid completion."""


class GroqService:
    """Thin reusable wrapper around Groq chat-completions API."""

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
        self.api_key = settings.GROQ_API_KEY
        self.api_url = settings.GROQ_API_URL
        self.model = settings.GROQ_MODEL
        self.timeout_seconds = settings.GROQ_REQUEST_TIMEOUT_SECONDS

    def _ensure_configured(self) -> None:
        if not self.api_key:
            raise GroqServiceError("GROQ_API_KEY is not configured.")

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

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "temperature": self._temperature_for_prompt(prompt),
            "messages": [
                {
                    "role": "system",
                    "content": system_instruction,
                },
                {"role": "user", "content": prompt},
            ],
        }

        try:
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            logger.exception("Groq API request failed")
            raise GroqServiceError("Failed to reach Groq API.") from exc

        if response.status_code >= 400:
            logger.error(
                "Groq API returned error status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
            raise GroqServiceError("Groq API returned an error response.")

        try:
            response_payload = response.json()
            content = response_payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            logger.exception("Invalid Groq API response format")
            raise GroqServiceError("Invalid Groq API response format.") from exc

        text = str(content or "").strip()
        if not text:
            raise GroqServiceError("Groq API returned an empty response.")
        return text
