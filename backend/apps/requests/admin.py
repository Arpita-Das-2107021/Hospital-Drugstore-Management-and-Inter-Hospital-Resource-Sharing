"""Requests app admin."""
from django.contrib import admin

from .models import DeliveryEvent, DeliveryToken, DispatchEvent, ResourceRequest, ResourceRequestApproval


@admin.register(ResourceRequest)
class ResourceRequestAdmin(admin.ModelAdmin):
    list_display = ("requesting_hospital", "supplying_hospital", "catalog_item", "quantity_requested", "status", "priority", "created_at")
    list_filter = ("status", "priority")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ResourceRequestApproval)
class ResourceRequestApprovalAdmin(admin.ModelAdmin):
    list_display = ("request", "reviewed_by", "decision", "quantity_approved", "reviewed_at")
    readonly_fields = ("id", "reviewed_at")


@admin.register(DispatchEvent)
class DispatchEventAdmin(admin.ModelAdmin):
    list_display = ("request", "dispatched_by", "dispatched_at")
    readonly_fields = ("id", "dispatched_at")


@admin.register(DeliveryToken)
class DeliveryTokenAdmin(admin.ModelAdmin):
    list_display = ("request", "expires_at", "used_at")
    readonly_fields = ("id", "token")


@admin.register(DeliveryEvent)
class DeliveryEventAdmin(admin.ModelAdmin):
    list_display = ("request", "confirmed_by", "quantity_received", "delivered_at")
    readonly_fields = ("id", "delivered_at")
