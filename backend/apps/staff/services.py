"""Staff service layer — all business logic."""
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.core.services.email_service import render_email_template, send_email
from common.utils.tokens import generate_hex_token

from .models import HospitalRole, Invitation, Permission, Role, RolePermission, Staff, UserHospitalRole, UserRole
from .rbac_services import ensure_default_hospital_staff_role

UserAccount = get_user_model()
logger = logging.getLogger("hrsp.staff")


DEFAULT_HOSPITAL_STAFF_ROLE_NAME = "STAFF"
LEGACY_INVITATION_ROLE_TO_HOSPITAL_ROLE = {
    "HOSPITAL_ADMIN": "HEALTHCARE_ADMIN",
    "HEALTHCARE_ADMIN": "HEALTHCARE_ADMIN",
    "STAFF": "STAFF",
    "PHARMACIST": "STAFF",
    "LOGISTICS_STAFF": "STAFF",
}


def _normalize_permission_codes(permission_codes: list[str]) -> list[str]:
    return sorted({code.strip().upper() for code in permission_codes if code and code.strip()})


def _resolve_hospital_role_for_invitation(invitation: Invitation, *, actor=None) -> HospitalRole:
    role_name = ""
    if invitation.role:
        role_name = str(invitation.role.name or "").strip().upper()

    target_role_name = LEGACY_INVITATION_ROLE_TO_HOSPITAL_ROLE.get(role_name, DEFAULT_HOSPITAL_STAFF_ROLE_NAME)

    if target_role_name == DEFAULT_HOSPITAL_STAFF_ROLE_NAME:
        return ensure_default_hospital_staff_role(hospital=invitation.hospital, actor=actor)

    existing_role = HospitalRole.objects.filter(
        hospital=invitation.hospital,
        name=target_role_name,
        is_active=True,
    ).first()
    if existing_role:
        return existing_role

    logger.warning(
        "Falling back to default STAFF role because mapped hospital role '%s' was missing for hospital %s",
        target_role_name,
        invitation.hospital_id,
    )
    return ensure_default_hospital_staff_role(hospital=invitation.hospital, actor=actor)


def create_staff_profile(hospital, data: dict) -> Staff:
    """Create a Staff record (without a UserAccount — used before invitation acceptance)."""
    staff = Staff.objects.create(hospital=hospital, **data)
    logger.info("Staff profile created: %s for hospital %s", staff.id, hospital.id)
    return staff


def sync_staff_email_with_user_account(staff: Staff, email: str) -> None:
    """Keep Staff.email and linked UserAccount.email aligned."""
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        return

    if staff.email != normalized_email:
        staff.email = normalized_email
        staff.save(update_fields=["email", "updated_at"])

    user_account = UserAccount.objects.filter(staff=staff).first()
    if user_account and user_account.email != normalized_email:
        if UserAccount.objects.exclude(id=user_account.id).filter(
            email__iexact=normalized_email,
            is_active=True,
        ).exists():
            raise ValidationError({"email": "An account with this email already exists."})
        user_account.email = normalized_email
        user_account.save(update_fields=["email"])


def create_staff_with_invitation(hospital, data: dict, email: str, actor, role_id=None) -> Staff:
    """Create staff profile, create a pending user account, and send set-password invitation."""
    payload = dict(data)
    payload.pop("hospital", None)
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        raise ValidationError({"email": "Email is required."})

    extra = {
        "first_name": payload.get("first_name", ""),
        "last_name": payload.get("last_name", ""),
        "department": payload.get("department", ""),
        "position": payload.get("position", ""),
    }

    role = None
    if role_id:
        try:
            role = Role.objects.get(id=role_id)
        except Role.DoesNotExist:
            raise ValidationError({"role_id": "Role not found."})

    with transaction.atomic():
        staff = Staff.objects.create(hospital=hospital, email=normalized_email, role=role, **payload)
        if UserAccount.objects.filter(email__iexact=normalized_email, is_active=True).exists():
            raise ValidationError({"email": "An active user with this email already exists."})

        # Keep historical accounts immutable; create a new pending account for this staff profile.
        UserAccount.objects.create_user(
            email=normalized_email,
            password=None,
            staff=staff,
            is_active=False,
        )

        send_invitation(
            hospital=hospital,
            email=normalized_email,
            role_id=role_id,
            actor=actor,
            extra=extra,
            staff=staff,
            invitation_link_path="set-password",
        )

    logger.info("Staff %s created with pending account + invitation for %s", staff.id, normalized_email)
    return staff


def send_invitation(
    hospital,
    email: str,
    role_id=None,
    actor=None,
    extra: dict = None,
    staff: Staff | None = None,
    invitation_link_path: str = "accept-invitation",
) -> Invitation:
    """
    Create an Invitation record and queue the invitation email.
    Raises ValidationError if a pending invitation already exists for this email+hospital.
    """
    extra = extra or {}
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        raise ValidationError({"email": "Email is required."})

    if Invitation.objects.filter(
        hospital=hospital,
        email__iexact=normalized_email,
        status=Invitation.Status.PENDING,
    ).exists():
        raise ValidationError({"detail": "A pending invitation already exists for this email."})

    role = None
    if role_id:
        try:
            role = Role.objects.get(id=role_id)
        except Role.DoesNotExist:
            raise ValidationError({"role_id": "Role not found."})

    # Pre-create a Staff record so we can link it later on acceptance.
    if staff is None:
        import uuid

        staff = Staff.objects.create(
            hospital=hospital,
            email=normalized_email,
            employee_id="PENDING-" + uuid.uuid4().hex[:8].upper(),
            first_name=extra.get("first_name", ""),
            last_name=extra.get("last_name", ""),
            department=extra.get("department", ""),
            position=extra.get("position", ""),
            role=role,
        )
    elif role and staff.role_id != role.id:
        staff.role = role
        staff.save(update_fields=["role", "updated_at"])

    token = generate_hex_token(32)
    invitation = Invitation.objects.create(
        hospital=hospital,
        staff=staff,
        email=normalized_email,
        token=token,
        role=role,
        expires_at=timezone.now() + timedelta(hours=Invitation.EXPIRY_HOURS),
        invited_by=actor,
    )

    role_name = role.name if role else "Staff"
    invitation_link = f"{settings.FRONTEND_URL.rstrip('/')}/{invitation_link_path}?token={invitation.token}"
    message = render_email_template(
        "invitation.txt",
        {
            "hospital_name": hospital.name,
            "role": role_name,
            "acceptance_url": invitation_link,
            "expires_at": invitation.expires_at,
        },
    )
    send_email(
        subject="You're invited to the Hospital Resource Sharing Platform",
        message=message,
        recipient_list=[normalized_email],
    )

    logger.info("Invitation sent to %s for hospital %s", normalized_email, hospital.id)
    return invitation


def accept_invitation(token: str, password: str, first_name: str = "", last_name: str = "") -> UserAccount:
    """
    Accept an invitation: validate token, create UserAccount, link Staff, assign role.
    """
    try:
        invitation = Invitation.objects.select_related("hospital", "role", "staff").get(token=token)
    except Invitation.DoesNotExist:
        raise NotFound("Invitation not found or already used.")

    if invitation.status != Invitation.Status.PENDING:
        raise ValidationError({"detail": f"Invitation is {invitation.status}."})

    if invitation.is_expired:
        invitation.status = Invitation.Status.EXPIRED
        invitation.save(update_fields=["status"])
        raise ValidationError({"detail": "Invitation has expired."})

    validate_password(password)
    normalized_email = (invitation.email or "").strip().lower()
    if not normalized_email:
        raise ValidationError({"detail": "Invitation email is missing."})

    with transaction.atomic():
        # Update staff name if provided
        staff = invitation.staff
        if first_name:
            staff.first_name = first_name
        if last_name:
            staff.last_name = last_name
        if not staff.email:
            staff.email = normalized_email
        staff.save(update_fields=["first_name", "last_name", "email", "updated_at"])

        pending_user = UserAccount.objects.filter(staff=staff).order_by("-created_at").first()
        if pending_user:
            if UserAccount.objects.exclude(id=pending_user.id).filter(
                email__iexact=normalized_email,
                is_active=True,
            ).exists():
                raise ValidationError({"detail": "An active account with this email already exists."})

            if pending_user.email != normalized_email:
                pending_user.email = normalized_email

            pending_user.set_password(password)
            pending_user.is_active = True
            pending_user.save(update_fields=["email", "password", "is_active"])
            user = pending_user
        else:
            if UserAccount.objects.filter(email__iexact=normalized_email, is_active=True).exists():
                raise ValidationError({"detail": "An active account with this email already exists."})

            user = UserAccount.objects.create_user(
                email=normalized_email,
                password=password,
                staff=staff,
                is_active=True,
            )

        if invitation.role:
            UserRole.objects.create(
                user=user,
                role=invitation.role,
                hospital=invitation.hospital,
                assigned_by=None,
            )
            if staff.role_id != invitation.role_id:
                staff.role = invitation.role
                staff.save(update_fields=["role", "updated_at"])

        hospital_role = _resolve_hospital_role_for_invitation(invitation, actor=None)
        UserHospitalRole.objects.update_or_create(
            user=user,
            defaults={
                "hospital": invitation.hospital,
                "hospital_role": hospital_role,
                "assigned_by": None,
            },
        )

        invitation.status = Invitation.Status.ACCEPTED
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["status", "accepted_at", "updated_at"])

    logger.info("Invitation accepted for %s, UserAccount %s created", invitation.email, user.id)
    return user


def assign_role(user: UserAccount, role_id, hospital_id, actor: UserAccount) -> UserRole:
    """Assign a role to a user, scoped to a hospital."""
    try:
        role = Role.objects.get(id=role_id)
    except Role.DoesNotExist:
        raise NotFound("Role not found.")

    from apps.hospitals.models import Hospital

    try:
        hospital = Hospital.objects.get(id=hospital_id) if hospital_id else None
    except Hospital.DoesNotExist:
        raise NotFound("Hospital not found.")

    user_role, created = UserRole.objects.get_or_create(
        user=user, role=role, hospital=hospital,
        defaults={"assigned_by": actor},
    )
    if not created:
        raise ValidationError({"detail": "Role already assigned."})

    if getattr(user, "staff", None):
        user.staff.role = role
        user.staff.save(update_fields=["role", "updated_at"])

    logger.info("Role %s assigned to user %s by %s", role.name, user.id, actor.id)
    return user_role


def revoke_role(user: UserAccount, role_id, hospital_id) -> None:
    """Remove a role from a user."""
    deleted, _ = UserRole.objects.filter(
        user=user, role_id=role_id, hospital_id=hospital_id
    ).delete()
    if not deleted:
        raise NotFound("Role assignment not found.")

    if getattr(user, "staff", None) and user.staff.role_id == role_id:
        fallback = user.user_roles.order_by("assigned_at").first()
        user.staff.role = fallback.role if fallback else None
        user.staff.save(update_fields=["role", "updated_at"])


def assign_permissions_to_role(role: Role, permission_codes: list[str], actor: UserAccount | None = None) -> dict:
    """Assign one or more permissions to a role without duplicating mappings."""
    normalized_codes = _normalize_permission_codes(permission_codes)
    if not normalized_codes:
        raise ValidationError({"permission_codes": ["At least one permission code is required."]})

    permissions = Permission.objects.filter(code__in=normalized_codes, is_active=True)
    found_codes = set(permissions.values_list("code", flat=True))
    missing_codes = sorted(set(normalized_codes) - found_codes)
    if missing_codes:
        raise ValidationError({"permission_codes": [f"Permission not found: {code}" for code in missing_codes]})

    already_assigned_codes = set(role.permissions.filter(code__in=normalized_codes).values_list("code", flat=True))
    assigned_codes = []

    for permission in permissions:
        if permission.code in already_assigned_codes:
            continue
        RolePermission.objects.get_or_create(
            role=role,
            permission=permission,
            defaults={"assigned_by": actor},
        )
        assigned_codes.append(permission.code)

    logger.info(
        "Role %s assigned permissions %s by %s",
        role.name,
        ",".join(assigned_codes) if assigned_codes else "<none>",
        getattr(actor, "id", None),
    )
    return {
        "role": role.name,
        "assigned": sorted(assigned_codes),
        "already_assigned": sorted(already_assigned_codes),
    }


def revoke_permissions_from_role(role: Role, permission_codes: list[str]) -> dict:
    """Revoke one or more permissions from a role."""
    normalized_codes = _normalize_permission_codes(permission_codes)
    if not normalized_codes:
        raise ValidationError({"permission_codes": ["At least one permission code is required."]})

    to_revoke = set(role.permissions.filter(code__in=normalized_codes).values_list("code", flat=True))
    removed, _ = RolePermission.objects.filter(role=role, permission__code__in=normalized_codes).delete()

    logger.info("Role %s revoked permissions %s", role.name, ",".join(sorted(to_revoke)) if to_revoke else "<none>")
    return {
        "role": role.name,
        "removed": sorted(to_revoke),
        "removed_count": removed,
    }


def get_effective_permissions_for_user(user: UserAccount) -> dict:
    """Return effective permission codes for a user based on assigned roles."""
    from .rbac_services import get_effective_permissions_for_user_v2

    dual_scope_payload = get_effective_permissions_for_user_v2(user)

    role_names = set(dual_scope_payload.get("platform_roles", []))
    if dual_scope_payload.get("hospital_role"):
        role_names.add(dual_scope_payload["hospital_role"])

    role_permission_map = {
        **dual_scope_payload.get("permissions_by_scope", {}).get("platform_roles", {}),
    }
    hospital_scope = dual_scope_payload.get("permissions_by_scope", {}).get("hospital_role", {})
    hospital_role_name = hospital_scope.get("name")
    if hospital_role_name:
        role_permission_map[hospital_role_name] = hospital_scope.get("permissions", [])

    return {
        "user_id": str(user.id),
        "roles": sorted(role_names),
        "effective_permissions": dual_scope_payload["effective_permissions"],
        "permissions_by_role": {
            role_name: sorted(codes)
            for role_name, codes in sorted(role_permission_map.items(), key=lambda item: item[0])
        },
        "platform_roles": dual_scope_payload.get("platform_roles", []),
        "hospital_role": dual_scope_payload.get("hospital_role"),
        "hospital_id": dual_scope_payload.get("hospital_id"),
        "permissions_by_scope": dual_scope_payload.get("permissions_by_scope", {}),
    }


def suspend_staff(staff: Staff, actor) -> Staff:
    staff.employment_status = Staff.EmploymentStatus.SUSPENDED
    staff.save(update_fields=["employment_status", "updated_at"])
    logger.info("Staff %s suspended by %s", staff.id, actor.id)
    return staff


def revoke_invitation(invitation: Invitation, actor) -> Invitation:
    if invitation.status != Invitation.Status.PENDING:
        raise ValidationError({"detail": "Only pending invitations can be revoked."})
    invitation.status = Invitation.Status.REVOKED
    invitation.save(update_fields=["status", "updated_at"])
    logger.info("Invitation %s revoked by %s", invitation.id, actor.id)
    return invitation
