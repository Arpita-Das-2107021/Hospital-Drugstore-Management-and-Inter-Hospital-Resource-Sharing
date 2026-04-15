"""Domain events used by the badge counter subsystem."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from django.utils import timezone


@dataclass(frozen=True, slots=True)
class DomainEvent:
    event_id: str
    occurred_at: datetime = field(default_factory=timezone.now)


@dataclass(frozen=True, slots=True)
class RequestCreatedEvent(DomainEvent):
    request_id: str = ""
    requesting_hospital_id: str = ""
    supplying_hospital_id: str = ""


@dataclass(frozen=True, slots=True)
class RequestApprovedEvent(DomainEvent):
    request_id: str = ""
    requesting_hospital_id: str = ""
    supplying_hospital_id: str = ""


@dataclass(frozen=True, slots=True)
class RequestRejectedEvent(DomainEvent):
    request_id: str = ""
    requesting_hospital_id: str = ""
    supplying_hospital_id: str = ""


@dataclass(frozen=True, slots=True)
class RequestDecisionViewedEvent(DomainEvent):
    request_id: str = ""
    requesting_hospital_id: str = ""


@dataclass(frozen=True, slots=True)
class RequestDispatchedEvent(DomainEvent):
    request_id: str = ""
    supplying_hospital_id: str = ""


@dataclass(frozen=True, slots=True)
class DispatchCompletedEvent(DomainEvent):
    request_id: str = ""
    requesting_hospital_id: str = ""
    supplying_hospital_id: str = ""
    completed_on: date | None = None


@dataclass(frozen=True, slots=True)
class RequestCancelledEvent(DomainEvent):
    request_id: str = ""
    requesting_hospital_id: str = ""
    supplying_hospital_id: str = ""
    was_pending_incoming: bool = False
    was_pending_dispatch: bool = False


@dataclass(frozen=True, slots=True)
class RequestExpiredEvent(DomainEvent):
    request_id: str = ""
    requesting_hospital_id: str = ""
    supplying_hospital_id: str = ""
    was_pending_incoming: bool = False
    was_pending_dispatch: bool = False


@dataclass(frozen=True, slots=True)
class HospitalRegistrationSubmittedEvent(DomainEvent):
    registration_request_id: str = ""


@dataclass(frozen=True, slots=True)
class HospitalRegisteredEvent(DomainEvent):
    registration_request_id: str = ""


@dataclass(frozen=True, slots=True)
class HospitalRegistrationRejectedEvent(DomainEvent):
    registration_request_id: str = ""


@dataclass(frozen=True, slots=True)
class HospitalUpdateSubmittedEvent(DomainEvent):
    update_request_id: str = ""


@dataclass(frozen=True, slots=True)
class HospitalUpdateReviewedEvent(DomainEvent):
    update_request_id: str = ""
    hospital_id: str = ""
    approved: bool = False


@dataclass(frozen=True, slots=True)
class HospitalUpdateDecisionViewedEvent(DomainEvent):
    update_request_id: str = ""
    hospital_id: str = ""


@dataclass(frozen=True, slots=True)
class OffboardingSubmittedEvent(DomainEvent):
    offboarding_request_id: str = ""


@dataclass(frozen=True, slots=True)
class OffboardingReviewedEvent(DomainEvent):
    offboarding_request_id: str = ""
    approved: bool = False
