"""Read-side services for polling badge APIs."""

from __future__ import annotations

from apps.notifications.services import get_broadcast_badge_metadata

from .cache_keys import (
    hospital_completed_today_key,
    hospital_incoming_key,
    hospital_outgoing_key,
    hospital_pending_dispatch_key,
    hospital_request_decisions_key,
    hospital_update_approvals_key,
    platform_healthcare_pending_registrations_key,
    platform_offboarding_requests_key,
    platform_pending_actions_key,
    platform_update_requests_key,
)
from .repository import BadgeCounterRepository


class HealthcareBadgeQueryService:
    def __init__(self, repository: BadgeCounterRepository | None = None) -> None:
        self.repository = repository or BadgeCounterRepository()

    def get_badges(self, hospital_id: str, user=None) -> dict[str, int | bool]:
        scoped_hospital_id = str(hospital_id)
        badges = {
            "incomingRequests": self.repository.get(hospital_incoming_key(scoped_hospital_id)),
            "outgoingRequests": self.repository.get(hospital_outgoing_key(scoped_hospital_id)),
            "pendingDispatches": self.repository.get(hospital_pending_dispatch_key(scoped_hospital_id)),
            "requestDecisions": self.repository.get(hospital_request_decisions_key(scoped_hospital_id)),
            "updateApprovals": self.repository.get(hospital_update_approvals_key(scoped_hospital_id)),
            "completedToday": self.repository.get(hospital_completed_today_key(scoped_hospital_id)),
        }
        if user and getattr(user, "is_authenticated", False):
            badges.update(get_broadcast_badge_metadata(user))
        else:
            badges.update(
                {
                    "broadcast_unread_count": 0,
                    "broadcast_changed": False,
                    "broadcast_version": 0,
                }
            )
        return badges


class PlatformBadgeQueryService:
    def __init__(self, repository: BadgeCounterRepository | None = None) -> None:
        self.repository = repository or BadgeCounterRepository()

    def get_badges(self, user=None) -> dict[str, int | bool]:
        healthcare_pending_registration = self.repository.get(platform_healthcare_pending_registrations_key())
        update_requests = self.repository.get(platform_update_requests_key())
        offboarding_requests = self.repository.get(platform_offboarding_requests_key())

        platform_pending_actions = self.repository.get(platform_pending_actions_key())
        if platform_pending_actions == 0 and any(
            (healthcare_pending_registration, update_requests, offboarding_requests)
        ):
            platform_pending_actions = healthcare_pending_registration + update_requests + offboarding_requests

        badges = {
            "healthcarePendingRegistration": healthcare_pending_registration,
            "updateRequests": update_requests,
            "offboardingRequests": offboarding_requests,
            "platformPendingActions": platform_pending_actions,
        }
        if user and getattr(user, "is_authenticated", False):
            badges.update(get_broadcast_badge_metadata(user))
        else:
            badges.update(
                {
                    "broadcast_unread_count": 0,
                    "broadcast_changed": False,
                    "broadcast_version": 0,
                }
            )
        return badges
