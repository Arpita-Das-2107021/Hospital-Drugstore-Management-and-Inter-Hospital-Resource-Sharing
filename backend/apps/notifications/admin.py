"""Notifications app admin."""
from django.contrib import admin

from .models import BroadcastMessage, BroadcastRecipient, EmergencyBroadcastResponse, Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "notification_type", "is_read", "created_at")
    list_filter = ("notification_type", "is_read")
    readonly_fields = ("id", "created_at")


@admin.register(BroadcastMessage)
class BroadcastMessageAdmin(admin.ModelAdmin):
    list_display = ("title", "scope", "priority", "sent_by", "sent_at", "created_at")
    list_filter = ("scope", "priority")
    readonly_fields = ("id", "created_at")


@admin.register(BroadcastRecipient)
class BroadcastRecipientAdmin(admin.ModelAdmin):
    list_display = ("broadcast", "hospital", "is_read", "read_at", "created_at")
    list_filter = ("is_read",)
    search_fields = ("broadcast__title", "hospital__name")
    readonly_fields = ("id", "created_at", "read_at")


@admin.register(EmergencyBroadcastResponse)
class EmergencyBroadcastResponseAdmin(admin.ModelAdmin):
    list_display = ("broadcast", "hospital", "can_provide", "quantity_available", "responded_at")
    readonly_fields = ("id", "responded_at")
