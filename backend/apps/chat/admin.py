from django.contrib import admin

from .models import ChatAuditEvent, ConversationVisibility, DirectConversation, MessageAttachment, MessageVisibility


@admin.register(DirectConversation)
class DirectConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "user_low", "user_high", "created_at")
    search_fields = ("conversation__id", "user_low__email", "user_high__email")
    list_filter = ("created_at",)


@admin.register(ConversationVisibility)
class ConversationVisibilityAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "user", "is_deleted", "deleted_at", "updated_at")
    search_fields = ("conversation__id", "user__email")
    list_filter = ("is_deleted", "updated_at")


@admin.register(MessageVisibility)
class MessageVisibilityAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "user", "is_deleted", "deleted_at", "updated_at")
    search_fields = ("message__id", "user__email")
    list_filter = ("is_deleted", "updated_at")


@admin.register(ChatAuditEvent)
class ChatAuditEventAdmin(admin.ModelAdmin):
    list_display = ("id", "event_type", "user", "conversation", "message", "created_at")
    search_fields = ("user__email", "conversation__id", "message__id")
    list_filter = ("event_type", "created_at")
    readonly_fields = tuple(f.name for f in ChatAuditEvent._meta.fields)


@admin.register(MessageAttachment)
class MessageAttachmentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "message",
        "original_name",
        "media_kind",
        "processing_status",
        "content_type",
        "file_size",
        "created_at",
    )
    search_fields = ("original_name", "content_type", "message__id")
    list_filter = ("media_kind", "processing_status", "content_type", "created_at")
