"""Role-based websocket access policy for realtime channels."""

from __future__ import annotations

from collections.abc import Iterable

SOCKET_TYPE_BROADCAST = "broadcast"
SOCKET_TYPE_CHAT = "chat"

ROLE_SYSTEM_ADMIN = "SYSTEM_ADMIN"
ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_ML_ENGINEER = "ML_ENGINEER"

SYSTEM_ADMIN_ROLE_NAMES = frozenset({ROLE_SYSTEM_ADMIN, ROLE_SUPER_ADMIN})

# Preserve existing behavior for all authenticated roles except explicit exclusions.
BROADCAST_DENIED_ROLE_NAMES = frozenset({ROLE_ML_ENGINEER})
CHAT_DENIED_ROLE_NAMES = frozenset({ROLE_ML_ENGINEER, *SYSTEM_ADMIN_ROLE_NAMES})


def _normalize_role_names(role_names: Iterable[str]) -> set[str]:
    normalized: set[str] = set()
    for role_name in role_names:
        value = str(role_name or "").strip().upper()
        if value:
            normalized.add(value)
    return normalized


def get_user_role_names(user) -> set[str]:
    if not user or not getattr(user, "is_authenticated", False):
        return set()

    resolver = getattr(user, "get_all_role_names", None)
    if not callable(resolver):
        return set()

    return _normalize_role_names(resolver() or ())


def is_role_set_allowed_for_socket(*, role_names: Iterable[str], socket_type: str) -> bool:
    normalized_roles = _normalize_role_names(role_names)

    if socket_type == SOCKET_TYPE_BROADCAST:
        return normalized_roles.isdisjoint(BROADCAST_DENIED_ROLE_NAMES)

    if socket_type == SOCKET_TYPE_CHAT:
        return normalized_roles.isdisjoint(CHAT_DENIED_ROLE_NAMES)

    return False


def is_user_allowed_for_socket(*, user, socket_type: str) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if not getattr(user, "is_active", True):
        return False

    role_names = get_user_role_names(user)
    return is_role_set_allowed_for_socket(role_names=role_names, socket_type=socket_type)


def filter_socket_eligible_user_ids(*, socket_type: str, user_ids: Iterable) -> list:
    deduped_user_ids = []
    seen_user_ids: set[str] = set()
    for user_id in user_ids:
        key = str(user_id)
        if not user_id or key in seen_user_ids:
            continue
        deduped_user_ids.append(user_id)
        seen_user_ids.add(key)

    if not deduped_user_ids:
        return []

    from django.contrib.auth import get_user_model

    UserAccount = get_user_model()
    users = (
        UserAccount.objects.filter(id__in=deduped_user_ids, is_active=True)
        .select_related("hospital_role_assignment__hospital_role")
        .prefetch_related("platform_role_assignments__platform_role")
    )
    eligible_user_ids = {
        str(user.id)
        for user in users
        if is_user_allowed_for_socket(user=user, socket_type=socket_type)
    }

    return [user_id for user_id in deduped_user_ids if str(user_id) in eligible_user_ids]


def is_user_id_allowed_for_socket(*, socket_type: str, user_id) -> bool:
    if not user_id:
        return False

    from django.contrib.auth import get_user_model

    UserAccount = get_user_model()
    user = (
        UserAccount.objects.filter(id=user_id, is_active=True)
        .select_related("hospital_role_assignment__hospital_role")
        .prefetch_related("platform_role_assignments__platform_role")
        .first()
    )
    if not user:
        return False

    return is_user_allowed_for_socket(user=user, socket_type=socket_type)