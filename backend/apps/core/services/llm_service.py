"""Provider-agnostic LLM service with fallback across multiple providers."""
from __future__ import annotations

from django.conf import settings

from .gemini_service import GeminiService, GeminiServiceError
from .groq_service import GroqService, GroqServiceError


class LLMServiceError(RuntimeError):
    """Raised when all configured LLM providers fail."""


class LLMService:
    """Try multiple LLM providers in configured priority order."""

    def __init__(self, provider_priority: list[str] | None = None) -> None:
        configured = provider_priority or list(getattr(settings, "LLM_PROVIDER_PRIORITY", ["groq", "gemini"]))
        self.provider_priority = [str(item).strip().lower() for item in configured if str(item).strip()]

    def ask(self, *, prompt: str, language: str) -> str:
        attempts: list[str] = []

        for provider in self.provider_priority:
            if provider == "groq":
                try:
                    return GroqService().ask(prompt=prompt, language=language)
                except GroqServiceError as exc:
                    attempts.append(f"groq: {exc}")
                    continue

            if provider == "gemini":
                try:
                    return GeminiService().ask(prompt=prompt, language=language)
                except GeminiServiceError as exc:
                    attempts.append(f"gemini: {exc}")
                    continue

            attempts.append(f"{provider}: unsupported provider")

        details = "; ".join(attempts) if attempts else "No providers configured."
        raise LLMServiceError(f"All configured LLM providers failed. {details}")
