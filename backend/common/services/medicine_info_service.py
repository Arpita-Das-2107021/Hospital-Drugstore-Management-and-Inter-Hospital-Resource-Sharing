"""Best-effort medicine details lookup service.

This service is intentionally outside the inventory core.
It is used for UI enrichment and optional metadata enhancement only.
"""
import json
import logging
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from typing import Any

import requests
from django.conf import settings

from apps.core.services.gemini_service import GeminiService, GeminiServiceError
from common.services.medicine_info_cache import MedicineInfoCache
from common.services.medicine_normalization import (
    MedicineNormalizationPipeline,
    MedicineNormalizationResult,
)
from common.services.medicine_translation_service import (
    MedicineTranslationService,
    normalize_medicine_language,
)

logger = logging.getLogger("hrsp.medicine_info")


class MedicineInfoService:
    """Fetch medicine metadata from external providers with graceful fallback."""

    _DEFAULT_UNAVAILABLE_MESSAGE = "No validated medicine information available from configured providers."
    _DAILYMED_XML_NS = {"h": "urn:hl7-org:v3"}
    _LOW_SIGNAL_PREFIXES = (
        "no ",
        "not available",
        "unavailable",
        "unknown",
        "n/a",
    )

    @classmethod
    def _language_metadata(
        cls,
        data: dict[str, Any],
        *,
        language: str,
        translated: bool,
        source_language: str = "en",
    ) -> dict[str, Any]:
        payload = data.copy()
        normalized_language = normalize_medicine_language(language)
        payload["language"] = normalized_language
        payload["translated"] = bool(translated)
        if translated:
            payload["sourceLanguage"] = normalize_medicine_language(source_language)
        else:
            payload.pop("sourceLanguage", None)
        return payload

    @classmethod
    def _ensure_language_metadata(
        cls,
        data: dict[str, Any],
        *,
        fallback_language: str,
    ) -> dict[str, Any]:
        payload = data.copy() if isinstance(data, dict) else {}
        language_value = normalize_medicine_language(
            payload.get("language") or fallback_language
        )
        translated_value = payload.get("translated")
        if translated_value is None:
            translated_value = language_value != "en"

        payload["language"] = language_value
        payload["translated"] = bool(translated_value)
        if payload["translated"]:
            payload.setdefault("sourceLanguage", "en")
        else:
            payload.pop("sourceLanguage", None)
        return payload

    @classmethod
    def _localize_result(
        cls,
        data: dict[str, Any],
        *,
        language: str,
        medicine_name: str,
    ) -> tuple[dict[str, Any], bool]:
        requested_language = normalize_medicine_language(language)
        english_payload = cls._language_metadata(data, language="en", translated=False)
        if requested_language == "en":
            return english_payload, True

        try:
            translated = MedicineTranslationService.translate_medicine_response(data, requested_language)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Medicine info translation failed",
                extra={
                    "medicine_name": medicine_name,
                    "requested_language": requested_language,
                    "error": str(exc),
                },
                exc_info=True,
            )
            return english_payload, False

        logger.info(
            "Medicine info translation success",
            extra={"medicine_name": medicine_name, "language": requested_language},
        )
        localized_payload = cls._language_metadata(
            translated,
            language=requested_language,
            translated=True,
            source_language="en",
        )
        return localized_payload, True

    @classmethod
    def _first_non_empty(cls, *values: Any) -> str:
        for value in values:
            normalized = str(value or "").strip()
            if normalized:
                return normalized
        return ""

    @classmethod
    def _split_config_values(cls, raw_values: Any) -> list[str]:
        """Split comma/semicolon-delimited settings into normalized URL values."""
        if raw_values is None:
            return []

        if isinstance(raw_values, (list, tuple, set)):
            candidates = raw_values
        else:
            candidates = [raw_values]

        parsed: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            text = str(candidate or "").strip()
            if not text:
                continue
            for chunk in text.split(";"):
                for part in chunk.split(","):
                    item = part.strip()
                    if not item or item in seen:
                        continue
                    seen.add(item)
                    parsed.append(item)
        return parsed

    @classmethod
    def _name_variants(
        cls,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> list[str]:
        normalized = normalization or MedicineNormalizationPipeline.normalize(
            name,
            allow_gemini_fallback=False,
        )
        query_terms = normalized.query_terms()
        if query_terms:
            return cls._dedupe(query_terms)

        fallback = " ".join(str(name or "").split()).strip().lower()
        return [fallback] if fallback else []

    @classmethod
    def _normalization_metadata(
        cls,
        normalization: MedicineNormalizationResult,
    ) -> dict[str, Any]:
        return {
            "original_input": normalization.original_input,
            "normalized_name": normalization.normalized_name,
            "cleaned_input": normalization.cleaned_input,
            "extracted_dosage": normalization.extracted_dosage,
            "extracted_form": normalization.extracted_form,
            "matched_synonym": normalization.matched_synonym,
            "fuzzy_match": normalization.fuzzy_match,
            "confidence": normalization.confidence,
            "uncertain": normalization.uncertain,
            "gemini_parse_used": normalization.llm_used,
        }

    @classmethod
    def _coerce_text_list(cls, value: Any) -> list[str]:
        if value is None:
            return []

        if isinstance(value, str):
            cleaned = " ".join(value.split())
            return [cleaned] if cleaned else []

        if isinstance(value, dict):
            values: list[str] = []
            for nested in value.values():
                values.extend(cls._coerce_text_list(nested))
            return cls._dedupe(values)

        if isinstance(value, (list, tuple, set)):
            values: list[str] = []
            for nested in value:
                values.extend(cls._coerce_text_list(nested))
            return cls._dedupe(values)

        text = str(value).strip()
        return [text] if text else []

    @classmethod
    def _first_text(cls, value: Any) -> str:
        values = cls._coerce_text_list(value)
        return values[0] if values else ""

    @classmethod
    def _dedupe(cls, values: Iterable[str]) -> list[str]:
        deduped: list[str] = []
        seen: set[str] = set()
        for value in values:
            normalized = str(value or "").strip()
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(normalized)
        return deduped

    @classmethod
    def _build_summary(cls, data: dict[str, Any]) -> str:
        snippets = []
        for key in (
            "indications",
            "use_cases",
            "warnings",
            "dosage_guidance",
            "age_guidance",
            "storage_guidance",
        ):
            values = data.get(key) or []
            if values:
                snippets.append(values[0])
        if snippets:
            return " ".join(snippets)
        return cls._DEFAULT_UNAVAILABLE_MESSAGE

    @classmethod
    def _is_meaningful_text(cls, value: Any) -> bool:
        normalized = " ".join(str(value or "").split()).strip().lower()
        if not normalized:
            return False
        if normalized == cls._DEFAULT_UNAVAILABLE_MESSAGE.lower():
            return False
        if any(normalized.startswith(prefix) for prefix in cls._LOW_SIGNAL_PREFIXES):
            low_signal_markers = ("guidance", "information", "available", "validated", "data")
            if any(marker in normalized for marker in low_signal_markers):
                return False
        return True

    @classmethod
    def _meaningful_values(cls, value: Any) -> list[str]:
        return [item for item in cls._coerce_text_list(value) if cls._is_meaningful_text(item)]

    @classmethod
    def _provider_result_score(cls, data: dict[str, Any] | None, *, query_terms: list[str]) -> float:
        if not data:
            return 0.0

        meaningful_indications = cls._meaningful_values(data.get("indications"))
        meaningful_use_cases = cls._meaningful_values(data.get("use_cases"))
        meaningful_dosage = cls._meaningful_values(data.get("dosage_guidance"))
        meaningful_warnings = cls._meaningful_values(data.get("warnings"))
        meaningful_age = cls._meaningful_values(data.get("age_guidance"))
        meaningful_storage = cls._meaningful_values(data.get("storage_guidance"))

        content_units = (
            min(2, len(meaningful_indications))
            + min(2, len(meaningful_use_cases))
            + min(1, len(meaningful_dosage))
            + min(1, len(meaningful_warnings))
            + min(1, len(meaningful_age))
            + min(1, len(meaningful_storage))
        )
        content_score = min(1.0, content_units / 8.0)

        haystack_values = [
            data.get("name"),
            data.get("generic_name"),
            *(data.get("indications") or [])[:3],
            *(data.get("use_cases") or [])[:3],
        ]
        haystack = " ".join(cls._coerce_text_list(haystack_values)).lower()
        normalized_terms = [str(term or "").strip().lower() for term in query_terms if str(term or "").strip()]
        if normalized_terms:
            term_hits = sum(1 for term in normalized_terms if term in haystack)
            relevance_score = term_hits / len(normalized_terms)
        else:
            relevance_score = 0.0

        generic_name_bonus = 0.1 if cls._is_meaningful_text(data.get("generic_name")) else 0.0
        return round((0.65 * content_score) + (0.25 * relevance_score) + generic_name_bonus, 4)

    @classmethod
    def _generic_name_quality_score(cls, candidate: Any) -> float:
        text = cls._first_text(candidate)
        if not cls._is_meaningful_text(text):
            return 0.0

        normalized = text.lower()
        score = 1.0
        if " / " in normalized or "/" in normalized:
            score -= 0.35
        if " pack " in f" {normalized} ":
            score -= 0.25
        if "[" in normalized or "]" in normalized:
            score -= 0.2
        if len(normalized) > 120:
            score -= 0.3
        elif len(normalized) <= 45:
            score += 0.1
        return round(max(0.0, score), 4)

    @classmethod
    def _prefer_generic_name(cls, existing: Any, incoming: Any) -> str:
        existing_text = cls._first_text(existing)
        incoming_text = cls._first_text(incoming)
        if not existing_text:
            return incoming_text
        if not incoming_text:
            return existing_text

        existing_score = cls._generic_name_quality_score(existing_text)
        incoming_score = cls._generic_name_quality_score(incoming_text)
        if incoming_score > existing_score:
            return incoming_text
        return existing_text

    @classmethod
    def _normalized_result(
        cls,
        *,
        name: str,
        source: str,
        found: bool,
        generic_name: str = "",
        use_cases: Iterable[str] = (),
        indications: Iterable[str] = (),
        warnings: Iterable[str] = (),
        dosage_guidance: Iterable[str] = (),
        age_guidance: Iterable[str] = (),
        storage_guidance: Iterable[str] = (),
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "found": bool(found),
            "source": source,
            "name": name,
            "generic_name": cls._first_non_empty(generic_name),
            "use_cases": cls._dedupe(use_cases),
            "indications": cls._dedupe(indications),
            "warnings": cls._dedupe(warnings),
            "dosage_guidance": cls._dedupe(dosage_guidance),
            "age_guidance": cls._dedupe(age_guidance),
            "storage_guidance": cls._dedupe(storage_guidance),
            "details": details.copy() if details else {},
        }
        payload["details"].setdefault("summary", cls._build_summary(payload))
        return payload

    @classmethod
    def _merge_results(cls, base: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
        if base is None:
            return incoming

        merged = {
            "found": bool(base.get("found") or incoming.get("found")),
            "source": incoming.get("source") or base.get("source") or "unavailable",
            "name": cls._first_non_empty(base.get("name"), incoming.get("name")),
            "generic_name": cls._prefer_generic_name(base.get("generic_name"), incoming.get("generic_name")),
            "use_cases": cls._dedupe([*(base.get("use_cases") or []), *(incoming.get("use_cases") or [])]),
            "indications": cls._dedupe([*(base.get("indications") or []), *(incoming.get("indications") or [])]),
            "warnings": cls._dedupe([*(base.get("warnings") or []), *(incoming.get("warnings") or [])]),
            "dosage_guidance": cls._dedupe(
                [*(base.get("dosage_guidance") or []), *(incoming.get("dosage_guidance") or [])]
            ),
            "age_guidance": cls._dedupe([*(base.get("age_guidance") or []), *(incoming.get("age_guidance") or [])]),
            "storage_guidance": cls._dedupe(
                [*(base.get("storage_guidance") or []), *(incoming.get("storage_guidance") or [])]
            ),
            "details": {
                **(base.get("details") or {}),
                **(incoming.get("details") or {}),
            },
        }
        merged["details"].setdefault("summary", cls._build_summary(merged))
        return merged
    @classmethod
    def _has_minimum_content(cls, data: dict[str, Any] | None) -> bool:
        if not data:
            return False
        return bool(
            cls._meaningful_values(data.get("use_cases"))
            or cls._meaningful_values(data.get("indications"))
            or cls._meaningful_values(data.get("dosage_guidance"))
        )

    @classmethod
    def _has_any_content(cls, data: dict[str, Any] | None) -> bool:
        if not data:
            return False
        return bool(
            cls._is_meaningful_text(data.get("generic_name"))
            or cls._meaningful_values(data.get("use_cases"))
            or cls._meaningful_values(data.get("indications"))
            or cls._meaningful_values(data.get("warnings"))
            or cls._meaningful_values(data.get("dosage_guidance"))
            or cls._meaningful_values(data.get("age_guidance"))
            or cls._meaningful_values(data.get("storage_guidance"))
        )

    @classmethod
    def _missing_core_sections(cls, data: dict[str, Any] | None) -> list[str]:
        if not data:
            return ["use_cases", "indications", "warnings", "dosage_guidance"]

        missing: list[str] = []
        for field_name in ("use_cases", "indications", "warnings", "dosage_guidance"):
            if not cls._meaningful_values(data.get(field_name)):
                missing.append(field_name)
        return missing

    @classmethod
    def _fallback_reason_for_payload(cls, data: dict[str, Any] | None) -> str:
        if not data:
            return "empty_payload"
        if not cls._has_any_content(data):
            return "empty_payload"
        if not cls._has_minimum_content(data):
            return "low_quality_payload"
        if cls._missing_core_sections(data):
            return "incomplete_sections"
        return ""

    @classmethod
    def _unavailable_result(cls, name: str) -> dict[str, Any]:
        return cls._normalized_result(
            name=name,
            source="unavailable",
            found=False,
            use_cases=[cls._DEFAULT_UNAVAILABLE_MESSAGE],
            indications=[cls._DEFAULT_UNAVAILABLE_MESSAGE],
            warnings=[],
            details={"summary": cls._DEFAULT_UNAVAILABLE_MESSAGE},
        )

    @classmethod
    def _request_timeout_seconds(cls) -> float:
        try:
            timeout = float(getattr(settings, "MEDICINE_INFO_REQUEST_TIMEOUT_SECONDS", 5) or 5)
        except (TypeError, ValueError):
            timeout = 5
        return max(1.0, timeout)

    @classmethod
    def _retry_count(cls) -> int:
        try:
            retries = int(getattr(settings, "MEDICINE_INFO_RETRY_COUNT", 1) or 1)
        except (TypeError, ValueError):
            retries = 1
        return max(1, retries)

    @classmethod
    def _cache_ttl_seconds(cls) -> int:
        configured = getattr(settings, "MEDICINE_INFO_CACHE_TTL", None)
        if configured in {None, ""}:
            configured = getattr(settings, "MEDICINE_INFO_CACHE_TTL_SECONDS", 86400)
        try:
            ttl = int(configured or 0)
        except (TypeError, ValueError):
            ttl = 86400
        return max(0, ttl)

    @classmethod
    def _stale_cache_ttl_seconds(cls) -> int:
        default_ttl = cls._cache_ttl_seconds() * 7
        if default_ttl <= 0:
            default_ttl = 7 * 24 * 60 * 60
        try:
            ttl = int(getattr(settings, "MEDICINE_INFO_STALE_CACHE_TTL", default_ttl) or 0)
        except (TypeError, ValueError):
            ttl = default_ttl
        return max(0, ttl)

    @classmethod
    def _finalize_result(cls, result: dict[str, Any]) -> dict[str, Any]:
        finalized = result.copy()
        has_valid_content = cls._has_minimum_content(finalized)
        if not finalized.get("use_cases"):
            finalized["use_cases"] = [cls._DEFAULT_UNAVAILABLE_MESSAGE]
        if not finalized.get("indications"):
            finalized["indications"] = [cls._DEFAULT_UNAVAILABLE_MESSAGE]
        finalized["found"] = bool(has_valid_content)
        finalized.setdefault("details", {})
        finalized["details"].setdefault("summary", cls._build_summary(finalized))
        finalized["details"].setdefault(
            "validation",
            {
                "validated": bool(has_valid_content),
                "reason": "minimum_clinical_content" if has_valid_content else "insufficient_clinical_content",
            },
        )
        return finalized

    @classmethod
    def _dailymed_row_score(cls, row: dict[str, Any], *, query_terms: list[str]) -> float:
        title = cls._first_text(row.get("title"))
        generic_name = cls._first_text(row.get("generic_name"))
        active_ingredient = cls._first_text(row.get("active_ingredient"))
        haystack = " ".join([title, generic_name, active_ingredient]).lower()

        normalized_terms = [str(term or "").strip().lower() for term in query_terms if str(term or "").strip()]
        relevance_hits = sum(1 for term in normalized_terms if term in haystack)
        relevance_score = (relevance_hits / len(normalized_terms)) if normalized_terms else 0.0

        complexity_penalty = 0.0
        complexity_source = " ".join([generic_name, title]).lower()
        if " / " in complexity_source or "/" in complexity_source:
            complexity_penalty += 0.2
        if " pack " in f" {complexity_source} ":
            complexity_penalty += 0.2
        if "[" in complexity_source or "]" in complexity_source:
            complexity_penalty += 0.1
        if len(complexity_source) > 140:
            complexity_penalty += 0.2

        generic_bonus = 0.15 if cls._is_meaningful_text(generic_name) else 0.0
        score = max(0.0, (0.6 * relevance_score) + generic_bonus + 0.2 - complexity_penalty)
        return round(score, 4)

    @classmethod
    def _response_contract(cls, data: dict[str, Any], *, hit: bool, stale: bool) -> dict[str, Any]:
        return {
            "success": True,
            "data": data,
            "cache": {
                "hit": bool(hit),
                "stale": bool(stale),
            },
        }

    @classmethod
    def _request_json(cls, url: str, *, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        last_error: Exception | None = None
        for _ in range(cls._retry_count()):
            try:
                response = requests.get(url, params=params, timeout=cls._request_timeout_seconds())
                response.raise_for_status()
                payload = response.json()
                return payload if isinstance(payload, dict) else None
            except Exception as exc:  # noqa: BLE001
                last_error = exc

        if last_error is not None:
            raise last_error
        return None

    @classmethod
    def _request_text(cls, url: str, *, params: dict[str, Any] | None = None) -> str:
        last_error: Exception | None = None
        for _ in range(cls._retry_count()):
            try:
                response = requests.get(url, params=params, timeout=cls._request_timeout_seconds())
                response.raise_for_status()
                return response.text or ""
            except Exception as exc:  # noqa: BLE001
                last_error = exc

        if last_error is not None:
            raise last_error
        return ""

    @classmethod
    def _dailymed_xml_sections(cls, xml_text: str) -> list[dict[str, str]]:
        text = str(xml_text or "").strip()
        if not text:
            return []

        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            return []

        sections: list[dict[str, str]] = []
        for section in root.findall(".//h:section", cls._DAILYMED_XML_NS):
            title_node = section.find("h:title", cls._DAILYMED_XML_NS)
            title = str(getattr(title_node, "text", "") or "").strip()

            code_node = section.find("h:code", cls._DAILYMED_XML_NS)
            display = ""
            if code_node is not None:
                display = str(code_node.attrib.get("displayName") or "").strip()

            text_node = section.find("h:text", cls._DAILYMED_XML_NS)
            body = ""
            if text_node is not None:
                body = " ".join(" ".join(text_node.itertext()).split())

            if not body:
                continue

            sections.append({
                "title": title,
                "display": display,
                "text": body,
            })

        return sections

    @classmethod
    def _dailymed_extract_sections(cls, sections: list[dict[str, str]], keywords: tuple[str, ...], *, max_items: int = 6) -> list[str]:
        lowered = tuple(str(keyword or "").lower() for keyword in keywords if str(keyword or "").strip())
        matches: list[str] = []

        for section in sections:
            header = f"{section.get('title','')} {section.get('display','')}".lower()
            if lowered and not any(keyword in header for keyword in lowered):
                continue
            text = str(section.get("text") or "").strip()
            if text:
                matches.append(text)
            if len(matches) >= max_items:
                break

        return cls._dedupe(matches)[:max_items]

    @classmethod
    def _provider_urls(cls) -> list[str]:
        providers: list[str] = []
        primary = str(getattr(settings, "MEDICINE_INFO_PRIMARY_API", "") or "").strip()
        providers.extend(cls._split_config_values(primary))

        fallback = getattr(settings, "MEDICINE_INFO_FALLBACK_APIS", []) or []
        providers.extend(cls._split_config_values(fallback))
        return providers

    @classmethod
    def _extract_by_keywords(cls, payload: Any, keywords: tuple[str, ...], *, max_items: int = 6) -> list[str]:
        matches: list[str] = []
        lowered_keywords = tuple(keyword.lower() for keyword in keywords)

        def _walk(node: Any):
            if len(matches) >= max_items:
                return

            if isinstance(node, dict):
                for key, value in node.items():
                    key_text = str(key or "").lower()
                    if any(keyword in key_text for keyword in lowered_keywords):
                        matches.extend(cls._coerce_text_list(value))
                        if len(matches) >= max_items:
                            return
                    _walk(value)
                    if len(matches) >= max_items:
                        return
            elif isinstance(node, (list, tuple, set)):
                for item in node:
                    _walk(item)
                    if len(matches) >= max_items:
                        return

        _walk(payload)
        return cls._dedupe(matches)[:max_items]

    @classmethod
    def _fetch_openfda_label(
        cls,
        base_url: str,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> dict[str, Any] | None:
        results = None
        for candidate in cls._name_variants(name, normalization=normalization):
            escaped_name = candidate.replace('"', "")
            payload = cls._request_json(
                base_url,
                params={
                    "search": (
                        f'openfda.brand_name:"{escaped_name}"+OR+'
                        f'openfda.generic_name:"{escaped_name}"+OR+'
                        f'openfda.substance_name:"{escaped_name}"'
                    ),
                    "limit": 1,
                },
            )
            results = (payload or {}).get("results") if isinstance(payload, dict) else None
            if isinstance(results, list) and results:
                break

        if not isinstance(results, list) or not results:
            return None

        record = results[0] if isinstance(results[0], dict) else {}
        openfda = record.get("openfda") if isinstance(record.get("openfda"), dict) else {}

        generic_name = cls._first_non_empty(
            cls._first_text(openfda.get("generic_name")),
            cls._first_text(openfda.get("substance_name")),
            cls._first_text(record.get("generic_name")),
        )
        indications = cls._dedupe(
            [
                *cls._coerce_text_list(record.get("indications_and_usage")),
                *cls._coerce_text_list(record.get("indications")),
            ]
        )
        use_cases = cls._dedupe(
            [
                *cls._coerce_text_list(record.get("purpose")),
                *indications,
            ]
        )
        warnings = cls._dedupe(
            [
                *cls._coerce_text_list(record.get("warnings")),
                *cls._coerce_text_list(record.get("warnings_and_cautions")),
                *cls._coerce_text_list(record.get("warnings_and_precautions")),
                *cls._coerce_text_list(record.get("boxed_warning")),
            ]
        )
        dosage_guidance = cls._dedupe(
            [
                *cls._coerce_text_list(record.get("dosage_and_administration")),
                *cls._coerce_text_list(record.get("dosage_forms_and_strengths")),
            ]
        )
        age_guidance = cls._dedupe(
            [
                *cls._coerce_text_list(record.get("pediatric_use")),
                *cls._coerce_text_list(record.get("geriatric_use")),
                *cls._coerce_text_list(record.get("pregnancy")),
                *cls._coerce_text_list(record.get("lactation")),
            ]
        )
        storage_guidance = cls._dedupe(
            [
                *cls._coerce_text_list(record.get("storage_and_handling")),
                *cls._coerce_text_list(record.get("how_supplied")),
            ]
        )

        return cls._normalized_result(
            name=name,
            source=base_url,
            found=True,
            generic_name=generic_name,
            use_cases=use_cases,
            indications=indications,
            warnings=warnings,
            dosage_guidance=dosage_guidance,
            age_guidance=age_guidance,
            storage_guidance=storage_guidance,
            details={"provider": "openfda_label"},
        )

    @classmethod
    def _fetch_rxnav(
        cls,
        base_url: str,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> dict[str, Any] | None:
        endpoint = f"{base_url.rstrip('/')}/drugs.json"
        concept_groups = None
        for candidate in cls._name_variants(name, normalization=normalization):
            payload = cls._request_json(endpoint, params={"name": candidate})
            drug_group = (payload or {}).get("drugGroup") if isinstance(payload, dict) else None
            concept_groups = (drug_group or {}).get("conceptGroup") if isinstance(drug_group, dict) else None
            if isinstance(concept_groups, list):
                break
        if not isinstance(concept_groups, list):
            return None

        names: list[str] = []
        for concept_group in concept_groups:
            if not isinstance(concept_group, dict):
                continue
            concept_properties = concept_group.get("conceptProperties")
            if not isinstance(concept_properties, list):
                continue
            for concept in concept_properties:
                if not isinstance(concept, dict):
                    continue
                concept_name = str(concept.get("name") or "").strip()
                if concept_name:
                    names.append(concept_name)

        if not names:
            return None

        normalized_terms = cls._name_variants(name, normalization=normalization)

        def _rxnav_name_score(candidate: str) -> float:
            lowered = candidate.lower()
            term_hits = sum(1 for term in normalized_terms if term.lower() in lowered)
            relevance = term_hits / len(normalized_terms) if normalized_terms else 0.0
            return cls._generic_name_quality_score(candidate) + (0.4 * relevance)

        ranked_names = sorted(cls._dedupe(names), key=_rxnav_name_score, reverse=True)
        selected_name = ranked_names[0]

        return cls._normalized_result(
            name=name,
            source=base_url,
            found=True,
            generic_name=selected_name,
            use_cases=[],
            indications=[],
            warnings=[],
            details={"provider": "rxnav", "matched_names": ranked_names[:5]},
        )

    @classmethod
    def _fetch_dailymed(
        cls,
        base_url: str,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> dict[str, Any] | None:
        base = base_url.rstrip("/")
        selected_row: dict[str, Any] | None = None
        best_row_score = -1.0
        query_terms = cls._name_variants(name, normalization=normalization)
        page_size = int(getattr(settings, "MEDICINE_INFO_DAILYMED_PAGE_SIZE", 8) or 8)
        page_size = max(1, min(page_size, 20))

        for candidate in query_terms:
            listing_payload = cls._request_json(
                f"{base}/spls.json",
                params={"drug_name": candidate, "pagesize": page_size},
            )
            rows = (listing_payload or {}).get("data") if isinstance(listing_payload, dict) else None
            if isinstance(rows, list) and rows:
                for row_candidate in rows:
                    if not isinstance(row_candidate, dict):
                        continue
                    row_score = cls._dailymed_row_score(row_candidate, query_terms=query_terms)
                    if row_score > best_row_score:
                        best_row_score = row_score
                        selected_row = row_candidate

        if not isinstance(selected_row, dict):
            return None

        row = selected_row
        setid = str(row.get("setid") or "").strip()
        xml_sections: list[dict[str, str]] = []
        if setid:
            try:
                xml_text = cls._request_text(f"{base}/spls/{setid}.xml")
                xml_sections = cls._dailymed_xml_sections(xml_text)
            except Exception:  # noqa: BLE001
                xml_sections = []

        generic_name = cls._first_non_empty(
            cls._first_text(row.get("generic_name")),
            cls._first_text(row.get("active_ingredient")),
            cls._first_text(row.get("title")),
        )
        indications = cls._dedupe(
            [
                *cls._dailymed_extract_sections(xml_sections, ("indication", "usage", "purpose")),
                *cls._extract_by_keywords(row, ("indication", "usage")),
            ]
        )
        use_cases = cls._dedupe(
            [
                *cls._dailymed_extract_sections(xml_sections, ("purpose", "indication", "usage")),
                *cls._extract_by_keywords(row, ("purpose",)),
            ]
        )
        warnings = cls._dedupe(
            [
                *cls._dailymed_extract_sections(xml_sections, ("warning", "precaution", "contraindication")),
                *cls._extract_by_keywords(row, ("warning",)),
            ]
        )
        dosage_guidance = cls._dedupe(
            [
                *cls._dailymed_extract_sections(xml_sections, ("dosage", "administration", "direction")),
                *cls._extract_by_keywords(row, ("dosage",)),
            ]
        )
        age_guidance = cls._dedupe(
            [
                *cls._dailymed_extract_sections(xml_sections, ("pediatric", "geriatric", "adult", "child", "pregnancy", "lactation")),
                *cls._extract_by_keywords(row, ("pediatric", "geriatric", "adult", "child")),
            ]
        )
        storage_guidance = cls._dedupe(
            [
                *cls._dailymed_extract_sections(xml_sections, ("storage", "handling", "temperature", "other information")),
                *cls._extract_by_keywords(row, ("storage", "handling", "temperature")),
            ]
        )

        return cls._normalized_result(
            name=name,
            source=base_url,
            found=True,
            generic_name=generic_name,
            use_cases=use_cases,
            indications=indications,
            warnings=warnings,
            dosage_guidance=dosage_guidance,
            age_guidance=age_guidance,
            storage_guidance=storage_guidance,
            details={"provider": "dailymed", "setid": setid, "row_score": best_row_score},
        )

    @classmethod
    def _fetch_openfda_ndc(
        cls,
        base_url: str,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> dict[str, Any] | None:
        results = None
        for candidate in cls._name_variants(name, normalization=normalization):
            escaped_name = candidate.replace('"', "")
            payload = cls._request_json(
                base_url,
                params={
                    "search": f'brand_name:"{escaped_name}"+OR+generic_name:"{escaped_name}"',
                    "limit": 1,
                },
            )
            results = (payload or {}).get("results") if isinstance(payload, dict) else None
            if isinstance(results, list) and results:
                break

        if not isinstance(results, list) or not results:
            return None

        row = results[0] if isinstance(results[0], dict) else {}
        generic_name = cls._first_non_empty(
            cls._first_text(row.get("generic_name")),
            cls._first_text(row.get("brand_name")),
        )

        return cls._normalized_result(
            name=name,
            source=base_url,
            found=True,
            generic_name=generic_name,
            use_cases=[],
            indications=[],
            warnings=[],
            details={"provider": "openfda_ndc"},
        )

    @classmethod
    def _fetch_generic_provider(
        cls,
        base_url: str,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> dict[str, Any] | None:
        payload = None
        for candidate in cls._name_variants(name, normalization=normalization):
            payload = cls._request_json(base_url, params={"q": candidate})
            if payload:
                break
        if not payload:
            return None
        return cls._normalized_result(
            name=name,
            source=base_url,
            found=True,
            generic_name=cls._first_text((payload or {}).get("generic_name")) if isinstance(payload, dict) else "",
            use_cases=cls._extract_by_keywords(payload, ("purpose", "use")),
            indications=cls._extract_by_keywords(payload, ("indication", "usage")),
            warnings=cls._extract_by_keywords(payload, ("warning", "precaution", "contraindication")),
            dosage_guidance=cls._extract_by_keywords(payload, ("dosage", "administration")),
            age_guidance=cls._extract_by_keywords(payload, ("pediatric", "geriatric", "adult", "child")),
            storage_guidance=cls._extract_by_keywords(payload, ("storage", "handling", "temperature")),
            details={"provider": "generic"},
        )

    @classmethod
    def _fetch_from_provider(
        cls,
        base_url: str,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> dict[str, Any] | None:
        lowered = base_url.lower()
        if "api.fda.gov" in lowered and "drug/label" in lowered:
            return cls._fetch_openfda_label(base_url, name, normalization=normalization)
        if "rxnav.nlm.nih.gov" in lowered:
            return cls._fetch_rxnav(base_url, name, normalization=normalization)
        if "dailymed.nlm.nih.gov" in lowered:
            return cls._fetch_dailymed(base_url, name, normalization=normalization)
        if "api.fda.gov" in lowered and "drug/ndc" in lowered:
            return cls._fetch_openfda_ndc(base_url, name, normalization=normalization)
        return cls._fetch_generic_provider(base_url, name, normalization=normalization)

    @classmethod
    def _fetch_from_provider_apis_with_status(
        cls,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> tuple[dict[str, Any] | None, bool]:
        merged_result: dict[str, Any] | None = None
        had_provider_failure = False
        providers = cls._provider_urls()
        if not providers:
            return None, False

        primary_provider = providers[0]
        fallback_triggered = False
        fallback_reason = ""
        query_terms = cls._name_variants(name, normalization=normalization)
        best_minimum_result: dict[str, Any] | None = None
        best_minimum_score = -1.0
        best_any_result: dict[str, Any] | None = None
        best_any_score = -1.0

        for provider_index, base_url in enumerate(providers):
            is_primary = provider_index == 0
            try:
                provider_result = cls._fetch_from_provider(
                    base_url,
                    name,
                    normalization=normalization,
                )
            except requests.HTTPError as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if status_code in {404, 415, 422}:
                    logger.info(
                        "Medicine info provider returned no result",
                        extra={
                            "provider": base_url,
                            "medicine_name": name,
                            "status_code": status_code,
                        },
                    )
                else:
                    logger.warning(
                        "Medicine info provider failed",
                        extra={
                            "provider": base_url,
                            "medicine_name": name,
                            "status_code": status_code,
                            "error": str(exc),
                        },
                        exc_info=True,
                    )
                    had_provider_failure = True

                if is_primary and len(providers) > 1:
                    fallback_triggered = True
                    fallback_reason = "network_failure" if status_code not in {404, 415, 422} else "primary_no_result"
                    logger.info(
                        "Medicine info fallback triggered",
                        extra={
                            "medicine_name": name,
                            "primary_provider": base_url,
                            "reason": fallback_reason,
                            "next_provider": providers[provider_index + 1],
                        },
                    )
                elif not is_primary:
                    logger.info(
                        "Medicine info fallback provider failed",
                        extra={
                            "medicine_name": name,
                            "primary_provider": primary_provider,
                            "provider": base_url,
                            "fallback_index": provider_index,
                            "trigger_reason": fallback_reason or "primary_unusable",
                        },
                    )
                continue
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Medicine info provider failed",
                    extra={"provider": base_url, "medicine_name": name, "error": str(exc)},
                    exc_info=True,
                )
                had_provider_failure = True
                if is_primary and len(providers) > 1:
                    fallback_triggered = True
                    fallback_reason = "network_failure"
                    logger.info(
                        "Medicine info fallback triggered",
                        extra={
                            "medicine_name": name,
                            "primary_provider": base_url,
                            "reason": fallback_reason,
                            "next_provider": providers[provider_index + 1],
                        },
                    )
                elif not is_primary:
                    logger.info(
                        "Medicine info fallback provider failed",
                        extra={
                            "medicine_name": name,
                            "primary_provider": primary_provider,
                            "provider": base_url,
                            "fallback_index": provider_index,
                            "trigger_reason": fallback_reason or "primary_unusable",
                        },
                    )
                continue

            if not provider_result:
                logger.info(
                    "Medicine info provider returned no data",
                    extra={"provider": base_url, "medicine_name": name},
                )
                if is_primary and len(providers) > 1:
                    fallback_triggered = True
                    fallback_reason = "empty_payload"
                    logger.info(
                        "Medicine info fallback triggered",
                        extra={
                            "medicine_name": name,
                            "primary_provider": base_url,
                            "reason": fallback_reason,
                            "next_provider": providers[provider_index + 1],
                        },
                    )
                elif not is_primary:
                    logger.info(
                        "Medicine info fallback provider returned no data",
                        extra={
                            "medicine_name": name,
                            "primary_provider": primary_provider,
                            "provider": base_url,
                            "fallback_index": provider_index,
                            "trigger_reason": fallback_reason or "primary_unusable",
                        },
                    )
                continue

            provider_score = cls._provider_result_score(provider_result, query_terms=query_terms)
            provider_has_any = cls._has_any_content(provider_result)
            provider_has_minimum = cls._has_minimum_content(provider_result)
            missing_sections = cls._missing_core_sections(provider_result)

            provider_result.setdefault("details", {})["provider_score"] = provider_score
            provider_result.setdefault("details", {})["provider_index"] = provider_index
            provider_result.setdefault("details", {})["missing_sections"] = missing_sections

            if is_primary:
                logger.info(
                    "Medicine info primary provider evaluated",
                    extra={
                        "provider": base_url,
                        "medicine_name": name,
                        "provider_score": provider_score,
                        "has_any_content": provider_has_any,
                        "has_minimum_content": provider_has_minimum,
                        "missing_sections": missing_sections,
                    },
                )

                primary_fallback_reason = cls._fallback_reason_for_payload(provider_result)
                if not primary_fallback_reason:
                    provider_result["found"] = True
                    provider_result.setdefault("details", {})["selection_reason"] = "primary_complete"
                    logger.info(
                        "Medicine info final provider selected",
                        extra={
                            "medicine_name": name,
                            "selected_provider": base_url,
                            "selection_reason": "primary_complete",
                            "fallback_triggered": False,
                            "provider_score": provider_score,
                        },
                    )
                    return provider_result, had_provider_failure

                if len(providers) > 1:
                    fallback_triggered = True
                    fallback_reason = primary_fallback_reason
                    logger.info(
                        "Medicine info fallback triggered",
                        extra={
                            "medicine_name": name,
                            "primary_provider": base_url,
                            "reason": fallback_reason,
                            "missing_sections": missing_sections,
                            "next_provider": providers[provider_index + 1],
                        },
                    )
            else:
                logger.info(
                    "Medicine info fallback provider evaluated",
                    extra={
                        "provider": base_url,
                        "medicine_name": name,
                        "fallback_index": provider_index,
                        "provider_score": provider_score,
                        "trigger_reason": fallback_reason or "primary_unusable",
                        "has_any_content": provider_has_any,
                        "has_minimum_content": provider_has_minimum,
                        "missing_sections": missing_sections,
                    },
                )

            merged_result = cls._merge_results(merged_result, provider_result)
            if provider_score > best_any_score:
                best_any_result = provider_result
                best_any_score = provider_score

            if provider_has_minimum and provider_score > best_minimum_score:
                best_minimum_result = provider_result
                best_minimum_score = provider_score

            if fallback_triggered and cls._has_minimum_content(merged_result) and not cls._missing_core_sections(merged_result):
                break

        if merged_result and cls._has_minimum_content(merged_result):
            merged_result["found"] = True
            merged_result.setdefault("details", {})["provider_score"] = cls._provider_result_score(
                merged_result,
                query_terms=query_terms,
            )
            merged_result.setdefault("details", {})["selection_reason"] = "merged_provider_data"
            logger.info(
                "Medicine info final provider selected",
                extra={
                    "medicine_name": name,
                    "selected_provider": merged_result.get("source"),
                    "selection_reason": "merged_provider_data",
                    "fallback_triggered": fallback_triggered,
                    "fallback_reason": fallback_reason,
                    "provider_score": merged_result.get("details", {}).get("provider_score"),
                },
            )
            return merged_result, had_provider_failure

        if best_minimum_result:
            best_minimum_result["found"] = True
            best_minimum_result.setdefault("details", {})["selection_reason"] = "best_minimum_content"
            logger.info(
                "Medicine info final provider selected",
                extra={
                    "medicine_name": name,
                    "selected_provider": best_minimum_result.get("source"),
                    "selection_reason": "best_minimum_content",
                    "fallback_triggered": fallback_triggered,
                    "fallback_reason": fallback_reason,
                    "provider_score": best_minimum_result.get("details", {}).get("provider_score"),
                },
            )
            return best_minimum_result, had_provider_failure

        if best_any_result and cls._has_any_content(best_any_result):
            best_any_result["found"] = False
            best_any_result.setdefault("details", {}).setdefault("summary", cls._build_summary(best_any_result))
            best_any_result.setdefault("details", {})["selection_reason"] = "best_low_signal"
            logger.info(
                "Medicine info final provider selected",
                extra={
                    "medicine_name": name,
                    "selected_provider": best_any_result.get("source"),
                    "selection_reason": "best_low_signal",
                    "fallback_triggered": fallback_triggered,
                    "fallback_reason": fallback_reason,
                    "provider_score": best_any_result.get("details", {}).get("provider_score"),
                },
            )
            return best_any_result, had_provider_failure

        if fallback_triggered:
            logger.info(
                "Medicine info fallback exhausted",
                extra={
                    "medicine_name": name,
                    "primary_provider": primary_provider,
                    "fallback_reason": fallback_reason,
                    "providers_tried": len(providers),
                },
            )
        return None, had_provider_failure

    @classmethod
    def _fetch_from_provider_apis(
        cls,
        name: str,
        *,
        normalization: MedicineNormalizationResult | None = None,
    ) -> dict[str, Any] | None:
        result, _had_provider_failure = cls._fetch_from_provider_apis_with_status(
            name,
            normalization=normalization,
        )
        return result

    @classmethod
    def _safe_json_dict(cls, raw_text: str) -> dict[str, Any] | None:
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

    @classmethod
    def _fetch_from_llm(cls, name: str) -> dict[str, Any] | None:
        prompt = (
            "Return concise medicine information for UI enrichment in strict JSON format with keys: "
            'generic_name (string), use_cases (array), indications (array), warnings (array), '
            'dosage_guidance (array), age_guidance (array), storage_guidance (array). '
            f"Medicine name: {name}. Return JSON only."
        )
        language = str(getattr(settings, "MEDICINE_INFO_LLM_LANGUAGE", "en") or "en").strip().lower()
        try:
            llm_output = GeminiService().ask(prompt=prompt, language=language)
        except GeminiServiceError:
            logger.exception("Medicine info Gemini fallback failed", extra={"medicine_name": name})
            return None

        if not llm_output:
            return None

        parsed = cls._safe_json_dict(llm_output)
        if parsed:
            result = cls._normalized_result(
                name=name,
                source="llm_fallback",
                found=True,
                generic_name=cls._first_text(parsed.get("generic_name")),
                use_cases=cls._coerce_text_list(parsed.get("use_cases")),
                indications=cls._coerce_text_list(parsed.get("indications")),
                warnings=cls._coerce_text_list(parsed.get("warnings")),
                dosage_guidance=cls._coerce_text_list(parsed.get("dosage_guidance")),
                age_guidance=cls._coerce_text_list(parsed.get("age_guidance")),
                storage_guidance=cls._coerce_text_list(parsed.get("storage_guidance")),
                details={"language": language},
            )
            if cls._has_any_content(result):
                return result

        fallback_text = str(llm_output).strip()
        return {
            "found": True,
            "source": "llm_fallback",
            "name": name,
            "generic_name": "",
            "use_cases": [fallback_text],
            "indications": [fallback_text],
            "warnings": [],
            "dosage_guidance": [],
            "age_guidance": [],
            "storage_guidance": [],
            "details": {
                "summary": fallback_text,
                "language": language,
            },
        }

    @classmethod
    def _resolution_order(cls) -> list[str]:
        order = [
            str(item).strip().lower() for item in getattr(settings, "MEDICINE_INFO_RESOLUTION_ORDER", ["api", "llm"])
            if str(item).strip()
        ]
        return order or ["api"]

    @classmethod
    def _resolve_medicine_details(
        cls,
        name: str,
        resolution_order: list[str],
        *,
        normalization: MedicineNormalizationResult | None = None,
        allow_llm_fallback: bool = True,
    ) -> tuple[dict[str, Any] | None, bool, bool]:
        merged_result: dict[str, Any] | None = None
        api_provider_failed = False
        api_provider_succeeded = False

        for index, resolver in enumerate(resolution_order):
            if resolver == "llm":
                if not allow_llm_fallback:
                    continue
                llm_name = normalization.original_input if normalization else name
                llm_result = cls._fetch_from_llm(llm_name)
                if llm_result:
                    merged_result = cls._merge_results(merged_result, llm_result)
            elif resolver == "api":
                api_result, had_provider_failure = cls._fetch_from_provider_apis_with_status(
                    name,
                    normalization=normalization,
                )
                api_provider_failed = api_provider_failed or had_provider_failure
                if api_result:
                    api_provider_succeeded = True
                    merged_result = cls._merge_results(merged_result, api_result)

            if cls._has_minimum_content(merged_result):
                source_value = str((merged_result or {}).get("source") or "").strip().lower()
                has_more_resolvers = index < len(resolution_order) - 1
                should_try_more = has_more_resolvers and source_value.startswith("llm")
                if not should_try_more:
                    break

        return merged_result, api_provider_failed, api_provider_succeeded

    @classmethod
    def _llm_fallback_uncertain_only(cls) -> bool:
        return bool(getattr(settings, "MEDICINE_INFO_LLM_FALLBACK_UNCERTAIN_ONLY", True))

    @classmethod
    def invalidate_medicine_cache(
        cls,
        medicine_name: str,
        *,
        language: str = "en",
        include_stale: bool = False,
    ) -> None:
        name = str(medicine_name or "").strip()
        if not name:
            return

        normalized_language = normalize_medicine_language(language)
        normalization = MedicineNormalizationPipeline.normalize(
            name,
            allow_gemini_fallback=False,
        )
        keys = cls._dedupe(
            [
                name,
                normalization.normalized_name,
                normalization.cleaned_input,
            ]
        )
        for cache_key in keys:
            MedicineInfoCache.invalidate(
                cache_key,
                language=normalized_language,
                include_stale=include_stale,
            )

    @classmethod
    def get_medicine_details_with_cache(
        cls,
        medicine_name: str,
        *,
        language: str = "en",
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        name = str(medicine_name or "").strip()
        requested_language = normalize_medicine_language(language)
        if not name:
            unavailable = cls._language_metadata(cls._unavailable_result(""), language="en", translated=False)
            return cls._response_contract(unavailable, hit=False, stale=False)

        normalization = MedicineNormalizationPipeline.normalize(
            name,
            allow_gemini_fallback=False,
        )
        if normalization.uncertain:
            normalization = MedicineNormalizationPipeline.normalize(
                name,
                allow_gemini_fallback=True,
            )

        query_name = normalization.normalized_name or normalization.cleaned_input or name.lower()
        cache_lookup_name = query_name
        allow_llm_fallback = (not cls._llm_fallback_uncertain_only()) or normalization.uncertain

        if force_refresh:
            cls.invalidate_medicine_cache(
                name,
                language=requested_language,
                include_stale=False,
            )

        if not force_refresh:
            cached = MedicineInfoCache.get_fresh(cache_lookup_name, language=requested_language)
            if isinstance(cached, dict):
                cached_payload = cls._ensure_language_metadata(
                    cached,
                    fallback_language=requested_language,
                )
                logger.info(
                    "Medicine info cache hit",
                    extra={
                        "medicine_name": name,
                        "normalized_name": cache_lookup_name,
                        "language": requested_language,
                        "stale": False,
                    },
                )
                return cls._response_contract(cached_payload, hit=True, stale=False)

        logger.info(
            "Medicine info cache miss",
            extra={
                "medicine_name": name,
                "normalized_name": cache_lookup_name,
                "language": requested_language,
            },
        )

        stale_cached = MedicineInfoCache.get_stale(cache_lookup_name, language=requested_language)
        resolution_order = cls._resolution_order()
        try:
            merged_result, api_provider_failed, api_provider_succeeded = cls._resolve_medicine_details(
                query_name,
                resolution_order,
                normalization=normalization,
                allow_llm_fallback=allow_llm_fallback,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Medicine info resolution failed",
                extra={
                    "medicine_name": name,
                    "normalized_name": cache_lookup_name,
                    "error": str(exc),
                },
                exc_info=True,
            )
            if isinstance(stale_cached, dict):
                stale_payload = cls._ensure_language_metadata(
                    stale_cached,
                    fallback_language=requested_language,
                )
                logger.info(
                    "Medicine info cache hit",
                    extra={
                        "medicine_name": name,
                        "normalized_name": cache_lookup_name,
                        "language": requested_language,
                        "stale": True,
                    },
                )
                return cls._response_contract(stale_payload, hit=True, stale=True)
            unavailable = cls._language_metadata(
                cls._unavailable_result(name),
                language="en",
                translated=False,
            )
            return cls._response_contract(unavailable, hit=False, stale=False)

        if api_provider_failed and not api_provider_succeeded and isinstance(stale_cached, dict):
            stale_payload = cls._ensure_language_metadata(
                stale_cached,
                fallback_language=requested_language,
            )
            logger.info(
                "Medicine info cache hit",
                extra={
                    "medicine_name": name,
                    "normalized_name": cache_lookup_name,
                    "language": requested_language,
                    "stale": True,
                },
            )
            return cls._response_contract(stale_payload, hit=True, stale=True)

        if merged_result and cls._has_any_content(merged_result):
            finalized = cls._finalize_result(merged_result)
            finalized["name"] = name
            finalized.setdefault("details", {})["normalization"] = cls._normalization_metadata(normalization)

            localized_result, _ = cls._localize_result(
                finalized,
                language=requested_language,
                medicine_name=name,
            )

            cache_language = requested_language

            if bool(localized_result.get("found")):
                MedicineInfoCache.set_success_payload(
                    cache_lookup_name,
                    localized_result,
                    language=cache_language,
                    fresh_ttl_seconds=cls._cache_ttl_seconds(),
                    stale_ttl_seconds=cls._stale_cache_ttl_seconds(),
                )
                return cls._response_contract(localized_result, hit=False, stale=False)

            if isinstance(stale_cached, dict):
                stale_payload = cls._ensure_language_metadata(
                    stale_cached,
                    fallback_language=requested_language,
                )
                logger.info(
                    "Medicine info cache hit",
                    extra={
                        "medicine_name": name,
                        "normalized_name": cache_lookup_name,
                        "language": requested_language,
                        "stale": True,
                    },
                )
                return cls._response_contract(stale_payload, hit=True, stale=True)

            logger.info(
                "Medicine info skipping cache for unvalidated payload",
                extra={
                    "medicine_name": name,
                    "normalized_name": cache_lookup_name,
                    "language": requested_language,
                },
            )
            return cls._response_contract(localized_result, hit=False, stale=False)

        if isinstance(stale_cached, dict):
            stale_payload = cls._ensure_language_metadata(
                stale_cached,
                fallback_language=requested_language,
            )
            logger.info(
                "Medicine info cache hit",
                extra={
                    "medicine_name": name,
                    "normalized_name": cache_lookup_name,
                    "language": requested_language,
                    "stale": True,
                },
            )
            return cls._response_contract(stale_payload, hit=True, stale=True)

        unavailable = cls._language_metadata(
            cls._unavailable_result(name),
            language="en",
            translated=False,
        )
        return cls._response_contract(unavailable, hit=False, stale=False)

    @classmethod
    def refresh_medicine_details(
        cls,
        medicine_name: str,
        *,
        language: str = "en",
    ) -> dict[str, Any]:
        return cls.get_medicine_details_with_cache(
            medicine_name,
            language=language,
            force_refresh=True,
        )

    @classmethod
    def get_medicine_details(
        cls,
        medicine_name: str,
        *,
        language: str = "en",
    ) -> dict[str, Any]:
        """Backward-compatible data-only accessor used by existing callers/tests."""
        return cls.get_medicine_details_with_cache(medicine_name, language=language)["data"]
