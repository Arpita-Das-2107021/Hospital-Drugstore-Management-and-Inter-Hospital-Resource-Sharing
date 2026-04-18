"""Resources app admin registrations."""
from django.contrib import admin

from .models import DiscountPolicy, ResourceCatalog, ResourceInventory, ResourceShare, ResourceTransaction, ResourceType


@admin.register(ResourceType)
class ResourceTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "unit_of_measure", "created_at")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ResourceCatalog)
class ResourceCatalogAdmin(admin.ModelAdmin):
    list_display = ("name", "hospital", "resource_type", "is_shareable", "created_at")
    list_filter = ("resource_type", "is_shareable")
    search_fields = ("name", "hospital__name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ResourceInventory)
class ResourceInventoryAdmin(admin.ModelAdmin):
    list_display = ("catalog_item", "quantity_available", "quantity_reserved", "active_discount_policy", "expiry_date")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(DiscountPolicy)
class DiscountPolicyAdmin(admin.ModelAdmin):
    list_display = ("name", "discount_type", "discount_value", "applies_to_scope", "is_active", "start_at", "end_at")
    list_filter = ("discount_type", "applies_to_scope", "is_active")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ResourceShare)
class ResourceShareAdmin(admin.ModelAdmin):
    list_display = ("catalog_item", "hospital", "quantity_offered", "status", "valid_until")
    list_filter = ("status",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ResourceTransaction)
class ResourceTransactionAdmin(admin.ModelAdmin):
    list_display = ("inventory", "transaction_type", "quantity_delta", "balance_after", "created_at")
    list_filter = ("transaction_type",)
    readonly_fields = ("id", "created_at")
