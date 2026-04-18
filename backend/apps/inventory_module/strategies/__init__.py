"""Inventory source strategy abstractions."""


class BaseInventorySourceStrategy:
    source_type = "API"

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(source_type={self.source_type})"
