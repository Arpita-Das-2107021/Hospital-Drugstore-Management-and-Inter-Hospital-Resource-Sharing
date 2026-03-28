"""Hospital service layer — all business logic lives here."""
import hashlib
import logging
import uuid
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

from django.db import models, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.authentication.models import UserAccount
from apps.authentication.services import initiate_password_reset
from apps.core.services.email_service import send_email
from apps.notifications.models import Notification
from apps.staff.models import Role, Staff, UserRole
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


SENSITIVE_HOSPITAL_FIELDS = {
    "api_base_url",
    "api_auth_type",
    "api_key",
    "api_username",
    "api_password",
    "email",
    "registration_number",
}


def _split_hospital_update_changes(data: dict) -> tuple[dict, dict]:
    direct_changes = {}
    sensitive_changes = {}
    for field, value in data.items():
        if field in SENSITIVE_HOSPITAL_FIELDS:
            sensitive_changes[field] = value
        else:
            direct_changes[field] = value
    return direct_changes, sensitive_changes


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
) -> None:
    admin_users = UserAccount.objects.filter(
        staff__hospital=hospital,
        roles__name="HOSPITAL_ADMIN",
        is_active=True,
    ).distinct()

    if not admin_users.exists():
        return

    if approved:
        subject = f"Hospital update request approved: {hospital.name}"
        message = (
            "Your hospital update request has been approved and sensitive changes were applied."
        )
    else:
        subject = f"Hospital update request rejected: {hospital.name}"
        message = "Your hospital update request was rejected."
        if rejection_reason:
            message = f"{message} Reason: {rejection_reason}"

    notifications = [
        Notification(
            user=user,
            notification_type=Notification.NotificationType.SYSTEM,
            message=message,
            data={"hospital_update_request_id": str(update_request.id), "approved": approved},
        )
        for user in admin_users
    ]
    Notification.objects.bulk_create(notifications, batch_size=200)

    for user in admin_users:
        send_email(subject=subject, message=message, recipient_list=[user.email])


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
    return registration


def approve_registration_request(registration: HospitalRegistrationRequest, actor) -> dict:
    """
    Step 2 (Approve): SUPER_ADMIN approves a pending registration request.
    Atomically:
    1. Sets registration status → ACTIVE
    2. Creates Hospital record
    3. Creates HospitalCapacity record
    4. Creates/updates hospital admin account and assigns HOSPITAL_ADMIN role
    Returns a dict with both the updated registration and the created hospital.
    """
    if registration.status != HospitalRegistrationRequest.Status.PENDING_APPROVAL:
        raise ValidationError(
            {"detail": f"Cannot approve a request with status '{registration.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)
    actor_user = actor if getattr(actor, "is_authenticated", False) else None
    admin_email = registration.admin_email or registration.email
    admin_name = registration.admin_name or registration.name
    name_parts = admin_name.strip().split(maxsplit=1)
    admin_first_name = name_parts[0] if name_parts else "Hospital"
    admin_last_name = name_parts[1] if len(name_parts) > 1 else "Admin"

    api_config = None

    with transaction.atomic():
        # Update registration status
        registration.status = HospitalRegistrationRequest.Status.ACTIVE
        registration.reviewed_by = reviewer_staff
        registration.reviewed_at = timezone.now()
        registration.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])

        # Create Hospital record from registration data
        hospital = Hospital.objects.create(
            name=registration.name,
            registration_number=registration.registration_number,
            email=registration.email,
            phone=registration.phone,
            website=registration.website,
            address=registration.address,
            city=registration.city,
            state=registration.state,
            country=registration.country,
            logo=registration.logo,
            latitude=registration.latitude,
            longitude=registration.longitude,
            hospital_type=registration.hospital_type,
            verified_status=Hospital.VerifiedStatus.VERIFIED,
        )

        # Create capacity record
        HospitalCapacity.objects.create(hospital=hospital)

        hospital_admin_role, _ = Role.objects.get_or_create(
            name="HOSPITAL_ADMIN",
            defaults={"description": "Full access within their hospital."},
        )

        # Provision hospital admin staff profile and account for approved registration admin email.
        hospital_admin_staff = Staff.objects.create(
            hospital=hospital,
            role=hospital_admin_role,
            email=admin_email,
            first_name=admin_first_name,
            last_name=admin_last_name,
            employee_id=f"ADMIN-{hospital.registration_number}",
            department="Administration",
            position="Hospital Administrator",
        )

        admin_user = UserAccount.objects.filter(email__iexact=admin_email).first()
        if admin_user and admin_user.is_active:
            raise ValidationError(
                {
                    "admin_email": (
                        "An active user account already exists with this hospital admin email. "
                        "Use a different email for registration."
                    )
                }
            )

        if admin_user:
            admin_user.staff = hospital_admin_staff
            admin_user.is_active = True
            admin_user.set_unusable_password()
            admin_user.save(update_fields=["staff", "is_active", "password"])
        else:
            admin_user = UserAccount.objects.create_user(
                email=admin_email,
                password=None,
                staff=hospital_admin_staff,
                is_active=True,
            )

        UserRole.objects.get_or_create(
            user=admin_user,
            role=hospital_admin_role,
            hospital=hospital,
            defaults={"assigned_by": actor_user},
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
                    "api_endpoint": f"{registration.api_base_url.rstrip('/')}/api/resources",
                    "http_method": HospitalAPIConfig.HttpMethod.GET,
                    "auth_type": registration.api_auth_type,
                    "encrypted_token": registration.api_key,
                    "headers": {},
                    "sync_frequency": 3600,
                    "is_active": True,
                },
            )

    logger.info(
        "Registration request %s approved by %s. Hospital created: %s",
        registration.id, getattr(actor, "id", "system"), hospital.id,
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
                logger.exception(
                    "Failed to enqueue initial sync task for registration %s",
                    registration.id,
                )

    transaction.on_commit(_after_approval_commit)

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
    return registration


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
    return HospitalRegistrationRequest.objects.filter(
        status=HospitalRegistrationRequest.Status.ACTIVE,
        registration_number=hospital.registration_number,
    ).first()


def _apply_direct_hospital_changes(hospital: Hospital, changes: dict) -> Hospital:
    if not changes:
        return hospital

    for field, value in changes.items():
        setattr(hospital, field, value)

    update_fields = list(changes.keys()) + ["updated_at"]
    hospital.save(update_fields=update_fields)
    return hospital


def _apply_sensitive_hospital_changes(hospital: Hospital, changes: dict) -> Hospital:
    if not changes:
        return hospital

    _validate_hospital_unique_fields(hospital, changes)

    hospital_fields = ["email", "registration_number"]
    hospital_changed = []
    old_registration_number = hospital.registration_number
    for field in hospital_fields:
        if field in changes:
            setattr(hospital, field, changes[field])
            hospital_changed.append(field)

    registration = _get_active_registration_for_hospital(hospital)
    if registration:
        registration_changed = []
        for field in (
            "api_base_url",
            "api_auth_type",
            "api_username",
            "email",
            "registration_number",
        ):
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
            base = str(changes["api_base_url"] or "").rstrip("/")
            api_config.api_endpoint = f"{base}/api/resources" if base else ""
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
    _validate_hospital_unique_fields(hospital, validated_data)
    direct_changes, sensitive_changes = _split_hospital_update_changes(validated_data)

    if actor.has_role("SUPER_ADMIN"):
        _apply_direct_hospital_changes(hospital, direct_changes)
        _apply_sensitive_hospital_changes(hospital, sensitive_changes)
        return {"hospital": hospital, "update_request": None}

    pending_request = HospitalUpdateRequest.objects.filter(
        hospital=hospital,
        status=HospitalUpdateRequest.Status.PENDING,
    ).first()
    if pending_request and sensitive_changes:
        raise ValidationError(
            {
                "detail": (
                    "A sensitive update request is already pending review for this hospital. "
                    "Please wait for admin approval or rejection."
                )
            }
        )

    _apply_direct_hospital_changes(hospital, direct_changes)

    update_request = None
    if sensitive_changes:
        update_request = HospitalUpdateRequest.objects.create(
            hospital=hospital,
            requested_by=getattr(actor, "staff", None),
            requested_changes=sensitive_changes,
            sensitive_changes=sensitive_changes,
        )

    logger.info(
        "Hospital update submitted for %s by %s. direct=%s sensitive=%s",
        hospital.id,
        getattr(actor, "id", None),
        list(direct_changes.keys()),
        list(sensitive_changes.keys()),
    )
    return {"hospital": hospital, "update_request": update_request}


def approve_hospital_update_request(update_request: HospitalUpdateRequest, actor) -> HospitalUpdateRequest:
    if update_request.status != HospitalUpdateRequest.Status.PENDING:
        raise ValidationError(
            {"detail": f"Cannot approve an update request with status '{update_request.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)
    with transaction.atomic():
        _apply_sensitive_hospital_changes(update_request.hospital, update_request.sensitive_changes)
        update_request.status = HospitalUpdateRequest.Status.APPROVED
        update_request.reviewed_by = reviewer_staff
        update_request.reviewed_at = timezone.now()
        update_request.rejection_reason = ""
        update_request.save(
            update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason", "updated_at"]
        )

    _notify_hospital_admins_of_update_review(
        hospital=update_request.hospital,
        update_request=update_request,
        approved=True,
    )
    return update_request


def reject_hospital_update_request(
    update_request: HospitalUpdateRequest,
    actor,
    rejection_reason: str = "",
) -> HospitalUpdateRequest:
    if update_request.status != HospitalUpdateRequest.Status.PENDING:
        raise ValidationError(
            {"detail": f"Cannot reject an update request with status '{update_request.status}'."}
        )

    reviewer_staff = getattr(actor, "staff", None)
    update_request.status = HospitalUpdateRequest.Status.REJECTED
    update_request.reviewed_by = reviewer_staff
    update_request.reviewed_at = timezone.now()
    update_request.rejection_reason = rejection_reason
    update_request.save(
        update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason", "updated_at"]
    )

    _notify_hospital_admins_of_update_review(
        hospital=update_request.hospital,
        update_request=update_request,
        approved=False,
        rejection_reason=rejection_reason,
    )
    return update_request


# ──────────────────────────────────────────────
# Hospital Offboarding
# ──────────────────────────────────────────────

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

        hospital.verified_status = Hospital.VerifiedStatus.OFFBOARDED
        hospital.save(update_fields=["verified_status", "updated_at"])

        Staff.objects.filter(hospital=hospital).update(employment_status=Staff.EmploymentStatus.SUSPENDED)
        UserAccount.objects.filter(staff__hospital=hospital, is_active=True).update(is_active=False)

        HospitalAPIConfig.objects.filter(hospital=hospital, is_active=True).update(is_active=False)

    _write_offboarding_audit_log(
        event_type="hospital_offboarding_approved",
        actor=actor,
        hospital=hospital,
        offboarding_request=offboarding_request,
        metadata={"admin_notes": admin_notes},
    )

    logger.info("Offboarding approved for hospital %s by %s", hospital.id, actor.id)
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
        for key in ("data", "items", "results", "resources", "blood_units", "staff"):
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
    registration = HospitalRegistrationRequest.objects.filter(
        status=HospitalRegistrationRequest.Status.ACTIVE,
        registration_number=hospital.registration_number,
    ).first()
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
                "last_restocked_at": restocked_at,
            },
        )
        if not created:
            inventory.quantity_available = quantity
            inventory.quantity_reserved = reserved
            if restocked_at:
                inventory.last_restocked_at = restocked_at
                inventory.save(
                    update_fields=["quantity_available", "quantity_reserved", "last_restocked_at", "updated_at"]
                )
            else:
                inventory.save(update_fields=["quantity_available", "quantity_reserved", "updated_at"])

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


def sync_hospital_data(hospital_id: str) -> dict:
    """
    Continuous API-based synchronization for one hospital.

    Pulls and persists:
      - inventory resources
      - bed/ICU capacity
      - blood units
      - staff directory (as Staff profiles only; no UserAccount creation)
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
            endpoint_results[key] = {
                "status": "error",
                "reason": "; ".join(errors),
            }

    # Inventory is mandatory for a successful sync; other endpoints are optional.
    if endpoint_results.get("inventory", {}).get("status") != "ok":
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
