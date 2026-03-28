from typing import Optional
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.authentication.models import UserAccount
from apps.communications.models import Conversation, ConversationParticipant, Message
from common.utils.chat_encryption import decrypt_chat_message_best_effort, encrypt_chat_message

from .constants import DEFAULT_VIDEO_TRANSCODE_THRESHOLD_BYTES, infer_attachment_media_kind
from .object_storage import ensure_chat_bucket_exists
from .models import ChatAuditEvent, ConversationVisibility, DirectConversation, MessageAttachment, MessageVisibility
from .tasks import transcode_chat_video_attachment_task


def _ordered_user_pair(user_a: UserAccount, user_b: UserAccount) -> tuple[UserAccount, UserAccount]:
    if UUID(str(user_a.id)).int <= UUID(str(user_b.id)).int:
        return user_a, user_b
    return user_b, user_a


def _ensure_chat_eligible_user(user: UserAccount) -> None:
    if not user.is_active:
        raise PermissionDenied("User account is inactive.")
    if user.staff_id is None:
        raise PermissionDenied("Only staff users can participate in direct chat.")


def is_direct_conversation_for_user(*, conversation: Conversation, user) -> bool:
    if not ConversationParticipant.objects.filter(conversation=conversation, user=user).exists():
        return False
    direct_binding = DirectConversation.objects.filter(conversation=conversation).first()
    if direct_binding:
        return user.id in {direct_binding.user_low_id, direct_binding.user_high_id}
    return conversation.participants.count() == 2


def is_conversation_hidden_for_user(*, conversation: Conversation, user) -> bool:
    return ConversationVisibility.objects.filter(
        conversation=conversation,
        user=user,
        is_deleted=True,
    ).exists()


def visible_messages_queryset(*, conversation: Conversation, user):
    deleted_ids = MessageVisibility.objects.filter(
        user=user,
        is_deleted=True,
        message__conversation=conversation,
    ).values_list("message_id", flat=True)
    return conversation.messages.exclude(id__in=deleted_ids)


def list_direct_conversations_for_user(*, user):
    hidden_conversations = ConversationVisibility.objects.filter(user=user, is_deleted=True).values_list(
        "conversation_id", flat=True
    )
    return DirectConversation.objects.filter(
        Q(user_low=user) | Q(user_high=user)
    ).exclude(conversation_id__in=hidden_conversations).select_related("conversation", "conversation__created_by")


def write_chat_audit_event(*, user, event_type: str, conversation=None, message=None, metadata: Optional[dict] = None) -> None:
    ChatAuditEvent.objects.create(
        user=user,
        event_type=event_type,
        conversation=conversation,
        message=message,
        metadata=metadata or {},
    )


def open_direct_conversation(*, actor: UserAccount, participant_id) -> tuple[DirectConversation, bool]:
    participant = UserAccount.objects.filter(id=participant_id).first()
    if not participant:
        raise NotFound("Target participant not found.")
    if participant.id == actor.id:
        raise PermissionDenied("You cannot open a direct conversation with yourself.")

    _ensure_chat_eligible_user(actor)
    _ensure_chat_eligible_user(participant)

    user_low, user_high = _ordered_user_pair(actor, participant)

    existing = DirectConversation.objects.filter(user_low=user_low, user_high=user_high).select_related("conversation").first()
    if existing:
        ConversationVisibility.objects.update_or_create(
            conversation=existing.conversation,
            user=actor,
            defaults={"is_deleted": False, "deleted_at": None},
        )
        return existing, False

    with transaction.atomic():
        existing = (
            DirectConversation.objects.select_for_update()
            .filter(user_low=user_low, user_high=user_high)
            .select_related("conversation")
            .first()
        )
        if existing:
            ConversationVisibility.objects.update_or_create(
                conversation=existing.conversation,
                user=actor,
                defaults={"is_deleted": False, "deleted_at": None},
            )
            return existing, False

        conversation = Conversation.objects.create(
            subject="",
            created_by=actor,
        )
        ConversationParticipant.objects.bulk_create(
            [
                ConversationParticipant(conversation=conversation, user=user_low),
                ConversationParticipant(conversation=conversation, user=user_high),
            ]
        )
        direct = DirectConversation.objects.create(
            conversation=conversation,
            user_low=user_low,
            user_high=user_high,
        )

        write_chat_audit_event(
            user=actor,
            event_type=ChatAuditEvent.EventType.CONVERSATION_CREATED,
            conversation=conversation,
            metadata={"participant_ids": [str(user_low.id), str(user_high.id)]},
        )

    return direct, True


def get_conversation_for_user(conversation_id, user) -> Conversation:
    conversation = Conversation.objects.filter(id=conversation_id).first()
    if not conversation:
        raise NotFound("Conversation not found.")

    if not ConversationParticipant.objects.filter(conversation=conversation, user=user).exists():
        raise PermissionDenied("You are not a participant in this conversation.")

    if is_conversation_hidden_for_user(conversation=conversation, user=user):
        raise NotFound("Conversation not found.")

    if not is_direct_conversation_for_user(conversation=conversation, user=user):
        raise PermissionDenied("This endpoint supports direct staff chat conversations only.")

    return conversation


def create_message(*, conversation: Conversation, sender, body: str) -> Message:
    with transaction.atomic():
        encrypted_body = encrypt_chat_message(body)
        message = Message.objects.create(
            conversation=conversation,
            sender=sender,
            body=encrypted_body,
        )
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=["updated_at"])

        ConversationVisibility.objects.update_or_create(
            conversation=conversation,
            user=sender,
            defaults={"is_deleted": False, "deleted_at": None},
        )

        write_chat_audit_event(
            user=sender,
            event_type=ChatAuditEvent.EventType.MESSAGE_SENT,
            conversation=conversation,
            message=message,
            metadata={"sender_id": str(sender.id), "is_system": message.is_system},
        )

    return message


def mark_read(*, conversation: Conversation, user, message_id: Optional[str] = None):
    participant = ConversationParticipant.objects.filter(conversation=conversation, user=user).first()
    if not participant:
        raise PermissionDenied("You are not a participant in this conversation.")

    if message_id:
        message = Message.objects.filter(id=message_id, conversation=conversation).first()
        if not message:
            raise NotFound("Message not found in conversation.")
        participant.last_read_at = message.created_at
    else:
        participant.last_read_at = timezone.now()

    participant.save(update_fields=["last_read_at"])

    write_chat_audit_event(
        user=user,
        event_type=ChatAuditEvent.EventType.MESSAGE_READ,
        conversation=conversation,
        message=message if message_id else None,
        metadata={"message_id": str(message.id) if message_id else None},
    )
    return participant


def get_unread_count(*, conversation: Conversation, user) -> int:
    participant = ConversationParticipant.objects.filter(conversation=conversation, user=user).first()
    if not participant:
        raise PermissionDenied("You are not a participant in this conversation.")

    queryset = visible_messages_queryset(conversation=conversation, user=user).exclude(sender=user)
    if participant.last_read_at:
        queryset = queryset.filter(created_at__gt=participant.last_read_at)
    return queryset.count()


def create_attachment(
    *,
    message: Message,
    file,
    uploaded_by,
    content_type: str,
    original_name: str,
    media_kind_hint: Optional[str] = None,
) -> MessageAttachment:
    ensure_chat_bucket_exists()

    media_kind = infer_attachment_media_kind(
        content_type=content_type,
        filename=original_name,
        kind_hint=media_kind_hint,
    )
    attachment = MessageAttachment.objects.create(
        message=message,
        uploaded_by=uploaded_by,
        file=file,
        content_type=content_type,
        original_name=original_name,
        file_size=file.size,
        media_kind=media_kind,
        processing_status=MessageAttachment.ProcessingStatus.READY,
    )

    video_threshold = getattr(settings, "CHAT_VIDEO_TRANSCODE_THRESHOLD_BYTES", DEFAULT_VIDEO_TRANSCODE_THRESHOLD_BYTES)
    transcode_enabled = bool(getattr(settings, "CHAT_VIDEO_TRANSCODE_ENABLED", True))

    if media_kind == MessageAttachment.MediaKind.VIDEO and transcode_enabled and attachment.file_size >= video_threshold:
        attachment.processing_status = MessageAttachment.ProcessingStatus.PENDING
        attachment.save(update_fields=["processing_status"])
        transcode_chat_video_attachment_task.delay(str(attachment.id))

    return attachment


def _delete_attachment_file(attachment: MessageAttachment) -> None:
    if attachment.file:
        attachment.file.delete(save=False)
    attachment.delete()


def _cleanup_message_attachments_if_globally_deleted(*, message: Message) -> None:
    participant_ids = set(message.conversation.participants.values_list("user_id", flat=True))
    if not participant_ids:
        return

    deleted_for_ids = set(
        MessageVisibility.objects.filter(
            message=message,
            is_deleted=True,
            user_id__in=participant_ids,
        ).values_list("user_id", flat=True)
    )
    if participant_ids != deleted_for_ids:
        return

    for attachment in list(message.attachments.all()):
        _delete_attachment_file(attachment)


def delete_message_for_user(*, conversation: Conversation, message_id, user, delete_for_everyone: bool = False) -> Message:
    if not ConversationParticipant.objects.filter(conversation=conversation, user=user).exists():
        raise PermissionDenied("You are not a participant in this conversation.")

    message = Message.objects.filter(id=message_id, conversation=conversation).first()
    if not message:
        raise NotFound("Message not found in conversation.")

    if delete_for_everyone:
        if message.sender_id != user.id:
            raise PermissionDenied("Only the sender can delete this message for everyone.")

        participant_ids = conversation.participants.values_list("user_id", flat=True)
        now = timezone.now()
        for participant_id in participant_ids:
            MessageVisibility.objects.update_or_create(
                message=message,
                user_id=participant_id,
                defaults={"is_deleted": True, "deleted_at": now},
            )

        for attachment in list(message.attachments.all()):
            _delete_attachment_file(attachment)

        write_chat_audit_event(
            user=user,
            event_type=ChatAuditEvent.EventType.MESSAGE_DELETED,
            conversation=conversation,
            message=message,
            metadata={"scope": "global"},
        )
        return message

    MessageVisibility.objects.update_or_create(
        message=message,
        user=user,
        defaults={"is_deleted": True, "deleted_at": timezone.now()},
    )

    _cleanup_message_attachments_if_globally_deleted(message=message)

    write_chat_audit_event(
        user=user,
        event_type=ChatAuditEvent.EventType.MESSAGE_DELETED,
        conversation=conversation,
        message=message,
        metadata={"scope": "message"},
    )
    return message


def delete_conversation_for_user(*, conversation: Conversation, user) -> None:
    if not ConversationParticipant.objects.filter(conversation=conversation, user=user).exists():
        raise PermissionDenied("You are not a participant in this conversation.")

    now = timezone.now()
    ConversationVisibility.objects.update_or_create(
        conversation=conversation,
        user=user,
        defaults={"is_deleted": True, "deleted_at": now},
    )

    messages = list(conversation.messages.values_list("id", flat=True))
    for message_id in messages:
        MessageVisibility.objects.update_or_create(
            message_id=message_id,
            user=user,
            defaults={"is_deleted": True, "deleted_at": now},
        )

    write_chat_audit_event(
        user=user,
        event_type=ChatAuditEvent.EventType.CONVERSATION_DELETED,
        conversation=conversation,
        metadata={"deleted_message_count": len(messages)},
    )


def serialize_message_for_export(message: Message) -> dict:
    return {
        "id": str(message.id),
        "conversation_id": str(message.conversation_id),
        "sender_id": str(message.sender_id) if message.sender_id else None,
        "sender_email": message.sender.email if message.sender_id else None,
        "body": decrypt_chat_message_best_effort(message.body),
        "created_at": message.created_at.isoformat(),
        "is_system": message.is_system,
    }
