"""Inventory module app configuration."""
from django.apps import AppConfig


class InventoryModuleConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.inventory_module"
    label = "inventory_module"
