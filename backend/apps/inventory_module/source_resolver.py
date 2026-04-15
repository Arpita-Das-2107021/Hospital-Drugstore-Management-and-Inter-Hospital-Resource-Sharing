"""Inventory source-type resolver and strategy mapper."""
from apps.hospitals.models import Hospital

from .strategies.api_strategy import APIInventoryStrategy
from .strategies.csv_strategy import CSVInventoryStrategy
from .strategies.dashboard_strategy import DashboardInventoryStrategy
from .strategies.hybrid_strategy import HybridInventoryStrategy


LEGACY_SUBMISSION_TO_SOURCE = {
    Hospital.DataSubmissionType.API: Hospital.InventorySourceType.API,
    Hospital.DataSubmissionType.CSV_UPLOAD: Hospital.InventorySourceType.CSV,
    Hospital.DataSubmissionType.MANUAL: Hospital.InventorySourceType.DASHBOARD,
}


class InventorySourceResolver:
    """Resolves effective inventory source strategy for a facility."""

    STRATEGY_MAP = {
        Hospital.InventorySourceType.API: APIInventoryStrategy,
        Hospital.InventorySourceType.DASHBOARD: DashboardInventoryStrategy,
        Hospital.InventorySourceType.CSV: CSVInventoryStrategy,
        Hospital.InventorySourceType.HYBRID: HybridInventoryStrategy,
    }

    @classmethod
    def get_effective_source_type(cls, facility: Hospital) -> str:
        source = str(facility.inventory_source_type or "").strip().upper()
        if source in cls.STRATEGY_MAP:
            return source

        legacy_source = LEGACY_SUBMISSION_TO_SOURCE.get(
            facility.data_submission_type,
            Hospital.InventorySourceType.API,
        )
        return str(legacy_source)

    @classmethod
    def resolve(cls, facility: Hospital):
        source = cls.get_effective_source_type(facility)
        strategy_cls = cls.STRATEGY_MAP.get(source, APIInventoryStrategy)
        return strategy_cls()
