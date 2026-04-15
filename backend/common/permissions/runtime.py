"""Runtime authorization helpers for permission-first access control."""

from __future__ import annotations

import logging
from collections.abc import Iterable

logger = logging.getLogger("hrsp.authz")

LEGACY_PLATFORM_ADMIN_ROLES = ("SUPER_ADMIN", "PLATFORM_ADMIN")
USER_CONTEXT_HEALTHCARE = "HEALTHCARE"
USER_CONTEXT_PLATFORM = "PLATFORM"
USER_ACCESS_MODE_UI = "UI"
USER_ACCESS_MODE_API = "API"

VALID_USER_CONTEXTS = frozenset({USER_CONTEXT_HEALTHCARE, USER_CONTEXT_PLATFORM})
VALID_USER_ACCESS_MODES = frozenset({USER_ACCESS_MODE_UI, USER_ACCESS_MODE_API})

PLATFORM_OPERATOR_PERMISSION_CODES = (
    "platform:role.view",
    "platform:role.manage",
    "platform:role.assign",
    "platform:permission.view",
    "platform:user.view",
    "platform:user_role.view",
    "platform:user_role.assign",
    "platform:hospital.view",
    "platform:hospital.manage",
    "platform:hospital.review",
    "platform:audit.view",
)


def _is_authenticated(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "is_active", True))


def _normalize_codes(permission_codes: Iterable[str]) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    for code in permission_codes:
        value = str(code or "").strip()
        if not value or value in seen:
            continue
        normalized.append(value)
        seen.add(value)
    return tuple(normalized)


def _normalize_roles(role_names: Iterable[str]) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    for role_name in role_names:
        value = str(role_name or "").strip().upper()
        if not value or value in seen:
            continue
        normalized.append(value)
        seen.add(value)
    return tuple(normalized)


def _normalize_context(value: str | None) -> str | None:
    normalized = str(value or "").strip().upper()
    if normalized in VALID_USER_CONTEXTS:
        return normalized
    return None


def _normalize_access_mode(value: str | None) -> str | None:
    normalized = str(value or "").strip().upper()
    if normalized in VALID_USER_ACCESS_MODES:
        return normalized
    return None


def user_hospital_id(user):
    staff = getattr(user, "staff", None)
    return getattr(staff, "hospital_id", None)


def user_healthcare_id(user):
    return user_hospital_id(user)


def user_context(user) -> str | None:
    if not _is_authenticated(user):
        return None

    resolver = getattr(user, "get_context_domain", None)
    if callable(resolver):
        resolved = _normalize_context(resolver())
        if resolved:
            return resolved

    explicit_context = _normalize_context(getattr(user, "context_domain", None))
    if explicit_context:
        return explicit_context

    if user_hospital_id(user):
        return USER_CONTEXT_HEALTHCARE

    try:
        hospital_assignment = user.hospital_role_assignment
    except Exception:
        hospital_assignment = None
    if hospital_assignment and getattr(hospital_assignment, "hospital_id", None):
        return USER_CONTEXT_HEALTHCARE

    platform_assignments = getattr(user, "platform_role_assignments", None)
    if platform_assignments is not None:
        try:
            if platform_assignments.filter(platform_role__is_active=True).exists():
                return USER_CONTEXT_PLATFORM
        except Exception:
            pass

    if _has_legacy_role(user, _normalize_roles(LEGACY_PLATFORM_ADMIN_ROLES)):
        return USER_CONTEXT_PLATFORM

    return None


def user_access_mode(user) -> str:
    if not _is_authenticated(user):
        return USER_ACCESS_MODE_UI

    resolver = getattr(user, "get_access_mode", None)
    if callable(resolver):
        resolved = _normalize_access_mode(resolver())
        if resolved:
            return resolved

    explicit_access_mode = _normalize_access_mode(getattr(user, "access_mode", None))
    if explicit_access_mode:
        return explicit_access_mode

    return USER_ACCESS_MODE_UI


def has_required_context(
    user,
    required_context: str,
    *,
    require_healthcare_context_id: bool = False,
    request_path: str = "",
) -> bool:
    if not _is_authenticated(user):
        return False

    normalized_required_context = _normalize_context(required_context)
    if not normalized_required_context:
        return True

    resolved_context = user_context(user)
    if resolved_context != normalized_required_context:
        logger.warning(
            "Context guard denied request due to context mismatch.",
            extra={
                "user_id": str(getattr(user, "id", "")),
                "required_context": normalized_required_context,
                "resolved_context": resolved_context,
                "request_path": request_path,
            },
        )
        return False

    if normalized_required_context == USER_CONTEXT_HEALTHCARE and require_healthcare_context_id:
        healthcare_id = user_healthcare_id(user)
        if not healthcare_id:
            logger.warning(
                "Context guard denied request due to missing healthcare assignment.",
                extra={
                    "user_id": str(getattr(user, "id", "")),
                    "required_context": normalized_required_context,
                    "request_path": request_path,
                },
            )
            return False

    return True


def _has_any_permission_relation(user, permission_codes: tuple[str, ...]) -> bool:
    checker = getattr(user, "has_permission_code", None)
    return bool(callable(checker) and checker(*permission_codes))


def _has_platform_permission_relation(user, permission_codes: tuple[str, ...]) -> bool:
    assignments = getattr(user, "platform_role_assignments", None)
    if assignments is None:
        return False
    return assignments.filter(
        platform_role__is_active=True,
        platform_role__role_permissions__permission__is_active=True,
        platform_role__role_permissions__permission__code__in=permission_codes,
    ).exists()


def _has_hospital_permission_relation(user, permission_codes: tuple[str, ...], hospital_id) -> bool:
    if not hospital_id:
        return False
    return user.__class__.objects.filter(
        id=user.id,
        hospital_role_assignment__hospital_id=hospital_id,
        hospital_role_assignment__hospital_role__is_active=True,
        hospital_role_assignment__hospital_role__role_permissions__permission__is_active=True,
        hospital_role_assignment__hospital_role__role_permissions__permission__code__in=permission_codes,
    ).exists()


def _has_legacy_role(user, role_names: tuple[str, ...]) -> bool:
    if not role_names:
        return False
    checker = getattr(user, "has_role", None)
    return bool(callable(checker) and checker(*role_names))


def has_any_permission(
    user,
    permission_codes: Iterable[str],
    *,
    hospital_id=None,
    allow_role_fallback: bool = False,
    legacy_roles: Iterable[str] = (),
) -> bool:
    """Permission-first runtime check with optional legacy role fallback."""
    if not _is_authenticated(user):
        return False

    normalized_codes = _normalize_codes(permission_codes)
    if not normalized_codes:
        return False

    if hospital_id is None:
        if _has_any_permission_relation(user, normalized_codes):
            return True
    else:
        if _has_platform_permission_relation(user, normalized_codes):
            return True

        if _has_hospital_permission_relation(user, normalized_codes, hospital_id):
            return True

        # Direct permission relations are valid only for the user's own hospital scope.
        actor_hospital_id = user_hospital_id(user)
        if actor_hospital_id and str(actor_hospital_id) == str(hospital_id):
            if _has_any_permission_relation(user, normalized_codes):
                return True

    normalized_roles = _normalize_roles(legacy_roles)
    if allow_role_fallback and _has_legacy_role(user, normalized_roles):
        logger.warning(
            "Deprecated role fallback granted runtime access.",
            extra={
                "user_id": str(getattr(user, "id", "")),
                "permission_codes": list(normalized_codes),
                "legacy_roles": list(normalized_roles),
            },
        )
        return True

    return False


def has_permission(
    user,
    code: str,
    *,
    hospital_id=None,
    allow_role_fallback: bool = False,
    legacy_roles: Iterable[str] = (),
) -> bool:
    return has_any_permission(
        user,
        (code,),
        hospital_id=hospital_id,
        allow_role_fallback=allow_role_fallback,
        legacy_roles=legacy_roles,
    )


def is_platform_operator(
    user,
    *,
    allow_role_fallback: bool = True,
    require_platform_context: bool = True,
) -> bool:
    if require_platform_context and user_context(user) != USER_CONTEXT_PLATFORM:
        return False

    return has_any_permission(
        user,
        PLATFORM_OPERATOR_PERMISSION_CODES,
        allow_role_fallback=allow_role_fallback,
        legacy_roles=LEGACY_PLATFORM_ADMIN_ROLES,
    )


def has_hospital_scope_access(user, hospital_id, *, allow_role_fallback: bool = True) -> bool:
    if not _is_authenticated(user):
        return False
    if is_platform_operator(user, allow_role_fallback=allow_role_fallback):
        return True
    actor_hospital_id = user_hospital_id(user)
    return bool(actor_hospital_id and hospital_id and str(actor_hospital_id) == str(hospital_id))
