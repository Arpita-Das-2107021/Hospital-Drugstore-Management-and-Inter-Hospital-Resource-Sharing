"""Dual-scope RBAC services (platform + hospital)."""
import logging

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

from apps.audit.services import write_authorization_audit_log
from common.permissions.runtime import has_any_permission

from .models import (
    HospitalRole,
    HospitalRolePermission,
    Permission,
    PlatformRole,
    PlatformRolePermission,
    UserHospitalRole,
    UserPlatformRole,
)

logger = logging.getLogger("hrsp.staff.rbac")


HOSPITAL_SCOPED_ROLE_NAMES = {
    "HEALTHCARE_ADMIN",
    "STAFF",
    "PHARMACIST",
    "LOGISTICS_STAFF",
    "INVENTORY_MANAGER",
    "DOCTOR",
}

DEFAULT_HOSPITAL_STAFF_ROLE_NAME = "STAFF"
DEFAULT_HOSPITAL_STAFF_ROLE_DESCRIPTION = "Baseline non-admin hospital staff access."
DEFAULT_HOSPITAL_STAFF_PERMISSION_CODES = (
    "hospital:inventory.view",
    "hospital:resource_share.view",
    "communication:chat.view",
    "communication:conversation.view",
)


def _validate_platform_role_name(role_name: str) -> None:
    if role_name in HOSPITAL_SCOPED_ROLE_NAMES:
        raise ValidationError(
            {
                "name": (
                    f"{role_name} is hospital-scoped and cannot be used as a platform role. "
                    "Assign it via hospital-role templates instead."
                )
            }
        )


def _normalize_permission_codes(permission_codes: list[str]) -> list[str]:
    return sorted({code.strip() for code in permission_codes if code and code.strip()})


def _get_user_hospital_or_raise(user) -> tuple[str, object]:
    staff = getattr(user, "staff", None)
    hospital = getattr(staff, "hospital", None)
    if not hospital:
        raise ValidationError({"user": "User must be linked to staff and hospital."})
    return str(hospital.id), hospital


def _get_permission_lookup(normalized_codes: list[str]) -> dict[str, Permission]:
    permissions = Permission.objects.filter(code__in=normalized_codes, is_active=True)
    found_codes = set(permissions.values_list("code", flat=True))
    missing_codes = sorted(set(normalized_codes) - found_codes)
    if missing_codes:
        raise ValidationError({"permission_codes": [f"Permission not found: {code}" for code in missing_codes]})
    return {permission.code: permission for permission in permissions}


@transaction.atomic
def create_platform_role(name: str, description: str = "") -> PlatformRole:
    role_name = (name or "").strip().upper()
    if not role_name:
        raise ValidationError({"name": "Role name is required."})
    _validate_platform_role_name(role_name)
    role, created = PlatformRole.objects.get_or_create(
        name=role_name,
        defaults={"description": description.strip()},
    )
    if not created and description is not None:
        role.description = description.strip()
        role.save(update_fields=["description", "updated_at"])
    return role


@transaction.atomic
def create_hospital_role(hospital, name: str, description: str = "") -> HospitalRole:
    role_name = (name or "").strip().upper()
    if not role_name:
        raise ValidationError({"name": "Role name is required."})
    role, created = HospitalRole.objects.get_or_create(
        hospital=hospital,
        name=role_name,
        defaults={"description": description.strip()},
    )
    if not created and description is not None:
        role.description = description.strip()
        role.save(update_fields=["description", "updated_at"])
    return role


@transaction.atomic
def assign_permissions_to_platform_role(
    role: PlatformRole,
    permission_codes: list[str],
    actor=None,
) -> dict:
    normalized_codes = _normalize_permission_codes(permission_codes)
    if not normalized_codes:
        raise ValidationError({"permission_codes": ["At least one permission code is required."]})

    lookup = _get_permission_lookup(normalized_codes)
    already_assigned = set(
        role.role_permissions.filter(permission__code__in=normalized_codes).values_list("permission__code", flat=True)
    )

    assigned = []
    for code in normalized_codes:
        if code in already_assigned:
            continue
        PlatformRolePermission.objects.get_or_create(
            platform_role=role,
            permission=lookup[code],
            defaults={"assigned_by": actor},
        )
        assigned.append(code)

    write_authorization_audit_log(
        user=actor,
        action="platform_role_permissions_assigned",
        resource=f"platform_role:{role.id}",
        hospital=getattr(getattr(actor, "staff", None), "hospital", None),
        metadata={"assigned": assigned, "already_assigned": sorted(already_assigned)},
    )

    return {
        "role": role.name,
        "assigned": sorted(assigned),
        "already_assigned": sorted(already_assigned),
    }


@transaction.atomic
def revoke_permissions_from_platform_role(role: PlatformRole, permission_codes: list[str], actor=None) -> dict:
    normalized_codes = _normalize_permission_codes(permission_codes)
    if not normalized_codes:
        raise ValidationError({"permission_codes": ["At least one permission code is required."]})

    to_revoke = set(
        role.role_permissions.filter(permission__code__in=normalized_codes).values_list("permission__code", flat=True)
    )
    removed_count, _ = PlatformRolePermission.objects.filter(
        platform_role=role,
        permission__code__in=normalized_codes,
    ).delete()

    write_authorization_audit_log(
        user=actor,
        action="platform_role_permissions_revoked",
        resource=f"platform_role:{role.id}",
        hospital=getattr(getattr(actor, "staff", None), "hospital", None),
        metadata={"removed": sorted(to_revoke), "removed_count": removed_count},
    )

    return {
        "role": role.name,
        "removed": sorted(to_revoke),
        "removed_count": removed_count,
    }


@transaction.atomic
def assign_permissions_to_hospital_role(
    role: HospitalRole,
    permission_codes: list[str],
    actor=None,
) -> dict:
    normalized_codes = _normalize_permission_codes(permission_codes)
    if not normalized_codes:
        raise ValidationError({"permission_codes": ["At least one permission code is required."]})

    lookup = _get_permission_lookup(normalized_codes)
    already_assigned = set(
        role.role_permissions.filter(permission__code__in=normalized_codes).values_list("permission__code", flat=True)
    )

    assigned = []
    for code in normalized_codes:
        if code in already_assigned:
            continue
        HospitalRolePermission.objects.get_or_create(
            hospital_role=role,
            permission=lookup[code],
            defaults={"assigned_by": actor},
        )
        assigned.append(code)

    write_authorization_audit_log(
        user=actor,
        action="hospital_role_permissions_assigned",
        resource=f"hospital_role:{role.id}",
        hospital=role.hospital,
        metadata={"assigned": assigned, "already_assigned": sorted(already_assigned)},
    )

    return {
        "role": role.name,
        "hospital_id": str(role.hospital_id),
        "assigned": sorted(assigned),
        "already_assigned": sorted(already_assigned),
    }


@transaction.atomic
def revoke_permissions_from_hospital_role(role: HospitalRole, permission_codes: list[str], actor=None) -> dict:
    normalized_codes = _normalize_permission_codes(permission_codes)
    if not normalized_codes:
        raise ValidationError({"permission_codes": ["At least one permission code is required."]})

    to_revoke = set(
        role.role_permissions.filter(permission__code__in=normalized_codes).values_list("permission__code", flat=True)
    )
    removed_count, _ = HospitalRolePermission.objects.filter(
        hospital_role=role,
        permission__code__in=normalized_codes,
    ).delete()

    write_authorization_audit_log(
        user=actor,
        action="hospital_role_permissions_revoked",
        resource=f"hospital_role:{role.id}",
        hospital=role.hospital,
        metadata={"removed": sorted(to_revoke), "removed_count": removed_count},
    )

    return {
        "role": role.name,
        "hospital_id": str(role.hospital_id),
        "removed": sorted(to_revoke),
        "removed_count": removed_count,
    }


@transaction.atomic
def ensure_default_hospital_staff_role(hospital, actor=None) -> HospitalRole:
    """Ensure each hospital has a least-privilege STAFF role with canonical baseline permissions."""
    role, _ = HospitalRole.objects.get_or_create(
        hospital=hospital,
        name=DEFAULT_HOSPITAL_STAFF_ROLE_NAME,
        defaults={
            "description": DEFAULT_HOSPITAL_STAFF_ROLE_DESCRIPTION,
            "is_active": True,
        },
    )

    update_fields = []
    if role.description != DEFAULT_HOSPITAL_STAFF_ROLE_DESCRIPTION:
        role.description = DEFAULT_HOSPITAL_STAFF_ROLE_DESCRIPTION
        update_fields.append("description")
    if not role.is_active:
        role.is_active = True
        update_fields.append("is_active")
    if update_fields:
        role.save(update_fields=[*update_fields, "updated_at"])

    desired_codes = set(DEFAULT_HOSPITAL_STAFF_PERMISSION_CODES)
    current_codes = set(role.role_permissions.values_list("permission__code", flat=True))

    add_codes = sorted(desired_codes - current_codes)
    if add_codes:
        assign_permissions_to_hospital_role(role=role, permission_codes=add_codes, actor=actor)

    remove_codes = sorted(current_codes - desired_codes)
    if remove_codes:
        revoke_permissions_from_hospital_role(role=role, permission_codes=remove_codes, actor=actor)

    return role


@transaction.atomic
def assign_platform_role_to_user(user, platform_role: PlatformRole, actor) -> UserPlatformRole:
    _validate_platform_role_name(platform_role.name)

    assignment, created = UserPlatformRole.objects.get_or_create(
        user=user,
        platform_role=platform_role,
        defaults={"assigned_by": actor},
    )
    if not created:
        raise ValidationError({"detail": "Platform role already assigned."})

    write_authorization_audit_log(
        user=actor,
        action="platform_role_assigned",
        resource=f"user:{user.id}",
        hospital=getattr(getattr(actor, "staff", None), "hospital", None),
        metadata={"platform_role": platform_role.name, "target_user_id": str(user.id)},
    )

    return assignment


@transaction.atomic
def revoke_platform_role_from_user(assignment: UserPlatformRole, actor=None) -> None:
    role_name = assignment.platform_role.name
    user = assignment.user
    assignment.delete()

    write_authorization_audit_log(
        user=actor,
        action="platform_role_revoked",
        resource=f"user:{user.id}",
        hospital=getattr(getattr(actor, "staff", None), "hospital", None),
        metadata={"platform_role": role_name, "target_user_id": str(user.id)},
    )


@transaction.atomic
def set_user_hospital_role(user, hospital_role: HospitalRole, actor) -> tuple[UserHospitalRole, bool]:
    _, user_hospital = _get_user_hospital_or_raise(user)
    actor_is_platform_admin = has_any_permission(
        actor,
        ("platform:user_role.assign", "platform:role.assign", "platform:role.manage"),
        allow_role_fallback=True,
        legacy_roles=("SUPER_ADMIN", "PLATFORM_ADMIN"),
    )
    actor_hospital = getattr(getattr(actor, "staff", None), "hospital", None)

    if not actor_is_platform_admin and actor_hospital is None:
        raise ValidationError({"user": "Actor must be linked to staff and hospital."})

    if not actor_is_platform_admin and actor_hospital.id != hospital_role.hospital_id:
        raise ValidationError({"hospital_role_id": "Actor cannot assign roles for another hospital."})

    if user_hospital.id != hospital_role.hospital_id:
        raise ValidationError({"hospital_role_id": "User and role must belong to the same hospital."})

    existing = UserHospitalRole.objects.filter(user=user).select_related("hospital_role").first()
    replaced_existing = bool(existing and existing.hospital_role_id != hospital_role.id)

    assignment, _ = UserHospitalRole.objects.update_or_create(
        user=user,
        defaults={
            "hospital": hospital_role.hospital,
            "hospital_role": hospital_role,
            "assigned_by": actor,
        },
    )

    write_authorization_audit_log(
        user=actor,
        action="hospital_role_assigned",
        resource=f"user:{user.id}",
        hospital=hospital_role.hospital,
        metadata={
            "hospital_role": hospital_role.name,
            "target_user_id": str(user.id),
            "replaced_existing": replaced_existing,
        },
    )

    return assignment, replaced_existing


@transaction.atomic
def remove_user_hospital_role(user, actor=None) -> None:
    assignment = UserHospitalRole.objects.filter(user=user).select_related("hospital_role", "hospital").first()
    if not assignment:
        raise NotFound("Hospital role assignment not found.")

    hospital = assignment.hospital
    role_name = assignment.hospital_role.name
    assignment.delete()

    write_authorization_audit_log(
        user=actor,
        action="hospital_role_revoked",
        resource=f"user:{user.id}",
        hospital=hospital,
        metadata={"hospital_role": role_name, "target_user_id": str(user.id)},
    )


def get_effective_permissions_for_user_v2(user) -> dict:
    platform_assignments = user.platform_role_assignments.select_related("platform_role").all()
    platform_roles = sorted(
        {
            assignment.platform_role.name
            for assignment in platform_assignments
            if assignment.platform_role and assignment.platform_role.is_active
        }
    )

    platform_permission_map = {}
    for assignment in platform_assignments:
        role = assignment.platform_role
        if not role or not role.is_active:
            continue
        codes = role.role_permissions.filter(permission__is_active=True).values_list("permission__code", flat=True)
        platform_permission_map[role.name] = sorted(set(codes))

    hospital_assignment = UserHospitalRole.objects.filter(user=user).select_related("hospital_role", "hospital").first()
    hospital_role_name = None
    hospital_role_permissions = []
    hospital_id = str(user.get_hospital_id()) if hasattr(user, "get_hospital_id") and user.get_hospital_id() else None

    if hospital_assignment and hospital_assignment.hospital_role.is_active:
        hospital_role_name = hospital_assignment.hospital_role.name
        hospital_id = str(hospital_assignment.hospital_id)
        hospital_role_permissions = sorted(
            set(
                hospital_assignment.hospital_role.role_permissions.filter(permission__is_active=True).values_list(
                    "permission__code", flat=True
                )
            )
        )

    effective_codes = sorted(set(user.get_effective_permission_codes()))

    return {
        "user_id": str(user.id),
        "hospital_id": hospital_id,
        "platform_roles": platform_roles,
        "hospital_role": hospital_role_name,
        "effective_permissions": effective_codes,
        "permissions_by_scope": {
            "platform_roles": {role_name: codes for role_name, codes in sorted(platform_permission_map.items())},
            "hospital_role": {
                "name": hospital_role_name,
                "permissions": hospital_role_permissions,
            },
        },
    }
