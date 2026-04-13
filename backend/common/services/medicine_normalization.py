"""Deterministic medicine-name normalization and structured extraction."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from django.conf import settings

from apps.core.services.gemini_service import GeminiService, GeminiServiceError

logger = logging.getLogger("hrsp.medicine_info")


def _canonical_whitespace(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _normalize_token(value: Any) -> str:
    normalized = _canonical_whitespace(value).lower()
    normalized = re.sub(r"[^a-z0-9\s\-]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _safe_json_dict(raw_text: str) -> dict[str, Any] | None:
    text = str(raw_text or "").strip()
    if not text:
        return None

    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


@dataclass(frozen=True)
class MedicineNormalizationResult:
    original_input: str
    cleaned_input: str
    normalized_name: str
    extracted_dosage: str
    extracted_form: str
    matched_synonym: str
    fuzzy_match: str
    confidence: float
    uncertain: bool
    llm_used: bool

    def query_terms(self) -> list[str]:
        terms: list[str] = []
        for candidate in (self.normalized_name, self.cleaned_input):
            value = _normalize_token(candidate)
            if value and value not in terms:
                terms.append(value)

        first_token = (self.normalized_name or "").split(" ")[0].strip().lower()
        if len(first_token) >= 3 and first_token not in terms:
            terms.append(first_token)

        return terms


class StructuredMedicineParser:
    """Regex/rule-based parsing for medicine names, dosage, and dosage forms."""

    _DOSAGE_PATTERN = re.compile(
        r"(?<!\w)(\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|ml|l|iu|units?|%)"
        r"(?:\s*/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|ml|l|iu|units?|%))?)\b",
        flags=re.IGNORECASE,
    )
    _DEFAULT_FORM_WORDS = (
        "tablet",
        "tablets",
        "tab",
        "tabs",
        "capsule",
        "capsules",
        "cap",
        "caps",
        "syrup",
        "injection",
        "injectable",
        "drops",
        "drop",
        "cream",
        "ointment",
        "gel",
        "suspension",
        "susp",
        "solution",
        "oral solution",
        "oral suspension",
        "powder",
        "spray",
        "inhaler",
        "vial",
        "ampoule",
    )

    def __init__(self, form_words: list[str] | tuple[str, ...] | None = None) -> None:
        words = form_words or self._DEFAULT_FORM_WORDS
        escaped = sorted((re.escape(w) for w in words if str(w).strip()), key=len, reverse=True)
        self._form_pattern = re.compile(r"\b(" + "|".join(escaped) + r")\b", flags=re.IGNORECASE)

    def parse(self, raw_input: Any) -> dict[str, str]:
        original_input = _canonical_whitespace(raw_input)
        lowered = original_input.lower()

        dosage = ""
        dosage_match = self._DOSAGE_PATTERN.search(lowered)
        if dosage_match:
            dosage = _canonical_whitespace(dosage_match.group(1)).replace(" ", "")

        form = ""
        form_match = self._form_pattern.search(lowered)
        if form_match:
            form = _canonical_whitespace(form_match.group(1)).lower()

        cleaned = self._DOSAGE_PATTERN.sub(" ", lowered)
        cleaned = self._form_pattern.sub(" ", cleaned)
        cleaned = re.sub(r"[^a-z0-9\s\-]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

        return {
            "original_input": original_input,
            "name": cleaned,
            "dosage": dosage,
            "form": form,
        }


class SynonymMapper:
    """Configurable alias-to-canonical mapping helper."""

    def __init__(self, mapping: dict[str, str] | None = None) -> None:
        normalized_mapping: dict[str, str] = {}
        for raw_alias, raw_canonical in (mapping or {}).items():
            alias = _normalize_token(raw_alias)
            canonical = _normalize_token(raw_canonical)
            if not alias or not canonical:
                continue
            normalized_mapping[alias] = canonical

        self._mapping = normalized_mapping

    @property
    def mapping(self) -> dict[str, str]:
        return self._mapping

    @classmethod
    def from_settings(cls) -> "SynonymMapper":
        raw_mapping = getattr(settings, "MEDICINE_INFO_SYNONYM_MAP", [])
        return cls(mapping=cls._parse_mapping(raw_mapping))

    @classmethod
    def _parse_mapping(cls, raw_value: Any) -> dict[str, str]:
        mapping: dict[str, str] = {}

        def _parse_pair(text_value: str) -> tuple[str, str] | None:
            text = str(text_value or "").strip()
            if not text:
                return None
            for separator in ("->", ":", "="):
                if separator in text:
                    left, right = text.split(separator, 1)
                    return left, right
            return None

        def _consume(candidate: Any) -> None:
            if isinstance(candidate, dict):
                for key, value in candidate.items():
                    alias = _normalize_token(key)
                    canonical = _normalize_token(value)
                    if alias and canonical:
                        mapping[alias] = canonical
                return

            if isinstance(candidate, (list, tuple, set)):
                for item in candidate:
                    _consume(item)
                return

            if isinstance(candidate, str):
                text = candidate.strip()
                if not text:
                    return

                if text.startswith("{") or text.startswith("["):
                    try:
                        parsed = json.loads(text)
                    except json.JSONDecodeError:
                        parsed = None
                    if parsed is not None:
                        _consume(parsed)
                        return

                chunks = [part.strip() for part in text.replace(";", ",").split(",") if part.strip()]
                for chunk in chunks:
                    parsed_pair = _parse_pair(chunk)
                    if not parsed_pair:
                        continue
                    alias = _normalize_token(parsed_pair[0])
                    canonical = _normalize_token(parsed_pair[1])
                    if alias and canonical:
                        mapping[alias] = canonical

        _consume(raw_value)
        return mapping

    def resolve(self, value: str) -> tuple[str, str]:
        normalized = _normalize_token(value)
        if not normalized:
            return "", ""
        canonical = self._mapping.get(normalized)
        if canonical:
            return canonical, normalized
        return normalized, ""


class FuzzyMatcher:
    """Optional typo-correction matcher for normalized medicine names."""

    def __init__(self, candidates: list[str], *, enabled: bool, threshold: float) -> None:
        self._enabled = bool(enabled)
        self._threshold = max(0.0, min(float(threshold), 1.0))
        deduped: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            normalized = _normalize_token(candidate)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
        self._candidates = deduped

    @classmethod
    def from_settings(cls, *, mapper: SynonymMapper) -> "FuzzyMatcher":
        raw_candidates = getattr(settings, "MEDICINE_INFO_FUZZY_CANDIDATES", [])
        parsed_candidates: list[str] = []
        if isinstance(raw_candidates, str):
            parsed_candidates = [part.strip() for part in raw_candidates.replace(";", ",").split(",") if part.strip()]
        elif isinstance(raw_candidates, (list, tuple, set)):
            parsed_candidates = [str(item).strip() for item in raw_candidates if str(item).strip()]

        parsed_candidates.extend(mapper.mapping.keys())
        parsed_candidates.extend(mapper.mapping.values())

        enabled = bool(getattr(settings, "MEDICINE_INFO_ENABLE_FUZZY_MATCH", True))
        threshold = float(getattr(settings, "MEDICINE_INFO_FUZZY_THRESHOLD", 0.88) or 0.88)
        return cls(parsed_candidates, enabled=enabled, threshold=threshold)

    def resolve(self, value: str) -> tuple[str, str, float]:
        normalized = _normalize_token(value)
        if not normalized:
            return "", "", 0.0

        if not self._enabled or len(normalized) < 4 or not self._candidates:
            return normalized, "", 0.0

        best_candidate = ""
        best_score = 0.0
        for candidate in self._candidates:
            score = SequenceMatcher(None, normalized, candidate).ratio()
            if score > best_score:
                best_candidate = candidate
                best_score = score

        if best_candidate and best_candidate != normalized and best_score >= self._threshold:
            return best_candidate, best_candidate, best_score

        return normalized, "", best_score


class GeminiStructuredParser:
    """Gemini fallback parser used only for uncertain deterministic parses."""

    @classmethod
    def parse(cls, raw_input: str) -> dict[str, str] | None:
        source = _canonical_whitespace(raw_input)
        if not source:
            return None

        prompt = (
            "Extract structured medicine fields from the input and return strict JSON only with keys: "
            'name, dosage, form. Rules: name must be lowercase generic/canonical when possible; '
            "dosage should keep units when present (e.g., 500mg); form should be a singular dosage form; "
            "if unknown use empty string.\n\n"
            f"Input: {source}"
        )

        try:
            response_text = GeminiService().ask(prompt=prompt, language="en")
        except GeminiServiceError:
            logger.info(
                "Gemini structured parse unavailable",
                extra={"original_input": source},
            )
            return None

        parsed = _safe_json_dict(response_text)
        if not parsed:
            return None

        name = _normalize_token(parsed.get("name"))
        dosage = _canonical_whitespace(parsed.get("dosage")).replace(" ", "")
        form = _normalize_token(parsed.get("form"))
        return {
            "name": name,
            "dosage": dosage,
            "form": form,
        }


class MedicineNormalizationPipeline:
    """Pipeline facade combining deterministic and fallback normalization stages."""

    @classmethod
    def _is_uncertain(cls, *, name: str, confidence: float) -> bool:
        if not name:
            return True
        if len(name) < 3:
            return True
        return confidence < 0.7

    @classmethod
    def normalize(cls, raw_input: str, *, allow_gemini_fallback: bool = True) -> MedicineNormalizationResult:
        parser = StructuredMedicineParser()
        synonym_mapper = SynonymMapper.from_settings()
        fuzzy_matcher = FuzzyMatcher.from_settings(mapper=synonym_mapper)

        parsed = parser.parse(raw_input)
        resolved_name, matched_synonym = synonym_mapper.resolve(parsed["name"])
        resolved_name, fuzzy_match, fuzzy_score = fuzzy_matcher.resolve(resolved_name)

        confidence = 0.0
        if resolved_name:
            confidence = 0.82
        if matched_synonym:
            confidence = 0.9
        if fuzzy_match:
            confidence = max(confidence, 0.55 + (0.45 * fuzzy_score))

        llm_used = False
        uncertain = cls._is_uncertain(name=resolved_name, confidence=confidence)
        enable_gemini_parse = bool(getattr(settings, "MEDICINE_INFO_ENABLE_GEMINI_PARSE_FALLBACK", True))

        if allow_gemini_fallback and enable_gemini_parse and uncertain:
            llm_structured = GeminiStructuredParser.parse(parsed["original_input"])
            if llm_structured and llm_structured.get("name"):
                llm_used = True

                resolved_name, matched_synonym = synonym_mapper.resolve(llm_structured.get("name", ""))
                resolved_name, fuzzy_match, fuzzy_score = fuzzy_matcher.resolve(resolved_name)

                if llm_structured.get("dosage") and not parsed["dosage"]:
                    parsed["dosage"] = llm_structured["dosage"]
                if llm_structured.get("form") and not parsed["form"]:
                    parsed["form"] = llm_structured["form"]

                confidence = max(confidence, 0.7)
                uncertain = cls._is_uncertain(name=resolved_name, confidence=confidence)

        result = MedicineNormalizationResult(
            original_input=parsed["original_input"],
            cleaned_input=parsed["name"],
            normalized_name=resolved_name,
            extracted_dosage=parsed["dosage"],
            extracted_form=parsed["form"],
            matched_synonym=matched_synonym,
            fuzzy_match=fuzzy_match,
            confidence=round(float(confidence), 4),
            uncertain=bool(uncertain),
            llm_used=bool(llm_used),
        )

        logger.info(
            "Medicine normalization completed",
            extra={
                "original_input": result.original_input,
                "normalized_name": result.normalized_name,
                "extracted_dosage": result.extracted_dosage,
                "extracted_form": result.extracted_form,
                "matched_synonym": result.matched_synonym,
                "fuzzy_match": result.fuzzy_match,
                "normalization_confidence": result.confidence,
                "normalization_uncertain": result.uncertain,
                "gemini_parse_used": result.llm_used,
            },
        )

        return result
