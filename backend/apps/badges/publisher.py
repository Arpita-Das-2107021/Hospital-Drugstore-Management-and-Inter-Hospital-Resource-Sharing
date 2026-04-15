"""In-process domain event publisher for badge counter updates."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from typing import TypeVar

from .events import DomainEvent

TEvent = TypeVar("TEvent", bound=DomainEvent)


class DomainEventPublisher:
    def __init__(self) -> None:
        self._subscribers: dict[type[DomainEvent], list[Callable[[DomainEvent], None]]] = defaultdict(list)

    def subscribe(self, event_type: type[TEvent], handler: Callable[[TEvent], None]) -> None:
        handlers = self._subscribers[event_type]
        if handler not in handlers:
            handlers.append(handler)

    def publish(self, event: DomainEvent) -> None:
        for event_type, handlers in self._subscribers.items():
            if not isinstance(event, event_type):
                continue
            for handler in handlers:
                handler(event)


_publisher = DomainEventPublisher()
_handlers_registered = False


def _ensure_handlers_registered() -> None:
    global _handlers_registered
    if _handlers_registered:
        return

    from .handlers import register_badge_handlers

    register_badge_handlers(_publisher)
    _handlers_registered = True


def publish_badge_event(event: DomainEvent) -> None:
    _ensure_handlers_registered()
    _publisher.publish(event)
