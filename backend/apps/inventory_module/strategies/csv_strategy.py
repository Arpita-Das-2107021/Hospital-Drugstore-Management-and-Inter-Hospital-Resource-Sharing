"""CSV-backed inventory strategy placeholder."""
from . import BaseInventorySourceStrategy


class CSVInventoryStrategy(BaseInventorySourceStrategy):
    source_type = "CSV"
