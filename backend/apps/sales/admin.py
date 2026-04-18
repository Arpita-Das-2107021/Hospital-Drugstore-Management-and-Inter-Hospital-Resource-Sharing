"""Admin registrations for internal sales."""

from django.contrib import admin

from .models import InternalSale, RetailSale


@admin.register(InternalSale)
class InternalSaleAdmin(admin.ModelAdmin):
    list_display = (
        "facility",
        "resource_catalog",
        "event_date",
        "quantity_sold",
        "channel",
        "currency",
        "created_at",
    )
    list_filter = ("channel", "currency", "event_date")
    search_fields = (
        "facility__name",
        "facility__registration_number",
        "resource_catalog__name",
        "client_reference",
    )
    readonly_fields = ("id", "created_at", "updated_at")
    ordering = ("-event_date", "-created_at")


@admin.register(RetailSale)
class RetailSaleAdmin(admin.ModelAdmin):
    list_display = (
        "inventory",
        "batch",
        "quantity",
        "unit_selling_price_snapshot",
        "discount_amount",
        "final_total",
        "sold_at",
    )
    list_filter = ("sold_at",)
    search_fields = ("inventory__catalog_item__name", "customer_reference")
    readonly_fields = ("id",)
    ordering = ("-sold_at",)
