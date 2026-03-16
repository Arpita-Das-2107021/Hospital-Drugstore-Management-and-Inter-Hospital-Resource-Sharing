"""Reusable cross-field validators."""
from django.utils import timezone


def validate_future_datetime(value, field_name: str = "date"):
    """Raise ValueError if value is not in the future."""
    if value and value <= timezone.now():
        raise ValueError(f"{field_name} must be in the future.")


def validate_positive_integer(value, field_name: str = "quantity"):
    """Raise ValueError if value is not a positive integer."""
    if value is not None and value <= 0:
        raise ValueError(f"{field_name} must be a positive integer.")
