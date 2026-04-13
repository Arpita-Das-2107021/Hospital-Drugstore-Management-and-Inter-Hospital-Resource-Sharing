from typing import Optional
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.db.models import Count, DateTimeField, F, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
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


def _participant_read_cutoff(participant: ConversationParticipant):
    if participant.last_read_message_id:
        if "last_read_message" in participant.__dict__:
            last_read_message = participant.__dict__.get("last_read_message")
            if last_read_message is not None and getattr(last_read_message, "created_at", None):
                return last_read_message.created_at

        last_read_message_created_at = Message.objects.filter(id=participant.last_read_message_id).values_list(
            "created_at", flat=True
        ).first()
        if last_read_message_created_at:
            return last_read_message_created_at

    return participant.last_read_at


def mark_read(
    *,
    conversation: Conversation,
    user,
    last_read_message_id: Optional[str] = None,
    message_id: Optional[str] = None,
):
    requested_message_id = last_read_message_id or message_id

    with transaction.atomic():
        participant = (
            ConversationParticipant.objects.select_for_update()
            .filter(conversation=conversation, user=user)
            .first()
        )
        if not participant:
            raise PermissionDenied("You are not a participant in this conversation.")

        target_message = None
        if requested_message_id:
            target_message = visible_messages_queryset(conversation=conversation, user=user).filter(id=requested_message_id).first()
            if not target_message:
                raise NotFound("Message not found in conversation.")
        else:
            target_message = (
                visible_messages_queryset(conversation=conversation, user=user)
                .order_by("-created_at", "-id")
                .first()
            )

        current_cutoff = _participant_read_cutoff(participant)
        updated = False

        if target_message is not None:
            should_advance = current_cutoff is None or target_message.created_at > current_cutoff
            should_set_pointer = (
                participant.last_read_message_id is None
                and current_cutoff is not None
                and target_message.created_at == current_cutoff
            )
            if should_advance or should_set_pointer:
                participant.last_read_message = target_message
                participant.last_read_at = target_message.created_at
                participant.save(update_fields=["last_read_message", "last_read_at"])
                updated = True
        elif participant.last_read_message_id is None and participant.last_read_at is None:
            participant.last_read_at = timezone.now()
            participant.save(update_fields=["last_read_at"])
            updated = True

    resolved_message_id = None
    if participant.last_read_message_id:
        resolved_message_id = str(participant.last_read_message_id)

    write_chat_audit_event(
        user=user,
        event_type=ChatAuditEvent.EventType.MESSAGE_READ,
        conversation=conversation,
        message=target_message,
        metadata={
            "requested_last_read_message_id": str(requested_message_id) if requested_message_id else None,
            "resolved_last_read_message_id": resolved_message_id,
            "updated": updated,
        },
    )
    return participant


def get_unread_count(*, conversation: Conversation, user) -> int:
    participant = (
        ConversationParticipant.objects.select_related("last_read_message")
        .filter(conversation=conversation, user=user)
        .first()
    )
    if not participant:
        raise PermissionDenied("You are not a participant in this conversation.")

    queryset = visible_messages_queryset(conversation=conversation, user=user).exclude(sender=user)
    participant_last_read_at = _participant_read_cutoff(participant)
    if participant_last_read_at:
        queryset = queryset.filter(created_at__gt=participant_last_read_at)
    return queryset.count()


def get_unread_counts_for_conversations(*, user, conversation_ids) -> dict[str, int]:
    unique_ids = list({str(conversation_id) for conversation_id in conversation_ids if conversation_id})
    if not unique_ids:
        return {}

    participant_last_read_message_subquery = ConversationParticipant.objects.filter(
        conversation_id=OuterRef("conversation_id"),
        user=user,
    ).values("last_read_message__created_at")[:1]

    participant_last_read_at_subquery = ConversationParticipant.objects.filter(
        conversation_id=OuterRef("conversation_id"),
        user=user,
    ).values("last_read_at")[:1]

    unread_queryset = (
        Message.objects.filter(
            conversation_id__in=unique_ids,
        )
        .exclude(sender=user)
        .exclude(
            visibility_states__user=user,
            visibility_states__is_deleted=True,
        )
        .annotate(
            participant_last_read_message_at=Subquery(
                participant_last_read_message_subquery,
                output_field=DateTimeField(),
            ),
            participant_last_read_at=Subquery(
                participant_last_read_at_subquery,
                output_field=DateTimeField(),
            ),
            participant_last_read_effective=Coalesce(
                "participant_last_read_message_at",
                "participant_last_read_at",
            ),
        )
        .filter(
            Q(participant_last_read_effective__isnull=True)
            | Q(created_at__gt=F("participant_last_read_effective"))
        )
    )

    counts = unread_queryset.values("conversation_id").annotate(unread_count=Count("id"))
    return {str(row["conversation_id"]): int(row["unread_count"]) for row in counts}


def get_chat_unread_summary(*, user) -> dict:
    hidden_conversation_ids = ConversationVisibility.objects.filter(
        user=user,
        is_deleted=True,
    ).values_list("conversation_id", flat=True)

    participant_conversation_ids = list(
        ConversationParticipant.objects.filter(user=user)
        .exclude(conversation_id__in=hidden_conversation_ids)
        .values_list("conversation_id", flat=True)
    )

    unread_count_map = get_unread_counts_for_conversations(
        user=user,
        conversation_ids=participant_conversation_ids,
    )
    direct_conversation_ids = {
        str(conversation_id)
        for conversation_id in DirectConversation.objects.filter(
            conversation_id__in=participant_conversation_ids
        ).values_list("conversation_id", flat=True)
    }

    total_unread_messages = sum(unread_count_map.values())
    direct_unread_messages = sum(
        unread_count
        for conversation_id, unread_count in unread_count_map.items()
        if conversation_id in direct_conversation_ids
    )
    group_unread_messages = total_unread_messages - direct_unread_messages

    total_unread = len(unread_count_map)
    direct_unread = sum(
        1
        for conversation_id, unread_count in unread_count_map.items()
        if conversation_id in direct_conversation_ids and unread_count > 0
    )
    group_unread = total_unread - direct_unread

    conversation_unread = [
        {
            "conversation_id": conversation_id,
            "conversation_type": "direct" if conversation_id in direct_conversation_ids else "group",
            "unread_count": unread_count,
        }
        for conversation_id, unread_count in sorted(
            unread_count_map.items(),
            key=lambda item: item[1],
            reverse=True,
        )
    ]

    return {
        "total_unread": total_unread,
        "direct_unread": direct_unread,
        "group_unread": group_unread,
        "total_unread_messages": total_unread_messages,
        "direct_unread_messages": direct_unread_messages,
        "group_unread_messages": group_unread_messages,
        "conversation_unread": conversation_unread,
    }


def get_chat_unread_summary_for_user_id(*, user_id) -> dict:
    user = UserAccount.objects.filter(id=user_id).first()
    if not user:
        return {
            "total_unread": 0,
            "direct_unread": 0,
            "group_unread": 0,
            "total_unread_messages": 0,
            "direct_unread_messages": 0,
            "group_unread_messages": 0,
            "conversation_unread": [],
        }
    return get_chat_unread_summary(user=user)


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
