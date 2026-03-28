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

from .models import Invitation, Role, Staff, UserRole

UserAccount = get_user_model()
logger = logging.getLogger("hrsp.staff")


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
        if UserAccount.objects.exclude(id=user_account.id).filter(email__iexact=normalized_email).exists():
            raise ValidationError({"email": "An account with this email already exists."})
        user_account.email = normalized_email
        user_account.save(update_fields=["email"])


def create_staff_with_invitation(hospital, data: dict, email: str, actor, role_id=None) -> Staff:
    """Create staff profile, create a pending user account, and send set-password invitation."""
    payload = dict(data)
    payload.pop("hospital", None)
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
        staff = Staff.objects.create(hospital=hospital, email=email, role=role, **payload)
        existing_user = UserAccount.objects.filter(email=email).first()
        if existing_user and existing_user.is_active:
            raise ValidationError({"email": "An active user with this email already exists."})

        if existing_user:
            existing_user.staff = staff
            existing_user.is_active = False
            existing_user.set_unusable_password()
            existing_user.save(update_fields=["staff", "is_active", "password"])
        else:
            UserAccount.objects.create_user(
                email=email,
                password=None,
                staff=staff,
                is_active=False,
            )

        send_invitation(
            hospital=hospital,
            email=email,
            role_id=role_id,
            actor=actor,
            extra=extra,
            staff=staff,
            invitation_link_path="set-password",
        )

    logger.info("Staff %s created with pending account + invitation for %s", staff.id, email)
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

    if Invitation.objects.filter(
        hospital=hospital, email=email, status=Invitation.Status.PENDING
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
            email=email,
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
        email=email,
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
        recipient_list=[email],
    )

    logger.info("Invitation sent to %s for hospital %s", email, hospital.id)
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

    with transaction.atomic():
        # Update staff name if provided
        staff = invitation.staff
        if first_name:
            staff.first_name = first_name
        if last_name:
            staff.last_name = last_name
        if not staff.email:
            staff.email = invitation.email
        staff.save(update_fields=["first_name", "last_name", "email", "updated_at"])

        existing_user = UserAccount.objects.filter(email=invitation.email).first()
        if existing_user:
            if existing_user.is_active:
                raise ValidationError({"detail": "An account with this email already exists."})
            existing_user.staff = staff
            existing_user.set_password(password)
            existing_user.is_active = True
            existing_user.save(update_fields=["staff", "password", "is_active"])
            user = existing_user
        else:
            user = UserAccount.objects.create_user(
                email=invitation.email,
                password=password,
                staff=staff,
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
