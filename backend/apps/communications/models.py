"""Communications domain models: Conversation, ConversationParticipant, Message, MessageTemplate."""
import uuid

from django.db import models


class Conversation(models.Model):
    """
    A thread between two or more users, optionally linked to a resource request.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject = models.CharField(max_length=300, blank=True)
    resource_request = models.ForeignKey(
        "resource_requests.ResourceRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="conversations_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communications_conversation"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"Conversation({self.id}, {self.subject[:30]})"


class ConversationParticipant(models.Model):
    """Tracks who is in a conversation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="participants",
    )
    user = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="conversation_memberships",
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_message = models.ForeignKey(
        "communications.Message",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="read_by_participants",
    )
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "communications_participant"
        unique_together = [("conversation", "user")]

    def __str__(self) -> str:
        return f"Participant({self.user} in {self.conversation})"


class Message(models.Model):
    """A single message within a conversation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="messages_sent",
    )
    body = models.TextField()
    is_system = models.BooleanField(default=False, help_text="Auto-generated system message")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communications_message"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Message({self.sender}, len={len(self.body)})"


class MessageTemplate(models.Model):
    """
    Reusable message templates for common communication patterns.
    Scoped to a hospital or system-wide (hospital=None).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="message_templates",
    )
    name = models.CharField(max_length=200)
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField()
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="message_templates_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communications_template"

    def __str__(self) -> str:
        return f"Template({self.name})"
