"""Ports/interfaces for decoupled inventory operations."""
from abc import ABC, abstractmethod
from typing import Any


class InventoryReadPort(ABC):
    @abstractmethod
    def get_available_inventory(self, facility_id, item_ref, include_reserved: bool = False) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_item_snapshot(self, facility_id, item_ref) -> dict[str, Any] | None:
        raise NotImplementedError


class InventoryReservationPort(ABC):
    @abstractmethod
    def reserve_stock(
        self,
        request_id,
        facility_id,
        item_ref,
        quantity: int,
        idempotency_key: str = "",
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def release_stock(self, request_id, facility_id, item_ref, quantity: int, reason: str = "") -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def confirm_transfer(
        self,
        request_id,
        source_facility_id,
        target_facility_id,
        item_ref,
        quantity: int,
        actor=None,
    ) -> dict[str, Any]:
        raise NotImplementedError


class InventoryMutationPort(ABC):
    @abstractmethod
    def apply_inventory_update(
        self,
        facility_id,
        source: str,
        operations: list[dict[str, Any]],
        mode: str,
        metadata: dict[str, Any] | None = None,
        actor=None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def quick_update(self, facility_id, name: str, quantity: int, price=None, actor=None) -> dict[str, Any]:
        raise NotImplementedError
