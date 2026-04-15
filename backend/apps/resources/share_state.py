"""Canonical resource-share state calculations reused across sharing APIs."""

from __future__ import annotations

from django.utils import timezone

from .models import ResourceShare


# Workflow states that should consume share availability.
SHARE_COMMITTED_WORKFLOW_STATES = (
    "APPROVED",
    "RESERVED",
    "PAYMENT_PENDING",
    "PAYMENT_COMPLETED",
    "IN_TRANSIT",
    "COMPLETED",
)


def _to_positive_int(value) -> int:
    try:
        parsed = int(value or 0)
    except (TypeError, ValueError):
        return 0
    return parsed if parsed > 0 else 0


def _request_consumption_breakdown(req) -> tuple[int, int, int]:
    """
    Return (reserved_qty, transferred_qty, committed_qty) for share capacity.

    For completed requests, committed share is tracked via transferred quantity.
    For in-flight requests, committed share is tracked via reserved quantity.
    """
    workflow_state = str(getattr(req, "workflow_state", "")).upper()
    if workflow_state == "COMPLETED":
        transferred_qty = (
            _to_positive_int(getattr(req, "quantity_transferred", 0))
            or _to_positive_int(getattr(req, "quantity_approved", 0))
            or _to_positive_int(getattr(req, "quantity_requested", 0))
        )
        return 0, transferred_qty, transferred_qty

    reserved_qty = (
        _to_positive_int(getattr(req, "quantity_reserved", 0))
        or _to_positive_int(getattr(req, "quantity_approved", 0))
        or _to_positive_int(getattr(req, "quantity_requested", 0))
    )
    return reserved_qty, 0, reserved_qty


def _empty_share_state() -> dict:
    return {
        "offered_quantity": 0,
        "reserved_quantity": 0,
        "transferred_quantity": 0,
        "committed_quantity": 0,
        "available_share_quantity": 0,
        "active_share_count": 0,
        "primary_share_id": None,
        "active_share_ids": [],
    }


def build_share_state_by_catalog(
    *,
    supplying_hospital_id,
    catalog_item_ids=None,
    exclude_request_id=None,
    lock: bool = False,
) -> dict:
    """
    Build canonical share state keyed by catalog_item_id for a supplier hospital.

    State fields:
    - offered_quantity: sum of active, unexpired share.quantity_offered
    - reserved_quantity: quantities currently reserved/in-flight by requests
    - transferred_quantity: quantities already transferred by completed requests
    - committed_quantity: reserved + transferred (consumes share availability)
    - available_share_quantity: max(0, offered - committed)
    """
    catalog_filter_ids = list(catalog_item_ids or [])

    now = timezone.now()
    share_qs = (
        ResourceShare.objects.filter(
            hospital_id=supplying_hospital_id,
            status=ResourceShare.Status.ACTIVE,
            quantity_offered__gt=0,
            catalog_item__is_shareable=True,
        )
        .filter(valid_until__isnull=True)
        | ResourceShare.objects.filter(
            hospital_id=supplying_hospital_id,
            status=ResourceShare.Status.ACTIVE,
            quantity_offered__gt=0,
            catalog_item__is_shareable=True,
            valid_until__gt=now,
        )
    )

    if catalog_filter_ids:
        share_qs = share_qs.filter(catalog_item_id__in=catalog_filter_ids)
    if lock:
        share_qs = share_qs.select_for_update()

    state_by_catalog = {}
    active_shares = share_qs.only("id", "catalog_item_id", "quantity_offered", "created_at").order_by("-created_at", "-id")
    for share in active_shares:
        state = state_by_catalog.setdefault(share.catalog_item_id, _empty_share_state())
        state["offered_quantity"] += _to_positive_int(share.quantity_offered)
        state["active_share_count"] += 1
        state["active_share_ids"].append(share.id)
        if state["primary_share_id"] is None:
            state["primary_share_id"] = share.id

    from apps.requests.models import ResourceRequest

    committed_qs = ResourceRequest.objects.filter(
        supplying_hospital_id=supplying_hospital_id,
        workflow_state__in=SHARE_COMMITTED_WORKFLOW_STATES,
    )
    if catalog_filter_ids:
        committed_qs = committed_qs.filter(catalog_item_id__in=catalog_filter_ids)
    if exclude_request_id:
        committed_qs = committed_qs.exclude(id=exclude_request_id)
    if lock:
        committed_qs = committed_qs.select_for_update()

    committed_reqs = committed_qs.only(
        "id",
        "catalog_item_id",
        "workflow_state",
        "quantity_requested",
        "quantity_approved",
        "quantity_reserved",
        "quantity_transferred",
    )
    for req in committed_reqs:
        state = state_by_catalog.setdefault(req.catalog_item_id, _empty_share_state())
        reserved_qty, transferred_qty, committed_qty = _request_consumption_breakdown(req)
        state["reserved_quantity"] += reserved_qty
        state["transferred_quantity"] += transferred_qty
        state["committed_quantity"] += committed_qty

    for state in state_by_catalog.values():
        state["available_share_quantity"] = max(0, state["offered_quantity"] - state["committed_quantity"])

    return state_by_catalog


def share_capacity_snapshot_for_catalog_item(
    *,
    supplying_hospital_id,
    catalog_item_id,
    exclude_request_id=None,
    lock: bool = False,
):
    """Return canonical share state snapshot for one catalog item, or None if no active share exists."""
    state_by_catalog = build_share_state_by_catalog(
        supplying_hospital_id=supplying_hospital_id,
        catalog_item_ids=[catalog_item_id],
        exclude_request_id=exclude_request_id,
        lock=lock,
    )
    snapshot = state_by_catalog.get(catalog_item_id)
    if not snapshot or snapshot.get("active_share_count", 0) <= 0:
        return None
    return snapshot
