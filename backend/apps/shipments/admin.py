"""Shipments app admin."""
from django.contrib import admin

from .models import Shipment, ShipmentTracking


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    list_display = ("origin_hospital", "destination_hospital", "status", "carrier_name", "tracking_number", "created_at")
    list_filter = ("status",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ShipmentTracking)
class ShipmentTrackingAdmin(admin.ModelAdmin):
    list_display = ("shipment", "status", "location", "recorded_at")
    readonly_fields = ("id", "recorded_at")
