"""Communications app admin."""
from django.contrib import admin

from .models import Conversation, ConversationParticipant, Message, MessageTemplate


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("subject", "created_by", "created_at", "updated_at")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ConversationParticipant)
class ConversationParticipantAdmin(admin.ModelAdmin):
    list_display = ("conversation", "user", "joined_at")
    readonly_fields = ("id", "joined_at")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "sender", "is_system", "created_at")
    readonly_fields = ("id", "created_at")


@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "hospital", "created_by", "created_at")
    list_filter = ("hospital",)
    readonly_fields = ("id", "created_at", "updated_at")
