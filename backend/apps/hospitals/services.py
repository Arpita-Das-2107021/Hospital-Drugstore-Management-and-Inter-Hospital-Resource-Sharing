"""Hospital service layer — all business logic lives here."""
import hashlib
import json
import logging
import uuid
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.authentication.models import UserAccount
from apps.authentication.services import initiate_password_reset
from apps.badges.events import (
    HospitalRegisteredEvent,
    HospitalRegistrationRejectedEvent,
    HospitalRegistrationSubmittedEvent,
    HospitalUpdateReviewedEvent,
    HospitalUpdateSubmittedEvent,
    OffboardingReviewedEvent,
    OffboardingSubmittedEvent,
)
from apps.badges.publisher import publish_badge_event
from apps.core.services.email_service import send_email
from apps.notifications.models import Notification
from apps.staff.models import HospitalRole, HospitalRolePermission, Permission, Staff, UserHospitalRole
from common.permissions.runtime import has_any_permission
from .models import (
    Hospital,
    HospitalAPIConfig,
    HospitalCapacity,
    HospitalOffboardingRequest,
    HospitalPartnership,
    HospitalRegistrationRequest,
    HospitalUpdateRequest,
)

logger = logging.getLogger("hrsp.hospitals")


def _publish_badge_event_after_commit(event) -> None:
    def _publish() -> None:
        try:
            publish_badge_event(event)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to publish hospital badge event", extra={"event_id": event.event_id})

    transaction.on_commit(_publish)

PRIMARY_HOSPITAL_ADMIN_ROLE = "HEALTHCARE_ADMIN"
HOSPITAL_ADMIN_EXTRA_PERMISSION_CODES = {
    "auth:permission.effective.view",
    "share.request.create",
    "share.request.approve",
    "inventory.batch.view",
    "inventory.cost.view",
}


DEFAULT_APPROVAL_REQUIRED_HOSPITAL_FIELDS = {
    "name",
    "registration_number",
    "hospital_type",
    "facility_classification",
    "facility_type",
    "data_submission_type",
    "email",
    "phone",
    "website",
    "address",
    "city",
    "state",
    "country",
    "latitude",
    "longitude",
    "region_level_1",
    "region_level_2",
    "region_level_3",
    "api_base_url",
    "api_auth_type",
    "api_key",
    "api_username",
    "api_password",
}

# Fields that require special handling when applying approved changes.
SPECIAL_APPROVAL_FIELDS = {
    "api_base_url",
    "api_auth_type",
    "api_key",
    "api_username",
    "api_password",
    "email",
    "registration_number",
}

REGISTRATION_MIRRORABLE_UPDATE_FIELDS = {
    "name",
    "registration_number",
    "email",
    "phone",
    "website",
    "address",
    "city",
    "state",
    "country",
    "hospital_type",
    "facility_classification",
    "facility_type",
    "data_submission_type",
    "region_level_1",
    "region_level_2",
    "region_level_3",
    "latitude",
    "longitude",
    "api_base_url",
    "api_auth_type",
    "api_username",
}

MASKED_UPDATE_FIELDS = {"api_key", "api_password"}

HOSPITAL_UPDATE_FIELD_LABELS = {
    "name": "Hospital Name",
    "registration_number": "Registration Number",
    "hospital_type": "Hospital Type",
    "facility_classification": "Hospital Category",
    "facility_type": "Facility Type",
    "data_submission_type": "Data Submission Type",
    "email": "Contact Email",
    "phone": "Contact Phone",
    "website": "Website",
    "address": "Address",
    "city": "City / District",
    "state": "State / District",
    "country": "Country",
    "latitude": "Latitude",
    "longitude": "Longitude",
    "region_level_1": "Region Level 1",
    "region_level_2": "Region Level 2",
    "region_level_3": "Region Level 3",
    "api_base_url": "API Endpoint",
    "api_auth_type": "API Auth Type",
    "api_key": "API Token",
    "api_username": "API Username",
    "api_password": "API Password",
}

REACTIVATABLE_HOSPITAL_STATUSES = {
    Hospital.VerifiedStatus.SUSPENDED,
    Hospital.VerifiedStatus.OFFBOARDED,
}

REGISTRATION_REVIEW_EMAIL_EVENT_TYPE = "registration_review_email_sent"
UPDATE_REQUEST_REVIEW_EMAIL_EVENT_TYPE = "hospital_update_review_email_sent"
HOSPITAL_UPDATE_AUDIT_EVENT_SUBMITTED = "hospital_update_request_submitted"
HOSPITAL_UPDATE_AUDIT_EVENT_APPROVED = "hospital_update_request_approved"
HOSPITAL_UPDATE_AUDIT_EVENT_REJECTED = "hospital_update_request_rejected"


class ReviewType:
    REGISTRATION = "registration"
    UPDATE_REQUEST = "update_request"

REGISTRATION_REVIEW_ISSUE_LABELS = {
    "API_VALIDATION": "API Validation",
    "ENDPOINT_CONFIGURATION": "Endpoint Configuration",
    "MISSING_REQUIRED_FIELDS": "Missing Required Fields",
    "CONTACT_INFORMATION": "Contact Information",
    "GENERAL": "General Review",
}

REGISTRATION_API_CHECK_CANDIDATES = {
    "healthcheck": ["/healthcheck", "/api/healthcheck", "/health", "/api/health"],
    "resources": ["/api/resources", "/inventory/resources", "/resources"],
    "bed": ["/api/beds", "/beds", "/bed"],
    "blood": ["/api/resources/blood", "/api/blood", "/blood", "/bloods"],
    "staff": ["/api/staff", "/staff"],
    "sales": [
        "/api/sales",
        "/sales",
        "/api/dispense",
        "/dispense",
        "/api/inventory/movements",
        "/inventory/movements",
        "/api/inventory-movements",
    ],
}

REGISTRATION_API_CHECK_ALIASES = {
    "health": "healthcheck",
    "healthcheck": "healthcheck",
    "resource": "resources",
    "resources": "resources",
    "inventory": "resources",
    "bed": "bed",
    "beds": "bed",
    "blood": "blood",
    "bloods": "blood",
    "staff": "staff",
    "sales": "sales",
    "dispense": "sales",
    "movements": "sales",
}

DEFAULT_REGISTRATION_API_CHECK_ORDER = [
    "healthcheck",
    "resources",
    "bed",
    "blood",
    "staff",
    "sales",
]

ADVANCED_INTEGRATION_REQUIRED_APIS = list(DEFAULT_REGISTRATION_API_CHECK_ORDER)

REGISTRATION_API_COLUMN_SPECS = {
    "healthcheck": {
        "required_container_groups": [["status", "healthy", "ok", "message"]],
        "known_container_columns": [
            "status",
            "healthy",
            "ok",
            "message",
            "service",
            "version",
            "timestamp",
            "uptime",
            "data",
            "meta",
        ],
        "required_item_groups": [],
        "known_item_columns": [],
        "preferred_list_key": None,
    },
    "resources": {
        "required_container_groups": [["resources", "data", "items", "results"]],
        "known_container_columns": ["resources", "data", "items", "results", "count", "next", "previous"],
        "required_item_groups": [
            ["name", "resource_name", "code"],
            ["quantity_available", "available_quantity", "units_available", "quantity"],
        ],
        "known_item_columns": [
            "name",
            "resource_name",
            "code",
            "category",
            "resource_type",
            "quantity_available",
            "available_quantity",
            "units_available",
            "quantity",
            "quantity_reserved",
            "reserved_quantity",
            "unit",
            "unit_of_measure",
            "description",
            "last_updated",
            "last_restocked_at",
            "expiry_date",
        ],
        "preferred_list_key": "resources",
    },
    "bed": {
        "required_container_groups": [
            ["bed_total", "beds_total", "total_beds"],
            ["bed_available", "beds_available", "available_beds"],
        ],
        "known_container_columns": [
            "bed_total",
            "beds_total",
            "total_beds",
            "bed_available",
            "beds_available",
            "available_beds",
            "icu_total",
            "icu_beds_total",
            "total_icu",
            "icu_available",
            "icu_beds_available",
            "available_icu",
            "data",
            "items",
            "results",
        ],
        "required_item_groups": [],
        "known_item_columns": [],
        "preferred_list_key": None,
    },
    "blood": {
        "required_container_groups": [["blood_units", "resources", "data", "items", "results"]],
        "known_container_columns": ["blood_units", "resources", "data", "items", "results", "count", "next", "previous"],
        "required_item_groups": [
            ["blood_group", "name", "resource_name", "code"],
            ["quantity_available", "available_quantity", "units_available", "quantity"],
        ],
        "known_item_columns": [
            "blood_group",
            "name",
            "resource_name",
            "code",
            "quantity_available",
            "available_quantity",
            "units_available",
            "quantity",
            "unit",
            "unit_of_measure",
            "last_updated",
            "expiry_date",
            "description",
        ],
        "preferred_list_key": "blood_units",
    },
    "staff": {
        "required_container_groups": [["staff", "data", "items", "results"]],
        "known_container_columns": ["staff", "data", "items", "results", "count", "next", "previous"],
        "required_item_groups": [
            ["employee_id", "external_staff_id", "email"],
            ["first_name", "full_name", "name"],
        ],
        "known_item_columns": [
            "employee_id",
            "external_staff_id",
            "first_name",
            "last_name",
            "full_name",
            "name",
            "email",
            "department",
            "position",
            "status",
            "employment_status",
            "phone",
            "phone_number",
        ],
        "preferred_list_key": "staff",
    },
    "sales": {
        "required_container_groups": [["sales", "dispenses", "movements", "data", "items", "results"]],
        "known_container_columns": [
            "sales",
            "dispenses",
            "movements",
            "inventory_movements",
            "transactions",
            "events",
            "data",
            "items",
            "results",
            "count",
            "next",
            "previous",
        ],
        "required_item_groups": [
            ["medicine_name", "drug_name", "item_name", "name", "resource_name", "code"],
            [
                "quantity_sold",
                "quantity_dispensed",
                "quantity",
                "qty",
                "units",
                "movement_quantity",
                "quantity_delta",
                "delta",
            ],
        ],
        "known_item_columns": [
            "external_event_id",
            "event_id",
            "sale_id",
            "dispense_id",
            "movement_id",
            "id",
            "medicine_name",
            "drug_name",
            "item_name",
            "name",
            "resource_name",
            "code",
            "quantity_sold",
            "quantity_dispensed",
            "quantity",
            "qty",
            "units",
            "movement_quantity",
            "quantity_delta",
            "delta",
            "consumed_quantity",
            "event_type",
            "movement_type",
            "direction",
            "transaction_type",
            "type",
            "operation",
            "event_date",
            "date",
            "sold_at",
            "dispensed_at",
            "occurred_at",
            "event_time",
            "timestamp",
            "created_at",
            "category",
            "unit",
            "unit_of_measure",
            "description",
        ],
        "preferred_list_key": "sales",
    },
}


def _active_registration_queryset(registration_number: str):
    return HospitalRegistrationRequest.objects.filter(
        status=HospitalRegistrationRequest.Status.ACTIVE,
        registration_number=registration_number,
    ).order_by("-reviewed_at", "-submitted_at", "-updated_at")


def _mark_hospital_inventory_verification_state(*, hospital: Hospital, status_value: str, note: str = "") -> int:
    from apps.resources.models import ResourceInventory  # noqa: PLC0415

    return ResourceInventory.objects.filter(catalog_item__hospital=hospital).update(
        verification_status=status_value,
        verification_note=note[:255],
        last_verified_at=None,
        updated_at=timezone.now(),
    )


def _build_hospital_payload_from_registration(registration: HospitalRegistrationRequest) -> dict:
    return {
        "name": registration.name,
        "registration_number": registration.registration_number,
        "email": registration.email,
        "phone": registration.phone,
        "website": registration.website,
        "address": registration.address,
        "city": registration.city,
        "state": registration.state,
        "country": registration.country,
        "facility_classification": registration.facility_classification,
        "facility_type": registration.facility_type,
        "data_submission_type": registration.data_submission_type,
        "needs_inventory_dashboard": registration.needs_inventory_dashboard,
        "inventory_source_type": registration.inventory_source_type,
        "inventory_last_sync_source": registration.inventory_last_sync_source,
        "region_level_1": registration.region_level_1,
        "region_level_2": registration.region_level_2,
        "region_level_3": registration.region_level_3,
        "logo": registration.logo,
        "latitude": registration.latitude,
        "longitude": registration.longitude,
        "hospital_type": registration.hospital_type,
    }


def _configured_approval_required_fields() -> set[str]:
    configured_fields = getattr(settings, "HOSPITAL_UPDATE_APPROVAL_REQUIRED_FIELDS", None)
    if not isinstance(configured_fields, (list, tuple, set, frozenset)):
        configured_fields = DEFAULT_APPROVAL_REQUIRED_HOSPITAL_FIELDS

    normalized = {
        str(field_name).strip()
        for field_name in configured_fields
        if str(field_name).strip()
    }
    if not normalized:
        return set(DEFAULT_APPROVAL_REQUIRED_HOSPITAL_FIELDS)
    return normalized


def _split_hospital_update_changes(data: dict) -> tuple[dict, dict]:
    direct_changes = {}
    approval_changes = {}
    approval_required_fields = _configured_approval_required_fields()

    for field, value in data.items():
        if field in approval_required_fields:
            approval_changes[field] = value
        else:
            direct_changes[field] = value
    return direct_changes, approval_changes


def _display_update_value(field_name: str, value):
    if field_name in MASKED_UPDATE_FIELDS and value not in (None, ""):
        return "***"

    if value is None:
        return "(empty)"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=True, sort_keys=True)
        except Exception:  # noqa: BLE001
            return str(value)

    return str(value)


def _update_field_label(field_name: str) -> str:
    return HOSPITAL_UPDATE_FIELD_LABELS.get(field_name, field_name.replace("_", " ").title())


def _current_update_source_value(hospital: Hospital, field_name: str):
    if field_name in {"api_base_url", "api_auth_type", "api_key", "api_username", "api_password"}:
        registration = _get_active_registration_for_hospital(hospital)
        if registration:
            return getattr(registration, field_name, None)
        return None
    return getattr(hospital, field_name, None)


def _build_update_change_diff(hospital: Hospital, changes: dict) -> dict:
    diff = {}
    for field_name, next_value in (changes or {}).items():
        previous_value = _current_update_source_value(hospital, field_name)
        diff[field_name] = {
            "label": _update_field_label(field_name),
            "old": _display_update_value(field_name, previous_value),
            "new": _display_update_value(field_name, next_value),
        }
    return diff


def _resolve_staff_user_email(staff_member) -> str:
    if not staff_member:
        return ""

    linked_user = getattr(staff_member, "user_account", None)
    if linked_user and linked_user.email:
        return str(linked_user.email).strip().lower()

    return str(getattr(staff_member, "email", "") or "").strip().lower()


def _system_admin_users_queryset():
    return UserAccount.objects.filter(is_active=True).filter(
        models.Q(
            platform_role_assignments__platform_role__name__in=(
                "SUPER_ADMIN",
                "PLATFORM_ADMIN",
                "SYSTEM_ADMIN",
            ),
            platform_role_assignments__platform_role__is_active=True,
        )
        | models.Q(
            platform_role_assignments__platform_role__is_active=True,
            platform_role_assignments__platform_role__role_permissions__permission__is_active=True,
            platform_role_assignments__platform_role__role_permissions__permission__code__in=(
                "platform:hospital.update.review",
                "platform:hospital.offboarding.review",
                "platform:hospital.review",
                "platform:hospital.manage",
            ),
        )
        | models.Q(roles__name__in=("SUPER_ADMIN", "PLATFORM_ADMIN", "SYSTEM_ADMIN"))
    ).distinct()


def _validate_hospital_unique_fields(hospital: Hospital, changes: dict) -> None:
    next_email = changes.get("email")
    next_registration_number = changes.get("registration_number")

    if next_email and Hospital.objects.exclude(id=hospital.id).filter(email__iexact=next_email).exists():
        raise ValidationError({"email": "A hospital with this email already exists."})

    if next_registration_number and Hospital.objects.exclude(id=hospital.id).filter(
        registration_number=next_registration_number
    ).exists():
        raise ValidationError(
            {"registration_number": "A hospital with this registration number already exists."}
        )


def _notify_hospital_admins_of_update_review(
    *,
    hospital: Hospital,
    update_request: HospitalUpdateRequest,
    approved: bool,
    rejection_reason: str = "",
    review_comment: str = "",
) -> None:
    recipient_map = {}

    admin_users = UserAccount.objects.filter(
        staff__hospital=hospital,
        hospital_role_assignment__hospital_role__name=PRIMARY_HOSPITAL_ADMIN_ROLE,
        hospital_role_assignment__hospital_role__is_active=True,
        is_active=True,
    ).distinct()
    for user in admin_users:
        recipient_map[str(user.id)] = user

    requester_user = getattr(getattr(update_request, "requested_by", None), "user_account", None)
    if requester_user and requester_user.is_active:
        recipient_map[str(requester_user.id)] = requester_user

    recipients = list(recipient_map.values())
    if not recipients:
        return

    status_label = "approved" if approved else "rejected"

    if approved:
        subject = f"Hospital update request approved: {hospital.name}"
        message = "Your hospital update request has been approved and the pending changes were applied."
    else:
        subject = f"Hospital update request rejected: {hospital.name}"
        message = "Your hospital update request was rejected."
        if rejection_reason:
            message = f"{message} Reason: {rejection_reason}"
    if review_comment:
        message = f"{message} Reviewer comment: {review_comment}"

    notifications = [
        Notification(
            user=user,
            notification_type=Notification.NotificationType.SYSTEM,
            message=message,
            data={
                "hospital_update_request_id": str(update_request.id),
                "approved": approved,
                "status": status_label,
            },
        )
        for user in recipients
    ]
    Notification.objects.bulk_create(notifications, batch_size=200)

    recipient_emails = [str(user.email).strip().lower() for user in recipients if getattr(user, "email", None)]
    _send_review_email(
        review_type=ReviewType.UPDATE_REQUEST,
        subject=subject,
        message=message,
        recipient_list=recipient_emails,
        actor=None,
        hospital=hospital,
        object_id=update_request.id,
        object_type="HospitalUpdateRequest",
        metadata={
            "status": status_label,
            "approved": approved,
            "review_comment": review_comment,
        },
        raise_on_failure=False,
    )


def _send_review_email(
    *,
    review_type: str,
    subject: str,
    message: str,
    recipient_list: list[str],
    actor=None,
    hospital: Hospital | None = None,
    object_id=None,
    object_type: str = "",
    metadata: dict | None = None,
    raise_on_failure: bool = False,
) -> bool:
    cleaned_recipients = []
    seen = set()
    for email in recipient_list:
        normalized_email = str(email or "").strip().lower()
        if not normalized_email or normalized_email in seen:
            continue
        cleaned_recipients.append(normalized_email)
        seen.add(normalized_email)

    if not cleaned_recipients:
        return False

    delivered = send_email(
        subject=subject,
        message=message,
        recipient_list=cleaned_recipients,
    )
    if not delivered:
        if raise_on_failure:
            raise ValidationError({"detail": "Failed to send review email. Please verify email configuration."})
        logger.warning(
            "Review email delivery failed for review_type=%s subject=%s recipients=%s",
            review_type,
            subject,
            cleaned_recipients,
        )
        return False

    event_type = (
        REGISTRATION_REVIEW_EMAIL_EVENT_TYPE
        if review_type == ReviewType.REGISTRATION
        else UPDATE_REQUEST_REVIEW_EMAIL_EVENT_TYPE
    )

    try:
        from apps.audit.services import write_audit_log  # noqa: PLC0415

        write_audit_log(
            event_type=event_type,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            hospital=hospital,
            object_id=object_id,
            object_type=object_type,
            metadata={
                "review_type": review_type,
                "subject": subject,
                "recipient_count": len(cleaned_recipients),
                **(metadata or {}),
            },
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to write review email audit log",
            extra={"review_type": review_type, "object_type": object_type},
        )

    return True


def _notify_system_admins_of_update_request_submission(*, update_request: HospitalUpdateRequest, actor) -> None:
    system_admins = list(_system_admin_users_queryset())
    if not system_admins:
        return

    hospital = update_request.hospital
    requested_changes = update_request.requested_changes or {}
    change_diff = _build_update_change_diff(hospital, requested_changes)

    requester_staff = getattr(update_request, "requested_by", None)
    requester_name = ""
    if requester_staff:
        requester_name = f"{requester_staff.first_name} {requester_staff.last_name}".strip()
    requester_email = _resolve_staff_user_email(requester_staff)
    requester_label = requester_name or requester_email or "Unknown requester"
    if requester_email and requester_email != requester_label:
        requester_label = f"{requester_label} ({requester_email})"

    body_lines = [
        "Hospital update approval required",
        "",
        f"Hospital: {hospital.name}",
        f"Requested by: {requester_label}",
        f"Requested at: {update_request.requested_at.isoformat()}",
    ]

    if update_request.reason:
        body_lines.extend(["", f"Reason: {update_request.reason}"])

    body_lines.extend(["", "Requested changes:"])
    for field_name, values in change_diff.items():
        body_lines.append(
            f"- {values['label']}: {values['old']} -> {values['new']}"
        )

    notification_message = (
        f"Hospital update request pending review for {hospital.name}. "
        f"{len(change_diff)} field(s) require approval."
    )
    Notification.objects.bulk_create(
        [
            Notification(
                user=user,
                notification_type=Notification.NotificationType.SYSTEM,
                message=notification_message,
                data={
                    "hospital_update_request_id": str(update_request.id),
                    "status": HospitalUpdateRequest.Status.PENDING,
                },
            )
            for user in system_admins
        ],
        batch_size=200,
    )

    recipient_emails = [str(user.email).strip().lower() for user in system_admins if getattr(user, "email", None)]
    _send_review_email(
        review_type=ReviewType.UPDATE_REQUEST,
        subject=f"Hospital update approval required: {hospital.name}",
        message="\n".join(body_lines),
        recipient_list=recipient_emails,
        actor=actor,
        hospital=hospital,
        object_id=update_request.id,
        object_type="HospitalUpdateRequest",
        metadata={
            "hospital_id": str(hospital.id),
            "requested_by": requester_label,
            "requested_at": update_request.requested_at.isoformat(),
            "changed_fields": sorted(requested_changes.keys()),
            "changes": change_diff,
            "reason": update_request.reason,
        },
        raise_on_failure=False,
    )


def _write_hospital_update_audit_log(
    *,
    event_type: str,
    update_request: HospitalUpdateRequest,
    actor,
    metadata: dict | None = None,
) -> None:
    try:
        from apps.audit.services import write_audit_log  # noqa: PLC0415

        write_audit_log(
            event_type=event_type,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            hospital=update_request.hospital,
            object_id=update_request.id,
            object_type="HospitalUpdateRequest",
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to write hospital update audit event",
            extra={"event_type": event_type, "update_request_id": str(update_request.id)},
        )


def _normalize_external_base_url(base_url: str) -> str:
    """
    Ensure external API URLs configured as localhost remain reachable from Dockerized workers.
    """
    import os

    if not base_url:
        return base_url

    parsed = urlsplit(base_url)
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        return base_url

    docker_host = os.getenv("HOSPITAL_API_LOCALHOST_HOST", "host.docker.internal").strip() or "host.docker.internal"
    netloc = docker_host
    if parsed.port:
        netloc = f"{docker_host}:{parsed.port}"

    return urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))


def _derive_inventory_endpoint_from_base(base_url: str) -> str:
    """
    Build a canonical inventory endpoint from a configured base URL.

    Supports both styles used in onboarding data:
      - base as root: .../mock-hospitals/city-general -> .../api/resources
      - base already ending with /api -> .../inventory/resources
    """
    if not base_url:
        return ""

    base = str(base_url).strip().rstrip("/")
    parsed = urlsplit(base)
    path = (parsed.path or "").rstrip("/").lower()

    if path.endswith("/api/resources") or path.endswith("/inventory/resources"):
        return base
    if path.endswith("/api"):
        return f"{base}/inventory/resources"
    if path.endswith("/inventory"):
        return f"{base}/resources"
    return f"{base}/api/resources"


def _extract_http_response_payload(response) -> dict:
    if response is None:
        return {}
    try:
        payload = response.json()
        return payload if isinstance(payload, dict) else {"data": payload}
    except Exception:  # noqa: BLE001
        text = (response.text or "").strip()
        if not text:
            return {}
        return {"raw": text[:2000]}


def notify_hospital_inventory_update(
    *,
    hospital: Hospital,
    operation: str,
    payload: dict,
    request_obj=None,
    endpoint_path: str = "/api/inventory/updates",
    timeout_ms: int = 10000,
) -> dict:
    """
    Best-effort outbound inventory update push to an integrated hospital system.

    This call never raises to caller; failures are captured in ExternalInventoryAPICallLog.
    """
    import requests as http_requests

    from apps.requests.models import ExternalInventoryAPICallLog

    safe_operation = (operation or "inventory_update")[:40]
    request_payload = payload or {}
    timeout_ms = max(int(timeout_ms or 10000), 1000)

    registration = _active_registration_queryset(hospital.registration_number).first()

    if not registration or not registration.api_base_url:
        logger.info(
            "Skipping external inventory update for hospital %s: no active registration/api_base_url",
            hospital.id,
        )
        return {"status": "skipped", "reason": "missing_active_registration_or_api_base_url"}

    base = _normalize_external_base_url(registration.api_base_url).rstrip("/")
    endpoint = f"{base}/{str(endpoint_path or '').lstrip('/')}"
    headers, auth = _build_registration_request_options(registration, base)
    headers = {
        **headers,
        "X-Request-Id": str(request_payload.get("event_id") or uuid.uuid4()),
        "X-Event-Type": str(request_payload.get("event_type") or safe_operation),
    }

    response = None
    response_status = None
    response_payload = {}
    call_status = ExternalInventoryAPICallLog.CallStatus.FAILED
    error_message = ""

    try:
        request_kwargs = {
            "json": request_payload,
            "headers": headers,
            "timeout": timeout_ms / 1000,
        }
        if auth is not None:
            request_kwargs["auth"] = auth

        response = http_requests.post(endpoint, **request_kwargs)
        response_status = response.status_code
        response_payload = _extract_http_response_payload(response)
        if 200 <= response.status_code < 300:
            call_status = ExternalInventoryAPICallLog.CallStatus.SUCCESS
        else:
            call_status = ExternalInventoryAPICallLog.CallStatus.FAILED
            error_message = f"non_2xx_response:{response.status_code}"
    except http_requests.Timeout as exc:
        call_status = ExternalInventoryAPICallLog.CallStatus.TIMEOUT
        error_message = str(exc)
    except Exception as exc:  # noqa: BLE001
        call_status = ExternalInventoryAPICallLog.CallStatus.FAILED
        error_message = str(exc)

    try:
        ExternalInventoryAPICallLog.objects.create(
            hospital=hospital,
            request=request_obj,
            operation=safe_operation,
            endpoint=endpoint,
            http_method="POST",
            request_payload=request_payload,
            response_status_code=response_status,
            response_payload=response_payload,
            timeout_ms=timeout_ms,
            retry_attempt=0,
            call_status=call_status,
            error_message=error_message,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to persist ExternalInventoryAPICallLog for hospital %s operation %s",
            hospital.id,
            safe_operation,
        )

    if call_status != ExternalInventoryAPICallLog.CallStatus.SUCCESS:
        logger.warning(
            "Inventory update push failed for hospital %s operation=%s endpoint=%s status=%s error=%s",
            hospital.id,
            safe_operation,
            endpoint,
            call_status,
            error_message,
        )
    else:
        logger.info(
            "Inventory update push succeeded for hospital %s operation=%s endpoint=%s",
            hospital.id,
            safe_operation,
            endpoint,
        )

    return {
        "status": call_status,
        "endpoint": endpoint,
        "http_status": response_status,
        "error": error_message,
    }


# ──────────────────────────────────────────────
# Hospital Registration (Two-Step Onboarding)
# ──────────────────────────────────────────────

def submit_registration_request(data: dict) -> HospitalRegistrationRequest:
    """
    Step 1: Hospital representative submits a registration request.
    Public endpoint — no authentication required.
    Creates a HospitalRegistrationRequest with status PENDING_APPROVAL.
    No Hospital record is created at this stage.
    """
    registration = HospitalRegistrationRequest.objects.create(**data)
    logger.info(
        "Hospital registration request submitted: %s (reg# %s)",
        registration.id, registration.registration_number,
    )

    _publish_badge_event_after_commit(
        HospitalRegistrationSubmittedEvent(
            event_id=f"registration-submitted:{registration.id}",
            registration_request_id=str(registration.id),
        )
    )
    return registration


def approve_registration_request(registration: HospitalRegistrationRequest, actor) -> dict:
    """
    Step 2 (Approve): SUPER_ADMIN approves a pending registration request.
    Atomically:
    1. Sets registration status → ACTIVE
    2. Creates Hospital record
    3. Creates HospitalCapacity record
    4. Creates/updates hospital admin account and assigns HEALTHCARE_ADMIN role
    Returns a dict with both the updated registration and the created hospital.
    """
    if registration.status != HospitalRegistrationRequest.Status.PENDING_APPROVAL:
        raise ValidationError(
            {"detail": f"Cannot approve a request with status '{registration.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)
    actor_user = actor if getattr(actor, "is_authenticated", False) else None
    admin_email = (registration.admin_email or registration.email or "").strip().lower()
    admin_name = registration.admin_name or registration.name
    name_parts = admin_name.strip().split(maxsplit=1)
    admin_first_name = name_parts[0] if name_parts else "Hospital"
    admin_last_name = name_parts[1] if len(name_parts) > 1 else "Admin"

    api_config = None
    reactivated = False

    with transaction.atomic():
        registration.status = HospitalRegistrationRequest.Status.ACTIVE
        registration.rejection_reason = ""
        registration.reviewed_by = reviewer_staff
        registration.reviewed_at = timezone.now()
        registration.save(
            update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at", "updated_at"]
        )

        existing_hospital = Hospital.objects.filter(
            registration_number=registration.registration_number
        ).first()
        if existing_hospital and existing_hospital.verified_status not in REACTIVATABLE_HOSPITAL_STATUSES:
            raise ValidationError(
                {
                    "registration_number": (
                        "A hospital with this registration number is already active in the platform."
                    )
                }
            )

        email_collision_qs = Hospital.objects.all()
        if existing_hospital:
            email_collision_qs = email_collision_qs.exclude(id=existing_hospital.id)
        if email_collision_qs.filter(email__iexact=registration.email).exists():
            raise ValidationError({"email": "A hospital with this email already exists."})

        schema_contract_status = registration.schema_contract_status
        schema_contract_failed_apis = registration.schema_contract_failed_apis or []
        schema_contract_checked_at = registration.schema_contract_checked_at
        advanced_integration_eligible = (
            registration.data_submission_type == HospitalRegistrationRequest.DataSubmissionType.API
            and bool(registration.api_base_url)
            and schema_contract_status == HospitalRegistrationRequest.SchemaContractStatus.PASSED
        )

        hospital_payload = _build_hospital_payload_from_registration(registration)
        hospital_payload.update(
            {
                "advanced_integration_eligible": advanced_integration_eligible,
                "schema_contract_status": schema_contract_status,
                "schema_contract_failed_apis": schema_contract_failed_apis,
                "schema_contract_checked_at": schema_contract_checked_at,
            }
        )
        if existing_hospital:
            hospital = existing_hospital
            for field, value in hospital_payload.items():
                setattr(hospital, field, value)
            hospital.verified_status = Hospital.VerifiedStatus.VERIFIED
            hospital.save(update_fields=list(hospital_payload.keys()) + ["verified_status", "updated_at"])
            reactivated = True
        else:
            hospital = Hospital.objects.create(
                **hospital_payload,
                verified_status=Hospital.VerifiedStatus.VERIFIED,
            )

        HospitalCapacity.objects.get_or_create(hospital=hospital)

        hospital_admin_role, _ = HospitalRole.objects.get_or_create(
            hospital=hospital,
            name=PRIMARY_HOSPITAL_ADMIN_ROLE,
            defaults={"description": "Full access within their hospital."},
        )
        default_permissions = {
            permission.code: permission
            for permission in Permission.objects.filter(is_active=True).filter(
                models.Q(code__startswith="hospital:")
                | models.Q(code__in=HOSPITAL_ADMIN_EXTRA_PERMISSION_CODES)
            )
        }

        if default_permissions:
            existing_codes = set(
                hospital_admin_role.role_permissions.values_list("permission__code", flat=True)
            )
            for code in sorted(set(default_permissions.keys()) - existing_codes):
                HospitalRolePermission.objects.get_or_create(
                    hospital_role=hospital_admin_role,
                    permission=default_permissions[code],
                    defaults={"assigned_by": actor_user},
                )

        # Ensure least-privilege onboarding role exists for routine staff members.
        from apps.staff.rbac_services import ensure_default_hospital_staff_role  # noqa: PLC0415

        ensure_default_hospital_staff_role(hospital=hospital, actor=actor_user)

        employee_id_base = f"ADMIN-{hospital.registration_number}"
        employee_id = employee_id_base
        suffix = 2
        while Staff.objects.filter(
            hospital=hospital,
            employee_id=employee_id,
            employment_status=Staff.EmploymentStatus.ACTIVE,
        ).exists():
            employee_id = f"{employee_id_base}-{suffix}"
            suffix += 1

        hospital_admin_staff = Staff.objects.create(
            hospital=hospital,
            role=None,
            email=admin_email,
            first_name=admin_first_name,
            last_name=admin_last_name,
            employee_id=employee_id,
            department="Administration",
            position="Hospital Administrator",
            employment_status=Staff.EmploymentStatus.ACTIVE,
        )

        if UserAccount.objects.filter(email__iexact=admin_email, is_active=True).exists():
            raise ValidationError(
                {
                    "admin_email": (
                        "An active user account already exists with this hospital admin email. "
                        "Use a different email for registration."
                    )
                }
            )

        admin_user = UserAccount.objects.create_user(
            email=admin_email,
            password=None,
            staff=hospital_admin_staff,
            is_active=True,
        )

        UserHospitalRole.objects.update_or_create(
            user=admin_user,
            defaults={
                "hospital": hospital,
                "hospital_role": hospital_admin_role,
                "assigned_by": actor_user,
            },
        )

        if reactivated:
            if registration.api_base_url:
                _mark_hospital_inventory_verification_state(
                    hospital=hospital,
                    status_value="pending_sync",
                    note="Hospital reactivated; awaiting external inventory synchronization.",
                )
            else:
                _mark_hospital_inventory_verification_state(
                    hospital=hospital,
                    status_value="stale",
                    note="Hospital reactivated without API sync endpoint; inventory remains stale.",
                )

        # Create a default API integration config when external API details are provided.
        if registration.api_base_url:
            from apps.resources.models import ResourceType  # noqa: PLC0415

            default_resource_type, _ = ResourceType.objects.get_or_create(name="Medication")
            api_config, _ = HospitalAPIConfig.objects.update_or_create(
                hospital=hospital,
                resource_type=default_resource_type,
                defaults={
                    "integration_type": HospitalAPIConfig.IntegrationType.API,
                    "api_endpoint": _derive_inventory_endpoint_from_base(registration.api_base_url),
                    "http_method": HospitalAPIConfig.HttpMethod.GET,
                    "auth_type": registration.api_auth_type,
                    "encrypted_token": registration.api_key,
                    "headers": {},
                    "sync_frequency": 3600,
                    "is_active": True,
                },
            )

        _active_registration_queryset(registration.registration_number).exclude(id=registration.id).update(
            status=HospitalRegistrationRequest.Status.REJECTED,
            rejection_reason="Superseded by a newer approved registration request.",
            reviewed_by=reviewer_staff,
            reviewed_at=timezone.now(),
            updated_at=timezone.now(),
        )

    logger.info(
        "Registration request %s approved by %s. Hospital %s: %s",
        registration.id,
        getattr(actor, "id", "system"),
        "reactivated" if reactivated else "created",
        hospital.id,
    )

    def _after_approval_commit() -> None:
        try:
            initiate_password_reset(
                admin_email,
                subject="Your hospital registration is approved - Set your password",
                template_name="hospital_approved.txt",
                template_context={"hospital_name": hospital.name},
            )
        except Exception:
            logger.exception(
                "Failed to send password setup email for approved registration %s",
                registration.id,
            )

        # Queue immediate first sync after approval so data is visible without waiting for the next beat cycle.
        if registration.api_base_url:
            try:
                from .tasks import sync_registration_request_api_task  # noqa: PLC0415

                sync_registration_request_api_task.delay(str(registration.id))
            except Exception:
                if reactivated:
                    _mark_hospital_inventory_verification_state(
                        hospital=hospital,
                        status_value="stale",
                        note="Failed to enqueue reactivation sync; inventory remains unverified.",
                    )
                logger.exception(
                    "Failed to enqueue initial sync task for registration %s",
                    registration.id,
                )

    transaction.on_commit(_after_approval_commit)

    _publish_badge_event_after_commit(
        HospitalRegisteredEvent(
            event_id=f"registration-approved:{registration.id}",
            registration_request_id=str(registration.id),
        )
    )

    return {"registration_request": registration, "hospital": hospital, "api_config": api_config}


def reject_registration_request(
    registration: HospitalRegistrationRequest, actor, rejection_reason: str = ""
) -> HospitalRegistrationRequest:
    """
    Step 2 (Reject): SUPER_ADMIN rejects a pending registration request.
    Sets status → REJECTED with an optional reason.
    """
    if registration.status != HospitalRegistrationRequest.Status.PENDING_APPROVAL:
        raise ValidationError(
            {"detail": f"Cannot reject a request with status '{registration.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)

    registration.status = HospitalRegistrationRequest.Status.REJECTED
    registration.rejection_reason = rejection_reason
    registration.reviewed_by = reviewer_staff
    registration.reviewed_at = timezone.now()
    registration.save(update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at", "updated_at"])

    logger.info(
        "Registration request %s rejected by %s. Reason: %s",
        registration.id, getattr(actor, "id", "system"), rejection_reason,
    )

    _publish_badge_event_after_commit(
        HospitalRegistrationRejectedEvent(
            event_id=f"registration-rejected:{registration.id}",
            registration_request_id=str(registration.id),
        )
    )
    return registration


def send_registration_review_email(
    *,
    registration: HospitalRegistrationRequest,
    actor,
    subject: str,
    message: str,
    issue_type: str = "GENERAL",
    failed_apis: list[str] | None = None,
    mark_changes_requested: bool = False,
) -> dict:
    """
    Send a formal review email to the registration contact before approval.

    Keeps registration status as pending_approval to avoid breaking the approval flow.
    When mark_changes_requested is true, writes the review message into rejection_reason
    as an actionable note for admin tracking.
    """
    if registration.status != HospitalRegistrationRequest.Status.PENDING_APPROVAL:
        raise ValidationError(
            {
                "detail": (
                    "Review email can only be sent for registration requests in pending_approval status."
                )
            }
        )

    recipient_email = (registration.admin_email or registration.email or "").strip().lower()
    if not recipient_email:
        raise ValidationError({"detail": "No registration contact email is available for this request."})

    issue_type = (issue_type or "GENERAL").upper()
    issue_label = REGISTRATION_REVIEW_ISSUE_LABELS.get(issue_type, issue_type)
    normalized_failed_apis = [str(item).strip().lower() for item in (failed_apis or []) if str(item).strip()]

    email_lines = [
        f"Dear {registration.admin_name or registration.name},",
        "",
        message.strip(),
        "",
        f"Issue type: {issue_label}",
    ]
    if normalized_failed_apis:
        email_lines.append(f"Failed APIs: {', '.join(normalized_failed_apis)}")
    email_lines.extend(
        [
            "",
            "Please update the registration details or external integration and inform the platform administrator.",
            "",
            "Regards,",
            "System Administration Team",
        ]
    )

    related_hospital = Hospital.objects.filter(registration_number=registration.registration_number).first()
    _send_review_email(
        review_type=ReviewType.REGISTRATION,
        subject=subject,
        message="\n".join(email_lines),
        recipient_list=[recipient_email],
        actor=actor,
        hospital=related_hospital,
        object_id=registration.id,
        object_type="HospitalRegistrationRequest",
        metadata={
            "recipient_email": recipient_email,
            "issue_type": issue_type,
            "failed_apis": normalized_failed_apis,
            "mark_changes_requested": mark_changes_requested,
            "message_excerpt": message.strip()[:500],
        },
        raise_on_failure=True,
    )

    review_updates = {
        "reviewed_by": getattr(actor, "staff", None),
        "reviewed_at": timezone.now(),
    }
    update_fields = ["reviewed_by", "reviewed_at", "updated_at"]
    if mark_changes_requested:
        review_updates["rejection_reason"] = message.strip()[:2000]
        update_fields.append("rejection_reason")

    for field, value in review_updates.items():
        setattr(registration, field, value)
    registration.save(update_fields=update_fields)

    logger.info(
        "Registration review email sent for %s by %s to %s",
        registration.id,
        getattr(actor, "id", "system"),
        recipient_email,
    )

    return {
        "registration": registration,
        "recipient_email": recipient_email,
        "issue_type": issue_type,
        "failed_apis": normalized_failed_apis,
        "changes_requested_marked": mark_changes_requested,
    }


def normalize_registration_api_names(api_names: list[str] | None = None) -> list[str]:
    if api_names is None:
        return list(DEFAULT_REGISTRATION_API_CHECK_ORDER)

    normalized = []
    seen = set()
    invalid = []

    for item in api_names:
        raw_name = str(item or "").strip().lower()
        if not raw_name:
            continue

        canonical_name = REGISTRATION_API_CHECK_ALIASES.get(raw_name, raw_name)
        if canonical_name not in REGISTRATION_API_CHECK_CANDIDATES:
            invalid.append(item)
            continue

        if canonical_name in seen:
            continue
        seen.add(canonical_name)
        normalized.append(canonical_name)

    if invalid:
        supported_values = ", ".join(DEFAULT_REGISTRATION_API_CHECK_ORDER)
        invalid_values = ", ".join(str(item) for item in invalid)
        raise ValidationError(
            {
                "api_names": (
                    f"Unsupported API names: {invalid_values}. "
                    f"Supported values: {supported_values}."
                )
            }
        )

    if not normalized:
        raise ValidationError({"api_names": "At least one valid API name must be provided."})

    return normalized


def _evaluate_schema_contract_state(*, api_results: dict | None) -> dict:
    required_apis = list(ADVANCED_INTEGRATION_REQUIRED_APIS)
    normalized_results = api_results or {}

    missing_apis = [api_name for api_name in required_apis if api_name not in normalized_results]
    if missing_apis:
        return {
            "status": HospitalRegistrationRequest.SchemaContractStatus.UNCHECKED,
            "required_apis": required_apis,
            "failed_apis": [],
            "missing_apis": missing_apis,
            "eligible": False,
        }

    failed_apis = []
    for api_name in required_apis:
        result = normalized_results.get(api_name)
        if not isinstance(result, dict) or result.get("status") != "success":
            failed_apis.append(api_name)

    status_value = (
        HospitalRegistrationRequest.SchemaContractStatus.PASSED
        if not failed_apis
        else HospitalRegistrationRequest.SchemaContractStatus.FAILED
    )

    return {
        "status": status_value,
        "required_apis": required_apis,
        "failed_apis": failed_apis,
        "missing_apis": [],
        "eligible": status_value == HospitalRegistrationRequest.SchemaContractStatus.PASSED,
    }


def _normalize_column_name_set(payload: dict | None) -> set[str]:
    if not isinstance(payload, dict):
        return set()
    return {
        str(column_name).strip().lower()
        for column_name in payload.keys()
        if str(column_name).strip()
    }


def _evaluate_required_column_groups(
    present_columns: set[str],
    required_groups: list[list[str]],
) -> tuple[list[dict], list[list[str]]]:
    evaluations = []
    missing_groups = []

    for group in required_groups:
        normalized_group = sorted(
            {
                str(column_name).strip().lower()
                for column_name in group
                if str(column_name).strip()
            }
        )
        matched_columns = sorted([column for column in normalized_group if column in present_columns])
        exists = bool(matched_columns)
        evaluations.append(
            {
                "alternatives": normalized_group,
                "exists": exists,
                "matched_columns": matched_columns,
            }
        )
        if not exists:
            missing_groups.append(normalized_group)

    return evaluations, missing_groups


def _extract_registration_api_sample_item(api_name: str, payload: dict | list | None) -> dict | None:
    spec = REGISTRATION_API_COLUMN_SPECS.get(api_name, {})
    preferred_list_key = spec.get("preferred_list_key")
    list_payload = _ensure_list_payload(payload, preferred_key=preferred_list_key)
    for entry in list_payload:
        if isinstance(entry, dict):
            return entry
    return None


def _build_registration_api_column_validation(api_name: str, payload: dict | list | None) -> dict:
    spec = REGISTRATION_API_COLUMN_SPECS.get(api_name, {})

    container_columns = sorted(_normalize_column_name_set(payload if isinstance(payload, dict) else {}))
    container_present = set(container_columns)
    required_container_groups = spec.get("required_container_groups", [])
    container_group_checks, missing_container_groups = _evaluate_required_column_groups(
        container_present,
        required_container_groups,
    )

    known_container_columns = set(spec.get("known_container_columns", []))
    container_additional_columns = sorted(container_present - known_container_columns) if known_container_columns else []
    container_columns_ok = not missing_container_groups

    required_item_groups = spec.get("required_item_groups", [])
    item_validation = {
        "checked": False,
        "status": "not_applicable",
        "columns_ok": None,
        "present_columns": [],
        "required_groups": [],
        "missing_required_groups": [],
        "additional_columns": [],
        "note": "Row-level column validation is not configured for this API.",
    }
    item_columns_ok = True

    if required_item_groups:
        sample_item = _extract_registration_api_sample_item(api_name, payload)
        if sample_item is None:
            _, missing_item_groups = _evaluate_required_column_groups(set(), required_item_groups)
            item_validation = {
                "checked": False,
                "status": "not_checked_no_items",
                "columns_ok": None,
                "present_columns": [],
                "required_groups": [
                    {
                        "alternatives": group,
                        "exists": False,
                        "matched_columns": [],
                    }
                    for group in missing_item_groups
                ],
                "missing_required_groups": missing_item_groups,
                "additional_columns": [],
                "note": "No data rows were returned; row-level columns were not validated.",
            }
        else:
            item_columns = sorted(_normalize_column_name_set(sample_item))
            item_present = set(item_columns)
            item_group_checks, missing_item_groups = _evaluate_required_column_groups(
                item_present,
                required_item_groups,
            )
            known_item_columns = set(spec.get("known_item_columns", []))
            item_additional_columns = sorted(item_present - known_item_columns) if known_item_columns else []
            item_columns_ok = not missing_item_groups
            item_validation = {
                "checked": True,
                "status": "ok" if item_columns_ok else "missing_required_columns",
                "columns_ok": item_columns_ok,
                "present_columns": item_columns,
                "required_groups": item_group_checks,
                "missing_required_groups": missing_item_groups,
                "additional_columns": item_additional_columns,
            }

    columns_ok = container_columns_ok and item_columns_ok
    return {
        "status": "ok" if columns_ok else "missing_required_columns",
        "columns_ok": columns_ok,
        "additional_columns_allowed": True,
        "container": {
            "columns_ok": container_columns_ok,
            "present_columns": container_columns,
            "required_groups": container_group_checks,
            "missing_required_groups": missing_container_groups,
            "additional_columns": container_additional_columns,
        },
        "item": item_validation,
    }


def _perform_registration_api_check(
    *,
    api_name: str,
    base_url: str,
    headers: dict,
    auth: tuple[str, str] | None,
    timeout_seconds: int,
) -> dict:
    import requests as http_requests
    import time

    attempted_errors = []

    for path in REGISTRATION_API_CHECK_CANDIDATES[api_name]:
        endpoint_url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
        response = None
        started = time.perf_counter()

        try:
            request_kwargs = {
                "headers": headers,
                "timeout": timeout_seconds,
            }
            if auth is not None:
                request_kwargs["auth"] = auth

            response = http_requests.get(endpoint_url, **request_kwargs)
            response.raise_for_status()

            payload = _extract_http_response_payload(response)
            column_validation = _build_registration_api_column_validation(api_name, payload)
            status_value = "success" if column_validation.get("columns_ok") else "failed"

            response_payload = {
                "status": status_value,
                "status_code": response.status_code,
                "response_time_ms": int(round((time.perf_counter() - started) * 1000)),
                "url": endpoint_url,
                "column_validation": column_validation,
            }
            if status_value != "success":
                response_payload["error"] = "missing_required_columns"

            return response_payload
        except http_requests.Timeout:
            attempted_errors.append(
                {
                    "url": endpoint_url,
                    "status_code": None,
                    "response_time_ms": int(round((time.perf_counter() - started) * 1000)),
                    "error": "timeout",
                }
            )
        except Exception as exc:  # noqa: BLE001
            response_status = getattr(response, "status_code", None)
            if response_status is None:
                response_status = getattr(getattr(exc, "response", None), "status_code", None)

            if response_status is not None:
                error_label = f"http_{response_status}"
            else:
                error_label = str(exc) or exc.__class__.__name__

            attempted_errors.append(
                {
                    "url": endpoint_url,
                    "status_code": response_status,
                    "response_time_ms": int(round((time.perf_counter() - started) * 1000)),
                    "error": error_label[:255],
                }
            )

    latest_error = attempted_errors[-1] if attempted_errors else {}
    return {
        "status": "failed",
        "status_code": latest_error.get("status_code"),
        "response_time_ms": latest_error.get("response_time_ms"),
        "error": latest_error.get("error", "request_failed"),
        "attempted_urls": [entry["url"] for entry in attempted_errors],
        "column_validation": {
            "status": "not_checked_request_failed",
            "columns_ok": False,
            "additional_columns_allowed": True,
        },
    }


def run_registration_api_checks(
    *,
    registration: HospitalRegistrationRequest,
    api_names: list[str] | None = None,
    timeout_seconds: int = 15,
) -> dict:
    if not registration.api_base_url:
        raise ValidationError({"detail": "Registration has no api_base_url configured."})

    selected_api_names = normalize_registration_api_names(api_names)
    timeout_seconds = max(1, min(int(timeout_seconds or 15), 60))

    base_url = _normalize_external_base_url(registration.api_base_url).rstrip("/")
    headers, auth = _build_registration_request_options(registration, base_url)

    checked_at = timezone.now()
    results = {}
    for api_name in selected_api_names:
        results[api_name] = _perform_registration_api_check(
            api_name=api_name,
            base_url=base_url,
            headers=headers,
            auth=auth,
            timeout_seconds=timeout_seconds,
        )

    failed_apis = [
        api_name
        for api_name, result in results.items()
        if isinstance(result, dict) and result.get("status") != "success"
    ]
    schema_failed_apis = [
        api_name
        for api_name, result in results.items()
        if isinstance(result, dict) and result.get("error") == "missing_required_columns"
    ]
    connectivity_failed_apis = [
        api_name
        for api_name, result in results.items()
        if isinstance(result, dict)
        and result.get("status") != "success"
        and result.get("error") != "missing_required_columns"
    ]

    merged_results = dict(registration.api_check_results or {})
    merged_results.update(results)
    contract_enforcement = _evaluate_schema_contract_state(api_results=merged_results)

    registration.api_check_results = merged_results
    registration.api_check_last_checked_at = checked_at
    registration.schema_contract_status = contract_enforcement["status"]
    registration.schema_contract_failed_apis = contract_enforcement["failed_apis"]
    registration.schema_contract_checked_at = checked_at
    registration.save(
        update_fields=[
            "api_check_results",
            "api_check_last_checked_at",
            "schema_contract_status",
            "schema_contract_failed_apis",
            "schema_contract_checked_at",
            "updated_at",
        ]
    )

    return {
        "registration_id": str(registration.id),
        "checked_at": checked_at,
        "checked_apis": selected_api_names,
        "failed_apis": failed_apis,
        "schema_failed_apis": schema_failed_apis,
        "connectivity_failed_apis": connectivity_failed_apis,
        "summary": {
            "total": len(selected_api_names),
            "success": len(selected_api_names) - len(failed_apis),
            "failed": len(failed_apis),
            "schema_failed": len(schema_failed_apis),
            "connectivity_failed": len(connectivity_failed_apis),
        },
        "contract_enforcement": contract_enforcement,
        "results": results,
    }


def build_registration_integration_readiness_result(check_result: dict) -> dict:
    """
    Enrich API check output with integration-readiness booleans.

    The readiness contract is used by the healthcheck alias endpoint, which must
    return true only when every required client API check succeeds.
    """
    normalized_result = dict(check_result or {})
    results = normalized_result.get("results") if isinstance(normalized_result.get("results"), dict) else {}

    checks = {}
    failed_checks = []
    errors = {}

    for api_name in DEFAULT_REGISTRATION_API_CHECK_ORDER:
        check_key = f"{api_name}_api"
        api_result = results.get(api_name)
        is_healthy = isinstance(api_result, dict) and api_result.get("status") == "success"
        checks[check_key] = is_healthy

        if is_healthy:
            continue

        failed_checks.append(check_key)
        error_label = "not_checked"
        if isinstance(api_result, dict):
            if api_result.get("error"):
                error_label = str(api_result["error"])
            elif api_result.get("status_code") is not None:
                error_label = f"http_{api_result['status_code']}"
            else:
                column_validation = api_result.get("column_validation")
                if isinstance(column_validation, dict) and column_validation.get("status"):
                    error_label = str(column_validation["status"])
                else:
                    error_label = "validation_failed"
        errors[check_key] = error_label

    all_apis_healthy = bool(checks) and all(checks.values())

    normalized_result.update(
        {
            "success": all_apis_healthy,
            "all_apis_healthy": all_apis_healthy,
            "checks": checks,
            "failed_checks": failed_checks,
            "errors": errors,
        }
    )

    return normalized_result


def get_registration_api_check_snapshot(*, registration: HospitalRegistrationRequest) -> dict:
    results = registration.api_check_results or {}
    failed_apis = [
        api_name
        for api_name, result in results.items()
        if isinstance(result, dict) and result.get("status") != "success"
    ]
    schema_failed_apis = [
        api_name
        for api_name, result in results.items()
        if isinstance(result, dict) and result.get("error") == "missing_required_columns"
    ]
    connectivity_failed_apis = [
        api_name
        for api_name, result in results.items()
        if isinstance(result, dict)
        and result.get("status") != "success"
        and result.get("error") != "missing_required_columns"
    ]

    contract_enforcement = _evaluate_schema_contract_state(api_results=results)

    return {
        "registration_id": str(registration.id),
        "checked_at": registration.api_check_last_checked_at,
        "results": results,
        "failed_apis": failed_apis,
        "schema_failed_apis": schema_failed_apis,
        "connectivity_failed_apis": connectivity_failed_apis,
        "schema_contract_status": registration.schema_contract_status,
        "schema_contract_failed_apis": registration.schema_contract_failed_apis,
        "schema_contract_checked_at": registration.schema_contract_checked_at,
        "contract_enforcement": {
            **contract_enforcement,
            "status": registration.schema_contract_status,
            "failed_apis": registration.schema_contract_failed_apis,
            "checked_at": registration.schema_contract_checked_at,
        },
        "supported_apis": list(DEFAULT_REGISTRATION_API_CHECK_ORDER),
    }


# ──────────────────────────────────────────────
# Hospital Management
# ──────────────────────────────────────────────

def create_hospital(data: dict, actor) -> Hospital:
    with transaction.atomic():
        hospital = Hospital.objects.create(**data)
        HospitalCapacity.objects.create(hospital=hospital)
        logger.info("Hospital created: %s by actor %s", hospital.id, actor.id)
    return hospital


def verify_hospital(hospital: Hospital, actor) -> Hospital:
    if hospital.verified_status == Hospital.VerifiedStatus.VERIFIED:
        raise ValidationError({"detail": "Hospital is already verified."})
    hospital.verified_status = Hospital.VerifiedStatus.VERIFIED
    hospital.save(update_fields=["verified_status", "updated_at"])
    logger.info("Hospital %s verified by %s", hospital.id, actor.id)
    return hospital


def suspend_hospital(hospital: Hospital, actor) -> Hospital:
    hospital.verified_status = Hospital.VerifiedStatus.SUSPENDED
    hospital.save(update_fields=["verified_status", "updated_at"])
    logger.info("Hospital %s suspended by %s", hospital.id, actor.id)
    return hospital


def _get_active_registration_for_hospital(hospital: Hospital) -> HospitalRegistrationRequest | None:
    return _active_registration_queryset(hospital.registration_number).first()


def _apply_direct_hospital_changes(hospital: Hospital, changes: dict) -> Hospital:
    if not changes:
        return hospital

    for field, value in changes.items():
        setattr(hospital, field, value)

    update_fields = list(changes.keys()) + ["updated_at"]
    hospital.save(update_fields=update_fields)

    # Keep active registration metadata aligned for source mode/dashboard flags.
    mirrored_fields = {"needs_inventory_dashboard", "inventory_source_type", "inventory_last_sync_source"}
    if set(changes.keys()) & mirrored_fields:
        registration = _get_active_registration_for_hospital(hospital)
        if registration:
            registration_updates = []
            for field in mirrored_fields:
                if field in changes:
                    setattr(registration, field, changes[field])
                    registration_updates.append(field)
            if registration_updates:
                registration.save(update_fields=registration_updates + ["updated_at"])

    return hospital


def _apply_approval_required_hospital_changes(hospital: Hospital, changes: dict) -> Hospital:
    if not changes:
        return hospital

    _validate_hospital_unique_fields(hospital, changes)

    non_special_changes = {
        field_name: value
        for field_name, value in changes.items()
        if field_name not in SPECIAL_APPROVAL_FIELDS
    }

    if non_special_changes:
        for field_name, value in non_special_changes.items():
            setattr(hospital, field_name, value)
        hospital.save(update_fields=list(non_special_changes.keys()) + ["updated_at"])

    hospital_changed = []
    old_registration_number = hospital.registration_number
    for field in ("email", "registration_number"):
        if field in changes:
            setattr(hospital, field, changes[field])
            hospital_changed.append(field)

    registration = _get_active_registration_for_hospital(hospital)
    if registration:
        registration_changed = []
        for field in REGISTRATION_MIRRORABLE_UPDATE_FIELDS:
            if field in changes:
                setattr(registration, field, changes[field])
                registration_changed.append(field)

        from common.utils.encryption import encrypt_value  # noqa: PLC0415

        if "api_key" in changes:
            registration.api_key = encrypt_value(changes["api_key"]) if changes["api_key"] else ""
            registration_changed.append("api_key")

        if "api_password" in changes:
            registration.api_password = (
                encrypt_value(changes["api_password"]) if changes["api_password"] else ""
            )
            registration_changed.append("api_password")

        if registration_changed:
            registration.save(update_fields=list(set(registration_changed + ["updated_at"])))

    if hospital_changed:
        hospital.save(update_fields=hospital_changed + ["updated_at"])

    api_sensitive_keys = {"api_base_url", "api_auth_type", "api_key"}
    if changes.keys() & api_sensitive_keys:
        from apps.resources.models import ResourceType  # noqa: PLC0415

        default_type, _ = ResourceType.objects.get_or_create(name="Medication")
        api_config, _ = HospitalAPIConfig.objects.get_or_create(
            hospital=hospital,
            resource_type=default_type,
            defaults={
                "integration_type": HospitalAPIConfig.IntegrationType.API,
                "api_endpoint": "",
                "auth_type": HospitalAPIConfig.AuthType.NONE,
                "http_method": HospitalAPIConfig.HttpMethod.GET,
                "is_active": True,
            },
        )

        config_changed = []
        if "api_base_url" in changes:
            api_config.api_endpoint = _derive_inventory_endpoint_from_base(changes["api_base_url"])
            config_changed.append("api_endpoint")

        if "api_auth_type" in changes:
            api_config.auth_type = changes["api_auth_type"]
            config_changed.append("auth_type")

        if "api_key" in changes:
            from common.utils.encryption import encrypt_value  # noqa: PLC0415

            api_config.encrypted_token = encrypt_value(changes["api_key"]) if changes["api_key"] else ""
            config_changed.append("encrypted_token")

        if config_changed:
            api_config.save(update_fields=list(set(config_changed + ["updated_at"])))

    if "registration_number" in changes and registration:
        # Keep linkage for systems that still resolve registration by number.
        HospitalRegistrationRequest.objects.filter(
            registration_number=old_registration_number,
            status=HospitalRegistrationRequest.Status.ACTIVE,
        ).exclude(id=registration.id).update(registration_number=hospital.registration_number)

    return hospital


def submit_hospital_update(
    *,
    hospital: Hospital,
    actor,
    validated_data: dict,
) -> dict:
    payload = dict(validated_data or {})
    request_reason = str(payload.pop("reason", "") or "").strip()

    _validate_hospital_unique_fields(hospital, payload)
    direct_changes, approval_changes = _split_hospital_update_changes(payload)
    approval_change_diff = _build_update_change_diff(hospital, approval_changes)

    if has_any_permission(
        actor,
        ("platform:hospital.manage",),
        allow_role_fallback=True,
        legacy_roles=("SUPER_ADMIN", "PLATFORM_ADMIN"),
    ):
        _apply_direct_hospital_changes(hospital, direct_changes)
        _apply_approval_required_hospital_changes(hospital, approval_changes)
        return {
            "hospital": hospital,
            "update_request": None,
            "requires_approval": False,
            "status": "Applied",
            "message": "Changes applied successfully",
        }

    pending_request = HospitalUpdateRequest.objects.filter(
        hospital=hospital,
        status=HospitalUpdateRequest.Status.PENDING,
    ).first()
    if pending_request and approval_changes:
        raise ValidationError(
            {
                "detail": "Existing update request already pending approval"
            }
        )

    _apply_direct_hospital_changes(hospital, direct_changes)

    update_request = None
    if approval_changes:
        update_request = HospitalUpdateRequest.objects.create(
            hospital=hospital,
            requested_by=getattr(actor, "staff", None),
            reason=request_reason,
            requested_changes=approval_changes,
            sensitive_changes=approval_changes,
        )

        _notify_system_admins_of_update_request_submission(
            update_request=update_request,
            actor=actor,
        )

        requester_staff = getattr(update_request, "requested_by", None)
        _write_hospital_update_audit_log(
            event_type=HOSPITAL_UPDATE_AUDIT_EVENT_SUBMITTED,
            update_request=update_request,
            actor=actor,
            metadata={
                "requested_by_user_id": str(getattr(actor, "id", "")) or None,
                "requested_by_staff_id": str(getattr(requester_staff, "id", "")) or None,
                "requested_by_email": _resolve_staff_user_email(requester_staff),
                "requested_at": update_request.requested_at.isoformat(),
                "reason": update_request.reason,
                "changed_fields": sorted(approval_changes.keys()),
                "before_after": approval_change_diff,
            },
        )

        _publish_badge_event_after_commit(
            HospitalUpdateSubmittedEvent(
                event_id=f"hospital-update-submitted:{update_request.id}",
                update_request_id=str(update_request.id),
            )
        )

    logger.info(
        "Hospital update submitted for %s by %s. direct=%s approval=%s",
        hospital.id,
        getattr(actor, "id", None),
        list(direct_changes.keys()),
        list(approval_changes.keys()),
    )
    if update_request is not None:
        return {
            "hospital": hospital,
            "update_request": update_request,
            "requires_approval": True,
            "status": "Pending",
            "message": "Changes submitted for system admin approval",
        }

    return {
        "hospital": hospital,
        "update_request": None,
        "requires_approval": False,
        "status": "Applied",
        "message": "Changes applied successfully",
    }


def approve_hospital_update_request(
    update_request: HospitalUpdateRequest,
    actor,
    review_comment: str = "",
) -> HospitalUpdateRequest:
    if update_request.status != HospitalUpdateRequest.Status.PENDING:
        raise ValidationError(
            {"detail": f"Cannot approve an update request with status '{update_request.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)
    with transaction.atomic():
        locked_request = HospitalUpdateRequest.objects.select_for_update().get(id=update_request.id)
        if locked_request.status != HospitalUpdateRequest.Status.PENDING:
            raise ValidationError(
                {"detail": f"Cannot approve an update request with status '{locked_request.status}'."}
            )

        locked_hospital = Hospital.objects.select_for_update().get(id=locked_request.hospital_id)
        approval_changes = dict(locked_request.requested_changes or locked_request.sensitive_changes or {})
        before_after = _build_update_change_diff(locked_hospital, approval_changes)

        _apply_approval_required_hospital_changes(locked_hospital, approval_changes)

        locked_request.status = HospitalUpdateRequest.Status.APPROVED
        locked_request.reviewed_by = reviewer_staff
        locked_request.reviewed_at = timezone.now()
        locked_request.rejection_reason = ""
        locked_request.review_comment = str(review_comment or "").strip()
        locked_request.save(
            update_fields=[
                "status",
                "reviewed_by",
                "reviewed_at",
                "rejection_reason",
                "review_comment",
                "updated_at",
            ]
        )

        _write_hospital_update_audit_log(
            event_type=HOSPITAL_UPDATE_AUDIT_EVENT_APPROVED,
            update_request=locked_request,
            actor=actor,
            metadata={
                "requested_by_staff_id": str(getattr(locked_request.requested_by, "id", "")) or None,
                "requested_by_email": _resolve_staff_user_email(locked_request.requested_by),
                "reviewed_by_user_id": str(getattr(actor, "id", "")) or None,
                "reviewed_by_staff_id": str(getattr(reviewer_staff, "id", "")) or None,
                "requested_at": locked_request.requested_at.isoformat(),
                "reviewed_at": locked_request.reviewed_at.isoformat() if locked_request.reviewed_at else None,
                "changed_fields": sorted(approval_changes.keys()),
                "before_after": before_after,
                "review_comment": locked_request.review_comment,
            },
        )

        approved_request = locked_request

    _notify_hospital_admins_of_update_review(
        hospital=approved_request.hospital,
        update_request=approved_request,
        approved=True,
        review_comment=str(review_comment or "").strip(),
    )

    _publish_badge_event_after_commit(
        HospitalUpdateReviewedEvent(
            event_id=f"hospital-update-reviewed:{approved_request.id}",
            update_request_id=str(approved_request.id),
            hospital_id=str(approved_request.hospital_id),
            approved=True,
        )
    )
    return approved_request


def reject_hospital_update_request(
    update_request: HospitalUpdateRequest,
    actor,
    rejection_reason: str = "",
    review_comment: str = "",
) -> HospitalUpdateRequest:
    if update_request.status != HospitalUpdateRequest.Status.PENDING:
        raise ValidationError(
            {"detail": f"Cannot reject an update request with status '{update_request.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)
    with transaction.atomic():
        locked_request = HospitalUpdateRequest.objects.select_for_update().get(id=update_request.id)
        if locked_request.status != HospitalUpdateRequest.Status.PENDING:
            raise ValidationError(
                {"detail": f"Cannot reject an update request with status '{locked_request.status}'."}
            )

        approval_changes = dict(locked_request.requested_changes or locked_request.sensitive_changes or {})
        before_after = _build_update_change_diff(locked_request.hospital, approval_changes)

        locked_request.status = HospitalUpdateRequest.Status.REJECTED
        locked_request.reviewed_by = reviewer_staff
        locked_request.reviewed_at = timezone.now()
        locked_request.rejection_reason = str(rejection_reason or "").strip()
        locked_request.review_comment = str(review_comment or "").strip()
        locked_request.save(
            update_fields=[
                "status",
                "reviewed_by",
                "reviewed_at",
                "rejection_reason",
                "review_comment",
                "updated_at",
            ]
        )

        _write_hospital_update_audit_log(
            event_type=HOSPITAL_UPDATE_AUDIT_EVENT_REJECTED,
            update_request=locked_request,
            actor=actor,
            metadata={
                "requested_by_staff_id": str(getattr(locked_request.requested_by, "id", "")) or None,
                "requested_by_email": _resolve_staff_user_email(locked_request.requested_by),
                "reviewed_by_user_id": str(getattr(actor, "id", "")) or None,
                "reviewed_by_staff_id": str(getattr(reviewer_staff, "id", "")) or None,
                "requested_at": locked_request.requested_at.isoformat(),
                "reviewed_at": locked_request.reviewed_at.isoformat() if locked_request.reviewed_at else None,
                "changed_fields": sorted(approval_changes.keys()),
                "before_after": before_after,
                "rejection_reason": locked_request.rejection_reason,
                "review_comment": locked_request.review_comment,
            },
        )

        rejected_request = locked_request

    _notify_hospital_admins_of_update_review(
        hospital=rejected_request.hospital,
        update_request=rejected_request,
        approved=False,
        rejection_reason=str(rejection_reason or "").strip(),
        review_comment=str(review_comment or "").strip(),
    )

    _publish_badge_event_after_commit(
        HospitalUpdateReviewedEvent(
            event_id=f"hospital-update-reviewed:{rejected_request.id}",
            update_request_id=str(rejected_request.id),
            hospital_id=str(rejected_request.hospital_id),
            approved=False,
        )
    )
    return rejected_request


# ──────────────────────────────────────────────
# Hospital Offboarding
# ──────────────────────────────────────────────

def _apply_hospital_offboarding_state(hospital: Hospital) -> None:
    hospital.verified_status = Hospital.VerifiedStatus.OFFBOARDED
    hospital.save(update_fields=["verified_status", "updated_at"])

    Staff.objects.filter(hospital=hospital).update(employment_status=Staff.EmploymentStatus.SUSPENDED)
    UserAccount.objects.filter(staff__hospital=hospital, is_active=True).update(is_active=False)
    HospitalAPIConfig.objects.filter(hospital=hospital, is_active=True).update(is_active=False)

def request_hospital_offboarding(hospital: Hospital, reason: str, actor) -> HospitalOffboardingRequest:
    if hospital.verified_status == Hospital.VerifiedStatus.OFFBOARDED:
        raise ValidationError({"detail": "This hospital is already offboarded."})

    if HospitalOffboardingRequest.objects.filter(
        hospital=hospital,
        status=HospitalOffboardingRequest.Status.PENDING,
    ).exists():
        raise ValidationError({"detail": "A pending offboarding request already exists for this hospital."})

    offboarding_request = HospitalOffboardingRequest.objects.create(
        hospital=hospital,
        reason=reason,
        requested_by=getattr(actor, "staff", None),
    )

    _write_offboarding_audit_log(
        event_type="hospital_offboarding_requested",
        actor=actor,
        hospital=hospital,
        offboarding_request=offboarding_request,
    )

    _publish_badge_event_after_commit(
        OffboardingSubmittedEvent(
            event_id=f"offboarding-submitted:{offboarding_request.id}",
            offboarding_request_id=str(offboarding_request.id),
        )
    )

    logger.info("Offboarding requested for hospital %s by %s", hospital.id, actor.id)
    return offboarding_request


def approve_hospital_offboarding_request(
    offboarding_request: HospitalOffboardingRequest,
    actor,
    admin_notes: str = "",
) -> HospitalOffboardingRequest:
    if offboarding_request.status != HospitalOffboardingRequest.Status.PENDING:
        raise ValidationError(
            {"detail": f"Cannot approve an offboarding request with status '{offboarding_request.status}'."}
        )

    unresolved = _get_unresolved_operations(offboarding_request.hospital)
    if unresolved:
        raise ValidationError(
            {
                "detail": "Hospital has unresolved operations and cannot be offboarded yet.",
                "unresolved": unresolved,
            }
        )

    reviewer_staff = getattr(actor, "staff", None)
    now = timezone.now()
    hospital = offboarding_request.hospital

    with transaction.atomic():
        offboarding_request.status = HospitalOffboardingRequest.Status.APPROVED
        offboarding_request.reviewed_by = reviewer_staff
        offboarding_request.reviewed_at = now
        offboarding_request.admin_notes = admin_notes
        offboarding_request.save(update_fields=["status", "reviewed_by", "reviewed_at", "admin_notes", "updated_at"])

        _apply_hospital_offboarding_state(hospital)

    _write_offboarding_audit_log(
        event_type="hospital_offboarding_approved",
        actor=actor,
        hospital=hospital,
        offboarding_request=offboarding_request,
        metadata={"admin_notes": admin_notes},
    )

    _publish_badge_event_after_commit(
        OffboardingReviewedEvent(
            event_id=f"offboarding-reviewed:{offboarding_request.id}",
            offboarding_request_id=str(offboarding_request.id),
            approved=True,
        )
    )

    logger.info("Offboarding approved for hospital %s by %s", hospital.id, actor.id)
    return offboarding_request


def offboard_hospital_direct(
    *,
    hospital: Hospital,
    actor,
    reason: str,
    admin_notes: str = "",
) -> HospitalOffboardingRequest:
    if hospital.verified_status == Hospital.VerifiedStatus.OFFBOARDED:
        raise ValidationError({"detail": "This hospital is already offboarded."})

    unresolved = _get_unresolved_operations(hospital)
    if unresolved:
        raise ValidationError(
            {
                "detail": "Hospital has unresolved operations and cannot be offboarded yet.",
                "unresolved": unresolved,
            }
        )

    reviewer_staff = getattr(actor, "staff", None)
    now = timezone.now()
    offboarding_reason = (reason or "").strip() or "Direct offboarding by SUPER_ADMIN."

    with transaction.atomic():
        offboarding_request = HospitalOffboardingRequest.objects.create(
            hospital=hospital,
            reason=offboarding_reason,
            status=HospitalOffboardingRequest.Status.APPROVED,
            requested_by=reviewer_staff,
            reviewed_by=reviewer_staff,
            reviewed_at=now,
            admin_notes=admin_notes,
        )

        _apply_hospital_offboarding_state(hospital)

    _write_offboarding_audit_log(
        event_type="hospital_offboarding_direct",
        actor=actor,
        hospital=hospital,
        offboarding_request=offboarding_request,
        metadata={"admin_notes": admin_notes, "reason": offboarding_reason},
    )

    logger.info("Hospital %s directly offboarded by %s", hospital.id, getattr(actor, "id", None))
    return offboarding_request


def reject_hospital_offboarding_request(
    offboarding_request: HospitalOffboardingRequest,
    actor,
    admin_notes: str = "",
) -> HospitalOffboardingRequest:
    if offboarding_request.status != HospitalOffboardingRequest.Status.PENDING:
        raise ValidationError(
            {"detail": f"Cannot reject an offboarding request with status '{offboarding_request.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)
    offboarding_request.status = HospitalOffboardingRequest.Status.REJECTED
    offboarding_request.reviewed_by = reviewer_staff
    offboarding_request.reviewed_at = timezone.now()
    offboarding_request.admin_notes = admin_notes
    offboarding_request.save(update_fields=["status", "reviewed_by", "reviewed_at", "admin_notes", "updated_at"])

    _write_offboarding_audit_log(
        event_type="hospital_offboarding_rejected",
        actor=actor,
        hospital=offboarding_request.hospital,
        offboarding_request=offboarding_request,
        metadata={"admin_notes": admin_notes},
    )

    _publish_badge_event_after_commit(
        OffboardingReviewedEvent(
            event_id=f"offboarding-reviewed:{offboarding_request.id}",
            offboarding_request_id=str(offboarding_request.id),
            approved=False,
        )
    )

    logger.info("Offboarding rejected for hospital %s by %s", offboarding_request.hospital_id, actor.id)
    return offboarding_request


def _get_unresolved_operations(hospital: Hospital) -> dict:
    from apps.requests.models import ResourceRequest
    from apps.shipments.models import Shipment

    unresolved = {}

    active_shipments = Shipment.objects.filter(
        models.Q(origin_hospital=hospital) | models.Q(destination_hospital=hospital),
        status__in=[
            Shipment.Status.PENDING,
            Shipment.Status.DISPATCHED,
            Shipment.Status.IN_TRANSIT,
            Shipment.Status.CANCEL_REQUESTED,
            Shipment.Status.RETURNING,
        ],
    ).count()
    if active_shipments:
        unresolved["active_shipments"] = active_shipments

    pending_requests = ResourceRequest.objects.filter(
        models.Q(requesting_hospital=hospital) | models.Q(supplying_hospital=hospital),
        status__in=[
            ResourceRequest.Status.PENDING,
            ResourceRequest.Status.APPROVED,
            ResourceRequest.Status.DISPATCHED,
            ResourceRequest.Status.FULFILLED,
        ],
    ).count()
    if pending_requests:
        unresolved["pending_resource_requests"] = pending_requests

    return unresolved


def _write_offboarding_audit_log(event_type: str, actor, hospital: Hospital, offboarding_request, metadata: dict | None = None) -> None:
    try:
        from apps.audit.services import write_audit_log  # noqa: PLC0415

        write_audit_log(
            event_type=event_type,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            hospital=hospital,
            object_id=offboarding_request.id,
            object_type="HospitalOffboardingRequest",
            metadata=metadata or {},
        )
    except Exception:
        logger.exception("Failed to write offboarding audit event", extra={"event_type": event_type})


def create_partnership(hospital_a_id: uuid.UUID, hospital_b_id: uuid.UUID, actor, relationship_type: str = "") -> HospitalPartnership:
    # Enforce canonical ordering to prevent (A,B) and (B,A) duplicates
    a, b = sorted([str(hospital_a_id), str(hospital_b_id)])
    hospital_a = Hospital.objects.get(id=a)
    hospital_b = Hospital.objects.get(id=b)

    if HospitalPartnership.objects.filter(hospital_a=hospital_a, hospital_b=hospital_b).exists():
        raise ValidationError({"detail": "A partnership between these hospitals already exists."})

    partnership = HospitalPartnership.objects.create(
        hospital_a=hospital_a,
        hospital_b=hospital_b,
        relationship_type=relationship_type,
        initiated_by=actor.staff if hasattr(actor, "staff") else None,
    )
    logger.info("Partnership created between %s and %s", a, b)
    return partnership


# ──────────────────────────────────────────────
# API Sync
# ──────────────────────────────────────────────

def sync_hospital_api(config) -> dict:
    """
    Perform the actual HTTP sync against the hospital's external API.
    Returns a status dict. Raises on non-recoverable errors.
    """
    import requests as http_requests
    from common.utils.encryption import decrypt_value

    token = decrypt_value(config.encrypted_token) if config.encrypted_token else ""
    headers = {}
    auth = None
    if token and config.auth_type == "bearer":
        headers["Authorization"] = f"Bearer {token}"
    elif token and config.auth_type == "api_key":
        headers["X-API-KEY"] = token
    elif config.auth_type == "basic":
        username = str((config.headers or {}).get("username") or "")
        password = str((config.headers or {}).get("password") or "")
        auth = (username, password)

    request_kwargs = {"headers": headers, "timeout": 30}
    if auth is not None:
        request_kwargs["auth"] = auth
    response = http_requests.get(config.api_endpoint, **request_kwargs)
    response.raise_for_status()

    config.last_sync = timezone.now()
    config.save(update_fields=["last_sync"])

    return {"status": "ok", "http_status": response.status_code}


def sync_registration_request_api(registration: HospitalRegistrationRequest) -> dict:
    """
    Sync hospital API data for an ACTIVE registration request.
    Calls /inventory/resources, /beds, /blood endpoints.
    Updates sync_status and last_sync_time on the registration.
    """
    import requests as http_requests
    from common.utils.encryption import decrypt_value

    if not registration.api_base_url:
        return {"status": "skipped", "reason": "no_api_base_url"}

    base = _normalize_external_base_url(registration.api_base_url).rstrip("/")
    token = decrypt_value(registration.api_key) if registration.api_key else ""
    headers = {}
    if token:
        if registration.api_auth_type == HospitalRegistrationRequest.ApiAuthType.BEARER:
            headers["Authorization"] = f"Bearer {token}"
        elif registration.api_auth_type == HospitalRegistrationRequest.ApiAuthType.API_KEY:
            headers["X-API-Key"] = token
        elif registration.api_auth_type == HospitalRegistrationRequest.ApiAuthType.BASIC:
            import base64 as b64
            credentials = b64.b64encode(
                f"{registration.api_username}:{decrypt_value(registration.api_password) if registration.api_password else ''}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {credentials}"

    results = {}
    endpoints = [
        ("inventory_resources", f"{base}/inventory/resources"),
        ("beds", f"{base}/beds"),
        ("blood", f"{base}/blood"),
    ]

    for key, url in endpoints:
        try:
            resp = http_requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            results[key] = {"status": "ok", "http_status": resp.status_code}
        except Exception as exc:
            results[key] = {"status": "error", "reason": str(exc)}

    registration.last_sync_time = timezone.now()
    registration.sync_status = HospitalRegistrationRequest.SyncStatus.SUCCESS
    registration.save(update_fields=["last_sync_time", "sync_status", "updated_at"])

    logger.info("Registration %s API sync complete: %s", registration.id, results)
    return {"status": "ok", "endpoints": results}


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            return None
    return None


def _as_int(value, default=0):
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _ensure_list_payload(payload, preferred_key=None):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if preferred_key and isinstance(payload.get(preferred_key), list):
            return payload.get(preferred_key, [])
        for key in (
            "data",
            "items",
            "results",
            "resources",
            "blood_units",
            "staff",
            "sales",
            "dispenses",
            "dispense_logs",
            "movements",
            "inventory_movements",
            "transactions",
            "events",
        ):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def _resolve_registration_bearer_token(registration: HospitalRegistrationRequest, base_url: str) -> str:
    import requests as http_requests
    from common.utils.encryption import decrypt_value

    if registration.api_key:
        return decrypt_value(registration.api_key)

    if registration.api_username and registration.api_password:
        password = decrypt_value(registration.api_password)
        token_url = f"{base_url.rstrip('/')}/api/token"
        response = http_requests.post(
            token_url,
            json={"username": registration.api_username, "password": password},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json() if response.content else {}
        token = payload.get("access_token") or payload.get("access") or payload.get("token")
        if token:
            return token

    return ""


def _build_registration_request_options(registration: HospitalRegistrationRequest, base_url: str) -> tuple[dict, tuple[str, str] | None]:
    from common.utils.encryption import decrypt_value

    headers = {}
    auth = None

    if registration.api_auth_type == HospitalRegistrationRequest.ApiAuthType.API_KEY:
        token = decrypt_value(registration.api_key) if registration.api_key else ""
        if token:
            headers["X-API-KEY"] = token

    elif registration.api_auth_type == HospitalRegistrationRequest.ApiAuthType.BASIC:
        username = registration.api_username or ""
        password = decrypt_value(registration.api_password) if registration.api_password else ""
        auth = (username, password)

    elif registration.api_auth_type == HospitalRegistrationRequest.ApiAuthType.BEARER:
        token = _resolve_registration_bearer_token(registration, base_url)
        if token:
            headers["Authorization"] = f"Bearer {token}"

    return headers, auth


def _get_hospital_and_registration(hospital_id: str):
    from .models import Hospital

    hospital = Hospital.objects.get(id=hospital_id)
    registration = _active_registration_queryset(hospital.registration_number).first()
    if not registration:
        raise ValidationError({"detail": "No ACTIVE registration request found for this hospital."})
    if not registration.api_base_url:
        raise ValidationError({"detail": "Hospital has no api_base_url configured."})
    return hospital, registration


def _sync_capacity_from_payload(hospital, payload):
    from .models import HospitalCapacity

    if isinstance(payload, list):
        payload = payload[0] if payload else {}
    if not isinstance(payload, dict):
        payload = {}

    bed_total = _as_int(payload.get("bed_total", payload.get("beds_total", payload.get("total_beds", 0))))
    bed_available = _as_int(payload.get("bed_available", payload.get("beds_available", payload.get("available_beds", 0))))
    icu_total = _as_int(payload.get("icu_total", payload.get("icu_beds_total", payload.get("total_icu", 0))))
    icu_available = _as_int(payload.get("icu_available", payload.get("icu_beds_available", payload.get("available_icu", 0))))

    capacity, _ = HospitalCapacity.objects.get_or_create(hospital=hospital)
    capacity.bed_total = max(0, bed_total)
    capacity.bed_available = max(0, bed_available)
    capacity.icu_total = max(0, icu_total)
    capacity.icu_available = max(0, icu_available)
    capacity.save(update_fields=["bed_total", "bed_available", "icu_total", "icu_available", "last_updated"])

    return {
        "bed_total": capacity.bed_total,
        "bed_available": capacity.bed_available,
        "icu_total": capacity.icu_total,
        "icu_available": capacity.icu_available,
    }


def _upsert_inventory_items(hospital, payload, default_resource_type_name: str):
    from apps.resources.models import ResourceCatalog, ResourceInventory, ResourceType

    entries = _ensure_list_payload(payload, preferred_key="resources")
    if not entries:
        return {"upserted": 0}

    default_type, _ = ResourceType.objects.get_or_create(name=default_resource_type_name)
    upserted = 0
    verified_at = timezone.now()

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        blood_group = str(entry.get("blood_group") or "").strip()
        name = str(
            entry.get("name")
            or entry.get("resource_name")
            or entry.get("code")
            or (f"Blood {blood_group}" if blood_group else "")
        ).strip()
        if not name:
            continue
        category = str(entry.get("category") or default_resource_type_name).strip() or default_resource_type_name
        unit = str(entry.get("unit") or entry.get("unit_of_measure") or "units").strip()
        quantity = max(
            0,
            _as_int(
                entry.get(
                    "quantity_available",
                    entry.get("available_quantity", entry.get("units_available", entry.get("quantity", 0))),
                )
            ),
        )
        reserved = max(0, _as_int(entry.get("quantity_reserved", entry.get("reserved_quantity", 0))))
        restocked_at = _parse_datetime(entry.get("last_updated") or entry.get("last_restocked_at"))

        resource_type, _ = ResourceType.objects.get_or_create(name=category)
        if not resource_type.unit_of_measure and unit:
            resource_type.unit_of_measure = unit
            resource_type.save(update_fields=["unit_of_measure", "updated_at"])

        catalog_item, _ = ResourceCatalog.objects.get_or_create(
            hospital=hospital,
            resource_type=resource_type or default_type,
            name=name,
            defaults={
                "unit_of_measure": unit,
                "description": str(entry.get("description") or "").strip(),
            },
        )

        updated_fields = []
        if unit and catalog_item.unit_of_measure != unit:
            catalog_item.unit_of_measure = unit
            updated_fields.append("unit_of_measure")
        description = str(entry.get("description") or "").strip()
        if description and catalog_item.description != description:
            catalog_item.description = description
            updated_fields.append("description")
        if updated_fields:
            updated_fields.append("updated_at")
            catalog_item.save(update_fields=updated_fields)

        inventory, created = ResourceInventory.objects.get_or_create(
            catalog_item=catalog_item,
            defaults={
                "quantity_available": quantity,
                "quantity_reserved": reserved,
                "reserved_quantity": reserved,
                "verification_status": ResourceInventory.VerificationStatus.VERIFIED,
                "verification_note": "Verified via external inventory sync.",
                "last_verified_at": verified_at,
                "last_restocked_at": restocked_at,
            },
        )
        if not created:
            inventory.quantity_available = quantity
            inventory.quantity_reserved = reserved
            inventory.reserved_quantity = reserved
            inventory.verification_status = ResourceInventory.VerificationStatus.VERIFIED
            inventory.verification_note = "Verified via external inventory sync."
            inventory.last_verified_at = verified_at
            if restocked_at:
                inventory.last_restocked_at = restocked_at
                inventory.save(
                    update_fields=[
                        "quantity_available",
                        "quantity_reserved",
                        "reserved_quantity",
                        "verification_status",
                        "verification_note",
                        "last_verified_at",
                        "last_restocked_at",
                        "updated_at",
                    ]
                )
            else:
                inventory.save(
                    update_fields=[
                        "quantity_available",
                        "quantity_reserved",
                        "reserved_quantity",
                        "verification_status",
                        "verification_note",
                        "last_verified_at",
                        "updated_at",
                    ]
                )

        upserted += 1

    return {"upserted": upserted}


def _build_external_employee_id(hospital_id, raw_entry: dict) -> str:
    key_parts = [
        str(raw_entry.get("external_staff_id") or ""),
        str(raw_entry.get("employee_id") or ""),
        str(raw_entry.get("email") or ""),
        str(raw_entry.get("phone") or raw_entry.get("phone_number") or ""),
        str(raw_entry.get("name") or raw_entry.get("full_name") or ""),
    ]
    digest = hashlib.sha1((str(hospital_id) + "|" + "|".join(key_parts)).encode()).hexdigest()[:16]
    return f"EXT-{digest}"


def _sync_staff_directory(hospital, payload):
    from apps.staff.models import Staff

    entries = _ensure_list_payload(payload, preferred_key="staff")
    if not entries:
        return {"upserted": 0, "deactivated": 0}

    seen_ids = set()
    upserted = 0

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        full_name = str(entry.get("full_name") or entry.get("name") or "").strip()
        first_name = str(entry.get("first_name") or "").strip()
        last_name = str(entry.get("last_name") or "").strip()

        if not first_name and not last_name and full_name:
            parts = full_name.split()
            first_name = parts[0]
            last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

        if not first_name:
            first_name = "Unknown"

        employee_id = str(entry.get("employee_id") or "").strip()
        if not employee_id:
            employee_id = _build_external_employee_id(hospital.id, entry)

        seen_ids.add(employee_id)

        status_raw = str(entry.get("employment_status") or entry.get("status") or "active").strip().lower()
        if status_raw in ("inactive", "disabled"):
            employment_status = Staff.EmploymentStatus.INACTIVE
        elif status_raw in ("suspended",):
            employment_status = Staff.EmploymentStatus.SUSPENDED
        else:
            employment_status = Staff.EmploymentStatus.ACTIVE

        defaults = {
            "first_name": first_name,
            "last_name": last_name,
            "department": str(entry.get("department") or "").strip(),
            "position": str(entry.get("position") or entry.get("role") or "").strip(),
            "phone_number": str(entry.get("phone") or entry.get("phone_number") or "").strip(),
            "employment_status": employment_status,
        }

        staff_obj, created = Staff.objects.get_or_create(
            hospital=hospital,
            employee_id=employee_id,
            defaults=defaults,
        )
        if not created:
            changed = []
            for field, value in defaults.items():
                if getattr(staff_obj, field) != value:
                    setattr(staff_obj, field, value)
                    changed.append(field)
            if changed:
                changed.append("updated_at")
                staff_obj.save(update_fields=changed)

        # Explicitly do not create UserAccount from directory sync.
        upserted += 1

    stale = Staff.objects.filter(hospital=hospital, employee_id__startswith="EXT-").exclude(employee_id__in=seen_ids)
    deactivated = stale.update(employment_status=Staff.EmploymentStatus.INACTIVE)

    return {"upserted": upserted, "deactivated": deactivated}


def _first_non_empty(entry: dict, keys: tuple[str, ...]):
    for key in keys:
        value = entry.get(key)
        if value not in (None, ""):
            return value
    return None


def _is_outbound_sales_event(*, endpoint_label: str, direction_hint: str, quantity: int) -> bool:
    if quantity == 0:
        return False
    if quantity < 0:
        return True

    normalized = f" {direction_hint.strip().lower()} "
    outbound_markers = (
        " sale ",
        " sold ",
        " dispense ",
        " dispensed ",
        " consum ",
        " usage ",
        " stock_out ",
        " outbound ",
        " transfer_out ",
    )
    inbound_markers = (
        " restock ",
        " stock_in ",
        " inbound ",
        " purchase ",
        " received ",
        " transfer_in ",
    )

    if any(marker in normalized for marker in inbound_markers) and not any(
        marker in normalized for marker in outbound_markers
    ):
        return False
    if any(marker in normalized for marker in outbound_markers):
        return True

    label = (endpoint_label or "").lower()
    if "sales" in label or "dispense" in label:
        return quantity > 0
    if "movement" in label:
        return quantity < 0
    return False


def _sync_sales_signals_from_payload(hospital, payload, source_endpoint: str = ""):
    from apps.ml.models import MLDispenseLog
    from apps.resources.models import ResourceCatalog, ResourceInventory, ResourceType

    entries = _ensure_list_payload(payload, preferred_key="sales")
    if not entries:
        entries = _ensure_list_payload(payload, preferred_key="dispenses")
    if not entries:
        entries = _ensure_list_payload(payload, preferred_key="movements")
    if not entries:
        return {"upserted": 0, "skipped": 0}

    upserted = 0
    skipped = 0
    endpoint_label = (source_endpoint or "").lower()

    for entry in entries:
        if not isinstance(entry, dict):
            skipped += 1
            continue

        medicine_name = str(
            _first_non_empty(
                entry,
                (
                    "medicine_name",
                    "drug_name",
                    "item_name",
                    "name",
                    "resource_name",
                    "code",
                ),
            )
            or ""
        ).strip()
        if not medicine_name:
            skipped += 1
            continue

        raw_quantity = _first_non_empty(
            entry,
            (
                "quantity_sold",
                "quantity_dispensed",
                "quantity",
                "qty",
                "units",
                "movement_quantity",
                "quantity_delta",
                "delta",
                "consumed_quantity",
            ),
        )
        quantity = _as_int(raw_quantity, default=0)
        if quantity == 0:
            skipped += 1
            continue

        direction_hint = " ".join(
            [
                str(entry.get("event_type") or ""),
                str(entry.get("movement_type") or ""),
                str(entry.get("direction") or ""),
                str(entry.get("transaction_type") or ""),
                str(entry.get("type") or ""),
                str(entry.get("operation") or ""),
            ]
        )
        if not _is_outbound_sales_event(
            endpoint_label=endpoint_label,
            direction_hint=direction_hint,
            quantity=quantity,
        ):
            skipped += 1
            continue

        quantity_sold = abs(quantity)
        event_ts = _parse_datetime(
            _first_non_empty(
                entry,
                (
                    "event_date",
                    "date",
                    "sold_at",
                    "dispensed_at",
                    "occurred_at",
                    "event_time",
                    "timestamp",
                    "created_at",
                ),
            )
        )
        event_date = (event_ts or timezone.now()).date()

        category = str(entry.get("category") or "Medication").strip() or "Medication"
        resource_type, _ = ResourceType.objects.get_or_create(name=category)
        unit = str(entry.get("unit") or entry.get("unit_of_measure") or "units").strip() or "units"

        catalog_item, _ = ResourceCatalog.objects.get_or_create(
            hospital=hospital,
            resource_type=resource_type,
            name=medicine_name,
            defaults={
                "unit_of_measure": unit,
                "description": str(entry.get("description") or "").strip(),
            },
        )

        catalog_updates = []
        if unit and catalog_item.unit_of_measure != unit:
            catalog_item.unit_of_measure = unit
            catalog_updates.append("unit_of_measure")
        if catalog_updates:
            catalog_updates.append("updated_at")
            catalog_item.save(update_fields=catalog_updates)

        ResourceInventory.objects.get_or_create(
            catalog_item=catalog_item,
            defaults={
                "quantity_available": 0,
                "quantity_reserved": 0,
                "reserved_quantity": 0,
            },
        )

        external_event_id = str(
            _first_non_empty(
                entry,
                ("external_event_id", "event_id", "sale_id", "dispense_id", "movement_id", "id"),
            )
            or ""
        ).strip()[:160]
        payload_hash = hashlib.sha256(
            json.dumps(
                {
                    "medicine_name": medicine_name.lower(),
                    "quantity_sold": quantity_sold,
                    "event_date": event_date.isoformat(),
                    "external_event_id": external_event_id,
                    "source_endpoint": (source_endpoint or "").rstrip("/").lower(),
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()

        defaults = {
            "resource_catalog": catalog_item,
            "event_date": event_date,
            "quantity_sold": quantity_sold,
            "source_type": MLDispenseLog.SourceType.API,
            "source_endpoint": (source_endpoint or "")[:300],
            "payload_hash": payload_hash,
            "raw_payload": entry,
        }

        if external_event_id:
            MLDispenseLog.objects.update_or_create(
                facility=hospital,
                external_event_id=external_event_id,
                defaults=defaults,
            )
        else:
            MLDispenseLog.objects.update_or_create(
                facility=hospital,
                payload_hash=payload_hash,
                defaults=defaults,
            )
        upserted += 1

    return {"upserted": upserted, "skipped": skipped}


def sync_hospital_data(hospital_id: str) -> dict:
    """
    Continuous API-based synchronization for one hospital.

    Pulls and persists:
      - inventory resources
      - bed/ICU capacity
      - blood units
      - staff directory (as Staff profiles only; no UserAccount creation)
            - optional sales/dispense/movement signals mapped to ml_dispense_log
    """
    import requests as http_requests

    hospital, registration = _get_hospital_and_registration(hospital_id)
    base = _normalize_external_base_url(registration.api_base_url).rstrip("/")
    headers, auth = _build_registration_request_options(registration, base)
    timeout_seconds = 30

    registration.sync_status = HospitalRegistrationRequest.SyncStatus.SYNCING
    registration.save(update_fields=["sync_status", "updated_at"])

    endpoint_candidates = {
        # Supports both legacy integration endpoints and the current mock hospital API shape.
        "inventory": [f"{base}/api/resources", f"{base}/inventory/resources"],
        "beds": [f"{base}/api/beds", f"{base}/beds"],
        "blood": [f"{base}/api/resources/blood", f"{base}/blood", f"{base}/api/blood"],
        "staff": [f"{base}/api/staff", f"{base}/staff"],
        "sales_signals": [
            f"{base}/api/sales",
            f"{base}/sales",
            f"{base}/api/dispense",
            f"{base}/dispense",
            f"{base}/api/inventory/movements",
            f"{base}/inventory/movements",
            f"{base}/api/inventory-movements",
        ],
    }

    fetched_payloads = {}
    endpoint_results = {}

    for key, candidates in endpoint_candidates.items():
        errors = []
        for url in candidates:
            try:
                request_kwargs = {"headers": headers, "timeout": timeout_seconds}
                if auth is not None:
                    request_kwargs["auth"] = auth
                resp = http_requests.get(url, **request_kwargs)
                resp.raise_for_status()
                fetched_payloads[key] = resp.json()
                endpoint_results[key] = {
                    "status": "ok",
                    "http_status": resp.status_code,
                    "url": url,
                }
                break
            except Exception as exc:
                errors.append(str(exc))

        if key not in endpoint_results:
            if key == "sales_signals":
                endpoint_results[key] = {
                    "status": "skipped",
                    "reason": "; ".join(errors) if errors else "no_supported_endpoint",
                }
            else:
                endpoint_results[key] = {
                    "status": "error",
                    "reason": "; ".join(errors),
                }

    # Inventory is mandatory for a successful sync; other endpoints are optional.
    if endpoint_results.get("inventory", {}).get("status") != "ok":
        _mark_hospital_inventory_verification_state(
            hospital=hospital,
            status_value="stale",
            note="External inventory sync failed; local inventory is stale.",
        )
        registration.sync_status = HospitalRegistrationRequest.SyncStatus.FAILED
        registration.last_sync_time = timezone.now()
        registration.save(update_fields=["sync_status", "last_sync_time", "updated_at"])
        return {
            "status": "partial_or_failed",
            "hospital_id": str(hospital.id),
            "endpoints": endpoint_results,
            "persisted": {},
        }

    persisted = {
        "inventory": _upsert_inventory_items(hospital, fetched_payloads.get("inventory"), "Medication"),
        "capacity": _sync_capacity_from_payload(hospital, fetched_payloads.get("beds"))
        if fetched_payloads.get("beds") is not None
        else {"skipped": True},
        "blood": _upsert_inventory_items(hospital, fetched_payloads.get("blood"), "Blood")
        if fetched_payloads.get("blood") is not None
        else {"skipped": True},
        "staff": _sync_staff_directory(hospital, fetched_payloads.get("staff"))
        if fetched_payloads.get("staff") is not None
        else {"skipped": True},
        "sales_signals": _sync_sales_signals_from_payload(
            hospital,
            fetched_payloads.get("sales_signals"),
            endpoint_results.get("sales_signals", {}).get("url", ""),
        )
        if fetched_payloads.get("sales_signals") is not None
        else {"skipped": True},
    }

    optional_failures = [
        name for name in ("beds", "blood", "staff") if endpoint_results.get(name, {}).get("status") == "error"
    ]

    registration.last_sync_time = timezone.now()
    registration.sync_status = HospitalRegistrationRequest.SyncStatus.SUCCESS
    registration.save(update_fields=["last_sync_time", "sync_status", "updated_at"])

    logger.info(
        "Hospital %s sync completed. Endpoints=%s persisted=%s",
        hospital.id,
        endpoint_results,
        persisted,
    )
    return {
        "status": "ok_with_warnings" if optional_failures else "ok",
        "hospital_id": str(hospital.id),
        "endpoints": endpoint_results,
        "persisted": persisted,
    }
