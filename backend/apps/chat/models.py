import uuid

from django.db import models


class DirectConversation(models.Model):
    """Canonical 1:1 chat mapping for an unordered pair of users."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.OneToOneField(
        "communications.Conversation",
        on_delete=models.CASCADE,
        related_name="direct_chat_binding",
    )
    user_low = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="direct_chats_as_low",
    )
    user_high = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="direct_chats_as_high",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_direct_conversation"
        constraints = [
            models.UniqueConstraint(fields=["user_low", "user_high"], name="chat_direct_pair_unique"),
            models.CheckConstraint(check=~models.Q(user_low=models.F("user_high")), name="chat_direct_users_distinct"),
        ]

    def __str__(self) -> str:
        return f"DirectConversation({self.user_low_id}, {self.user_high_id})"


class MessageAttachment(models.Model):
    """Attachment metadata linked to an existing communications message."""

    class MediaKind(models.TextChoices):
        IMAGE = "image", "Image"
        FILE = "file", "File"
        VOICE = "voice", "Voice"
        VIDEO = "video", "Video"

    class ProcessingStatus(models.TextChoices):
        READY = "ready", "Ready"
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        "communications.Message",
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    uploaded_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_chat_attachments",
    )
    file = models.FileField(upload_to="chat/attachments/%Y/%m/%d")
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120)
    file_size = models.PositiveBigIntegerField()
    media_kind = models.CharField(max_length=20, choices=MediaKind.choices, default=MediaKind.FILE)
    processing_status = models.CharField(max_length=20, choices=ProcessingStatus.choices, default=ProcessingStatus.READY)
    processing_error = models.TextField(blank=True, default="")
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    encoded_codec = models.CharField(max_length=50, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_message_attachment"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["message", "created_at"]),
            models.Index(fields=["media_kind", "created_at"]),
            models.Index(fields=["processing_status", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"Attachment({self.original_name}, {self.file_size})"


class ConversationVisibility(models.Model):
    """Per-user visibility state for conversations (soft delete for a user only)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        "communications.Conversation",
        on_delete=models.CASCADE,
        related_name="visibility_states",
    )
    user = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="conversation_visibility_states",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chat_conversation_visibility"
        unique_together = [("conversation", "user")]
        indexes = [
            models.Index(fields=["user", "is_deleted"]),
            models.Index(fields=["conversation", "user"]),
        ]


class MessageVisibility(models.Model):
    """Per-user visibility state for individual messages."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        "communications.Message",
        on_delete=models.CASCADE,
        related_name="visibility_states",
    )
    user = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="message_visibility_states",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chat_message_visibility"
        unique_together = [("message", "user")]
        indexes = [
            models.Index(fields=["user", "is_deleted"]),
            models.Index(fields=["message", "user"]),
            models.Index(fields=["message", "is_deleted"]),
        ]


class ChatAuditEvent(models.Model):
    """Append-only chat metadata audit log (never store message plaintext)."""

    class EventType(models.TextChoices):
        MESSAGE_SENT = "message_sent", "Message Sent"
        MESSAGE_DELETED = "message_deleted", "Message Deleted"
        CONVERSATION_CREATED = "conversation_created", "Conversation Created"
        CONVERSATION_DELETED = "conversation_deleted", "Conversation Deleted"
        MESSAGE_READ = "message_read", "Message Read"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_audit_events",
    )
    event_type = models.CharField(max_length=40, choices=EventType.choices)
    conversation = models.ForeignKey(
        "communications.Conversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_audit_events",
    )
    message = models.ForeignKey(
        "communications.Message",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_audit_events",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_audit_event"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "-created_at"]),
            models.Index(fields=["conversation", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]
