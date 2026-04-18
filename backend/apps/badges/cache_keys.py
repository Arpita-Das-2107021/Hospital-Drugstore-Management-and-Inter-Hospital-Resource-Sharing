"""Cache key helpers for badge counters."""

from __future__ import annotations

from datetime import date

from django.utils import timezone


def hospital_incoming_key(hospital_id: str) -> str:
    return f"badge:hospital:{hospital_id}:incoming"


def hospital_outgoing_key(hospital_id: str) -> str:
    return f"badge:hospital:{hospital_id}:outgoing"


def hospital_pending_dispatch_key(hospital_id: str) -> str:
    return f"badge:hospital:{hospital_id}:dispatch"


def hospital_request_decisions_key(hospital_id: str) -> str:
    return f"badge:hospital:{hospital_id}:request-decisions"


def hospital_update_approvals_key(hospital_id: str) -> str:
    return f"badge:hospital:{hospital_id}:update-approvals"


def hospital_completed_today_key(hospital_id: str, *, day: date | None = None) -> str:
    selected_day = day or timezone.localdate()
    return f"badge:hospital:{hospital_id}:completed:{selected_day.strftime('%Y%m%d')}"


def platform_healthcare_pending_registrations_key() -> str:
    return "badge:platform:healthcare-pending-registrations"


def platform_update_requests_key() -> str:
    return "badge:platform:update-requests"


def platform_offboarding_requests_key() -> str:
    return "badge:platform:offboarding"


def platform_pending_actions_key() -> str:
    return "badge:platform:pending-actions"


# Backward-compatible key aliases for legacy callers.
def platform_hospital_registrations_key() -> str:
    return platform_healthcare_pending_registrations_key()


def platform_update_approvals_key() -> str:
    return platform_update_requests_key()
