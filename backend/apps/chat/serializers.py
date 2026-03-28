from django.conf import settings
from rest_framework import serializers

from apps.communications.models import ConversationParticipant
from apps.communications.models import Message
from apps.communications.serializers import ConversationSerializer
from common.utils.chat_encryption import decrypt_chat_message_best_effort

from .constants import ALLOWED_ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_SIZE_BYTES, extension_for
from .models import ChatAuditEvent, DirectConversation, MessageAttachment


class MessageAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    name = serializers.ReadOnlyField(source="original_name")
    type = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    size = serializers.ReadOnlyField(source="file_size")
    media_kind = serializers.ReadOnlyField()
    processing_status = serializers.ReadOnlyField()
    processing_error = serializers.ReadOnlyField()
    duration_seconds = serializers.ReadOnlyField()
    encoded_codec = serializers.ReadOnlyField()

    class Meta:
        model = MessageAttachment
        fields = (
            "id",
            "message",
            "uploaded_by",
            "file",
            "file_url",
            "name",
            "type",
            "url",
            "size",
            "media_kind",
            "processing_status",
            "processing_error",
            "duration_seconds",
            "encoded_codec",
            "original_name",
            "content_type",
            "file_size",
            "created_at",
        )
        read_only_fields = (
            "id",
            "uploaded_by",
            "file_url",
            "name",
            "type",
            "url",
            "size",
            "media_kind",
            "processing_status",
            "processing_error",
            "duration_seconds",
            "encoded_codec",
            "original_name",
            "content_type",
            "file_size",
            "created_at",
        )

    def get_file_url(self, obj):
        if getattr(settings, "USE_MINIO_CHAT_STORAGE", False):
            return f"{settings.MINIO_PUBLIC_ENDPOINT.rstrip('/')}/{settings.MINIO_BUCKET_NAME}/{obj.file.name}"

        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url

    def get_type(self, obj):
        return obj.media_kind or "file"

    def get_url(self, obj):
        return self.get_file_url(obj)


class ChatMessageHistorySerializer(serializers.ModelSerializer):
    sender_email = serializers.ReadOnlyField(source="sender.email", default=None)
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    body = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    read_by = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = (
            "id",
            "conversation",
            "sender",
            "sender_email",
            "body",
            "is_system",
            "created_at",
            "status",
            "read_by",
            "attachments",
        )
        read_only_fields = fields

    def get_body(self, obj):
        return decrypt_chat_message_best_effort(obj.body)

    def get_status(self, obj):
        request = self.context.get("request")
        current_user = self.context.get("user")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            current_user = request.user

        participants = list(obj.conversation.participants.select_related("user"))
        if not participants:
            return "sent"

        if current_user and obj.sender_id == current_user.id:
            recipients = [p for p in participants if p.user_id != current_user.id]
            if not recipients:
                return "sent"
            if all(p.last_read_at and p.last_read_at >= obj.created_at for p in recipients):
                return "read"
            return "delivered"

        current_participant = next((p for p in participants if current_user and p.user_id == current_user.id), None)
        if current_participant and current_participant.last_read_at and current_participant.last_read_at >= obj.created_at:
            return "read"
        return "delivered"

    def get_read_by(self, obj):
        participant_ids = []
        for participant in obj.conversation.participants.all():
            if participant.last_read_at and participant.last_read_at >= obj.created_at:
                participant_ids.append(str(participant.user_id))
        return participant_ids


class ChatSendMessageSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1, max_length=5000)


class ChatReadReceiptSerializer(serializers.Serializer):
    message_id = serializers.UUIDField(required=False)


class ChatAttachmentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    body = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    media_kind = serializers.ChoiceField(choices=["image", "file", "voice", "video"], required=False)

    def validate_file(self, value):
        if value.size > MAX_ATTACHMENT_SIZE_BYTES:
            raise serializers.ValidationError("Attachment exceeds 15 MB limit.")

        ext = extension_for(value.name)
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            raise serializers.ValidationError("Unsupported attachment file type.")

        return value


class DirectConversationOpenSerializer(serializers.Serializer):
    participant_id = serializers.UUIDField()


class DirectConversationSummarySerializer(serializers.ModelSerializer):
    conversation = ConversationSerializer(read_only=True)
    other_participant_id = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = DirectConversation
        fields = (
            "id",
            "conversation",
            "other_participant_id",
            "unread_count",
            "created_at",
        )
        read_only_fields = fields

    def get_other_participant_id(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return None

        if request.user.id == obj.user_low_id:
            return str(obj.user_high_id)
        if request.user.id == obj.user_high_id:
            return str(obj.user_low_id)

        conversation_id = obj.conversation_id
        participant = (
            ConversationParticipant.objects.filter(conversation_id=conversation_id)
            .exclude(user=request.user)
            .values_list("user_id", flat=True)
            .first()
        )
        return str(participant) if participant else None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return 0

        participant = ConversationParticipant.objects.filter(
            conversation=obj.conversation,
            user=request.user,
        ).first()
        if not participant:
            return 0

        unread_queryset = Message.objects.filter(conversation=obj.conversation).exclude(sender=request.user)
        if participant.last_read_at:
            unread_queryset = unread_queryset.filter(created_at__gt=participant.last_read_at)
        return unread_queryset.count()


class ChatDeleteMessageSerializer(serializers.Serializer):
    message_id = serializers.UUIDField()
    delete_for_everyone = serializers.BooleanField(required=False, default=False)


class ChatAuditEventSerializer(serializers.ModelSerializer):
    user_email = serializers.ReadOnlyField(source="user.email", default=None)

    class Meta:
        model = ChatAuditEvent
        fields = (
            "id",
            "event_type",
            "conversation",
            "message",
            "user",
            "user_email",
            "metadata",
            "created_at",
        )
        read_only_fields = fields
