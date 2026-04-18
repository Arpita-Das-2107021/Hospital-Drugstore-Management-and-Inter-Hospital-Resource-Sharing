"""API-backed inventory strategy placeholder."""
from . import BaseInventorySourceStrategy


class APIInventoryStrategy(BaseInventorySourceStrategy):
    source_type = "API"
