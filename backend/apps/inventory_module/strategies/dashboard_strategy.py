"""Dashboard-backed inventory strategy placeholder."""
from . import BaseInventorySourceStrategy


class DashboardInventoryStrategy(BaseInventorySourceStrategy):
    source_type = "DASHBOARD"
