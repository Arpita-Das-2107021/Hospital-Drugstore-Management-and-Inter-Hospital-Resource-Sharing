"""Shared workflow locking helpers used by update services."""

from rest_framework.exceptions import ValidationError


TERMINAL_WORKFLOW_STATES = frozenset({"COMPLETED", "CLOSED", "CANCELLED"})
WORKFLOW_LOCK_ERROR_MESSAGE = "Workflow already completed. No further updates allowed."


def is_terminal_workflow_state(workflow_state: str | None) -> bool:
    state_value = str(workflow_state or "").strip().upper()
    return state_value in TERMINAL_WORKFLOW_STATES


def ensure_workflow_is_mutable(workflow_state: str | None) -> None:
    if is_terminal_workflow_state(workflow_state):
        raise ValidationError({"detail": WORKFLOW_LOCK_ERROR_MESSAGE})


def ensure_request_workflow_is_mutable(request_obj) -> None:
    ensure_workflow_is_mutable(getattr(request_obj, "workflow_state", None))


def ensure_shipment_workflow_is_mutable(shipment_obj) -> None:
    # Import lazily to avoid app import cycles during module initialization.
    from apps.requests.models import DispatchEvent

    has_terminal_request = DispatchEvent.objects.filter(
        shipment=shipment_obj,
        request__workflow_state__in=TERMINAL_WORKFLOW_STATES,
    ).exists()
    if has_terminal_request:
        raise ValidationError({"detail": WORKFLOW_LOCK_ERROR_MESSAGE})