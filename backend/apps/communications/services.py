"""Communications service layer."""
import logging

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from common.utils.chat_encryption import encrypt_chat_message

from apps.chat.models import ChatAuditEvent

from .models import Conversation, ConversationParticipant, Message, MessageTemplate

logger = logging.getLogger("hrsp.communications")


def create_conversation(subject: str, participant_users: list, actor, resource_request=None) -> Conversation:
    with transaction.atomic():
        conversation = Conversation.objects.create(
            subject=subject,
            resource_request=resource_request,
            created_by=actor,
        )
        # Add creator + all listed participants
        all_users = set(participant_users) | {actor}
        ConversationParticipant.objects.bulk_create(
            [ConversationParticipant(conversation=conversation, user=u) for u in all_users]
        )

    logger.info("Conversation %s created by %s", conversation.id, actor.id)
    return conversation


def send_message(conversation: Conversation, body: str, actor) -> Message:
    # Verify actor is a participant
    if not conversation.participants.filter(user=actor).exists():
        raise PermissionDenied("You are not a participant in this conversation.")

    with transaction.atomic():
        message = Message.objects.create(
            conversation=conversation,
            sender=actor,
            body=encrypt_chat_message(body),
        )
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=["updated_at"])

        ChatAuditEvent.objects.create(
            user=actor,
            event_type=ChatAuditEvent.EventType.MESSAGE_SENT,
            conversation=conversation,
            message=message,
            metadata={"sender_id": str(actor.id), "channel": "rest"},
        )

    return message


def mark_conversation_read(conversation: Conversation, user) -> ConversationParticipant:
    participant = ConversationParticipant.objects.filter(conversation=conversation, user=user).first()
    if not participant:
        raise PermissionDenied("Not a participant.")
    participant.last_read_at = timezone.now()
    participant.save(update_fields=["last_read_at"])
    ChatAuditEvent.objects.create(
        user=user,
        event_type=ChatAuditEvent.EventType.MESSAGE_READ,
        conversation=conversation,
        metadata={"source": "communications.rest"},
    )
    return participant
