"""Event handlers that mutate badge counters."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone

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
from .events import (
    DispatchCompletedEvent,
    HospitalRegisteredEvent,
    HospitalUpdateDecisionViewedEvent,
    HospitalRegistrationRejectedEvent,
    HospitalRegistrationSubmittedEvent,
    HospitalUpdateReviewedEvent,
    HospitalUpdateSubmittedEvent,
    OffboardingReviewedEvent,
    OffboardingSubmittedEvent,
    RequestApprovedEvent,
    RequestCancelledEvent,
    RequestCreatedEvent,
    RequestDecisionViewedEvent,
    RequestDispatchedEvent,
    RequestExpiredEvent,
    RequestRejectedEvent,
)
from .repository import BadgeCounterRepository

if TYPE_CHECKING:
    from .publisher import DomainEventPublisher


COMPLETED_TODAY_KEY_TTL_SECONDS = 2 * 24 * 60 * 60
_repo = BadgeCounterRepository()


def _already_processed(event_id: str) -> bool:
    return not _repo.mark_event_processed(event_id)


def _apply_platform_deltas(*, registrations: int = 0, updates: int = 0, offboarding: int = 0) -> None:
    total_delta = 0

    if registrations:
        _repo.adjust(platform_healthcare_pending_registrations_key(), registrations)
        total_delta += registrations

    if updates:
        _repo.adjust(platform_update_requests_key(), updates)
        total_delta += updates

    if offboarding:
        _repo.adjust(platform_offboarding_requests_key(), offboarding)
        total_delta += offboarding

    if total_delta:
        _repo.adjust(platform_pending_actions_key(), total_delta)


def _handle_request_created(event: RequestCreatedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _repo.adjust(hospital_incoming_key(event.supplying_hospital_id), 1)
    _repo.adjust(hospital_outgoing_key(event.requesting_hospital_id), 1)


def _handle_request_approved(event: RequestApprovedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _repo.adjust(hospital_incoming_key(event.supplying_hospital_id), -1)
    _repo.adjust(hospital_pending_dispatch_key(event.supplying_hospital_id), 1)
    _repo.adjust(hospital_request_decisions_key(event.requesting_hospital_id), 1)


def _handle_request_rejected(event: RequestRejectedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _repo.adjust(hospital_incoming_key(event.supplying_hospital_id), -1)
    _repo.adjust(hospital_outgoing_key(event.requesting_hospital_id), -1)
    _repo.adjust(hospital_request_decisions_key(event.requesting_hospital_id), 1)


def _handle_request_decision_viewed(event: RequestDecisionViewedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _repo.adjust(hospital_request_decisions_key(event.requesting_hospital_id), -1)


def _handle_request_dispatched(event: RequestDispatchedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _repo.adjust(hospital_pending_dispatch_key(event.supplying_hospital_id), -1)


def _handle_dispatch_completed(event: DispatchCompletedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _repo.adjust(hospital_outgoing_key(event.requesting_hospital_id), -1)

    completed_on = event.completed_on or timezone.localdate()
    for hospital_id in {event.requesting_hospital_id, event.supplying_hospital_id}:
        _repo.adjust(
            hospital_completed_today_key(hospital_id, day=completed_on),
            1,
            timeout=COMPLETED_TODAY_KEY_TTL_SECONDS,
        )


def _handle_request_cancelled(event: RequestCancelledEvent) -> None:
    if _already_processed(event.event_id):
        return

    if event.was_pending_incoming:
        _repo.adjust(hospital_incoming_key(event.supplying_hospital_id), -1)

    if event.was_pending_dispatch:
        _repo.adjust(hospital_pending_dispatch_key(event.supplying_hospital_id), -1)

    _repo.adjust(hospital_outgoing_key(event.requesting_hospital_id), -1)


def _handle_request_expired(event: RequestExpiredEvent) -> None:
    if _already_processed(event.event_id):
        return

    if event.was_pending_incoming:
        _repo.adjust(hospital_incoming_key(event.supplying_hospital_id), -1)

    if event.was_pending_dispatch:
        _repo.adjust(hospital_pending_dispatch_key(event.supplying_hospital_id), -1)

    _repo.adjust(hospital_outgoing_key(event.requesting_hospital_id), -1)


def _handle_registration_submitted(event: HospitalRegistrationSubmittedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _apply_platform_deltas(registrations=1)


def _handle_registration_registered(event: HospitalRegisteredEvent) -> None:
    if _already_processed(event.event_id):
        return

    _apply_platform_deltas(registrations=-1)


def _handle_registration_rejected(event: HospitalRegistrationRejectedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _apply_platform_deltas(registrations=-1)


def _handle_update_submitted(event: HospitalUpdateSubmittedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _apply_platform_deltas(updates=1)


def _handle_update_reviewed(event: HospitalUpdateReviewedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _apply_platform_deltas(updates=-1)
    _repo.adjust(hospital_update_approvals_key(event.hospital_id), 1)


def _handle_update_decision_viewed(event: HospitalUpdateDecisionViewedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _repo.adjust(hospital_update_approvals_key(event.hospital_id), -1)


def _handle_offboarding_submitted(event: OffboardingSubmittedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _apply_platform_deltas(offboarding=1)


def _handle_offboarding_reviewed(event: OffboardingReviewedEvent) -> None:
    if _already_processed(event.event_id):
        return

    _apply_platform_deltas(offboarding=-1)


def register_badge_handlers(publisher: "DomainEventPublisher") -> None:
    publisher.subscribe(RequestCreatedEvent, _handle_request_created)
    publisher.subscribe(RequestApprovedEvent, _handle_request_approved)
    publisher.subscribe(RequestRejectedEvent, _handle_request_rejected)
    publisher.subscribe(RequestDecisionViewedEvent, _handle_request_decision_viewed)
    publisher.subscribe(RequestDispatchedEvent, _handle_request_dispatched)
    publisher.subscribe(DispatchCompletedEvent, _handle_dispatch_completed)
    publisher.subscribe(RequestCancelledEvent, _handle_request_cancelled)
    publisher.subscribe(RequestExpiredEvent, _handle_request_expired)
    publisher.subscribe(HospitalRegistrationSubmittedEvent, _handle_registration_submitted)
    publisher.subscribe(HospitalRegisteredEvent, _handle_registration_registered)
    publisher.subscribe(HospitalRegistrationRejectedEvent, _handle_registration_rejected)
    publisher.subscribe(HospitalUpdateSubmittedEvent, _handle_update_submitted)
    publisher.subscribe(HospitalUpdateReviewedEvent, _handle_update_reviewed)
    publisher.subscribe(HospitalUpdateDecisionViewedEvent, _handle_update_decision_viewed)
    publisher.subscribe(OffboardingSubmittedEvent, _handle_offboarding_submitted)
    publisher.subscribe(OffboardingReviewedEvent, _handle_offboarding_reviewed)
