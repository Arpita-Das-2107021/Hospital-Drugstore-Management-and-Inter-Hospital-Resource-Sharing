"""Repository layer for badge counters stored in cache."""

from __future__ import annotations

from django.core.cache import cache


class BadgeCounterRepository:
    EVENT_DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60

    @staticmethod
    def _coerce_int(value) -> int:
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    def get(self, key: str) -> int:
        return self._coerce_int(cache.get(key, 0))

    def set(self, key: str, value: int, *, timeout: int | None = None) -> None:
        cache.set(key, self._coerce_int(value), timeout=timeout)

    def adjust(self, key: str, delta: int, *, timeout: int | None = None) -> int:
        if delta == 0:
            current = self.get(key)
            if timeout is not None:
                self._touch(key, timeout)
            return current

        if delta > 0:
            new_value = self._increment(key, delta, timeout=timeout)
        else:
            new_value = self._decrement(key, abs(delta), timeout=timeout)

        if new_value < 0:
            self.set(key, 0, timeout=timeout)
            return 0

        return new_value

    def mark_event_processed(self, event_id: str) -> bool:
        dedup_key = f"badge:event:{event_id}"
        return bool(cache.add(dedup_key, "1", timeout=self.EVENT_DEDUP_TTL_SECONDS))

    def _increment(self, key: str, delta: int, *, timeout: int | None = None) -> int:
        try:
            value = int(cache.incr(key, delta))
        except ValueError:
            cache.add(key, 0, timeout=timeout)
            value = int(cache.incr(key, delta))

        if timeout is not None:
            self._touch(key, timeout)
        return value

    def _decrement(self, key: str, delta: int, *, timeout: int | None = None) -> int:
        try:
            value = int(cache.decr(key, delta))
        except ValueError:
            cache.add(key, 0, timeout=timeout)
            value = int(cache.decr(key, delta))

        if timeout is not None:
            self._touch(key, timeout)
        return value

    def _touch(self, key: str, timeout: int) -> None:
        try:
            cache.touch(key, timeout=timeout)
        except Exception:  # noqa: BLE001
            cache.set(key, self.get(key), timeout=timeout)
