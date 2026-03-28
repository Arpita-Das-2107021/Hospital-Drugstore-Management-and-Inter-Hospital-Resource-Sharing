"""Communications app serializers."""
from rest_framework import serializers

from common.utils.chat_encryption import decrypt_chat_message_best_effort

from .models import Conversation, ConversationParticipant, Message, MessageTemplate


class MessageSerializer(serializers.ModelSerializer):
    sender_email = serializers.ReadOnlyField(source="sender.email", default=None)
    body = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    read_by = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "conversation", "sender", "sender_email", "body", "is_system", "created_at", "status", "read_by")
        read_only_fields = ("id", "sender", "sender_email", "is_system", "created_at")

    def get_body(self, obj):
        return decrypt_chat_message_best_effort(obj.body)

    def get_status(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return "sent"

        participants = list(obj.conversation.participants.select_related("user"))
        if obj.sender_id == request.user.id:
            recipients = [p for p in participants if p.user_id != request.user.id]
            if not recipients:
                return "sent"
            if all(p.last_read_at and p.last_read_at >= obj.created_at for p in recipients):
                return "read"
            return "delivered"

        current_participant = next((p for p in participants if p.user_id == request.user.id), None)
        if current_participant and current_participant.last_read_at and current_participant.last_read_at >= obj.created_at:
            return "read"
        return "delivered"

    def get_read_by(self, obj):
        return [
            str(participant.user_id)
            for participant in obj.conversation.participants.all()
            if participant.last_read_at and participant.last_read_at >= obj.created_at
        ]


class SendMessageSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1)


class ConversationParticipantSerializer(serializers.ModelSerializer):
    user_email = serializers.ReadOnlyField(source="user.email")

    class Meta:
        model = ConversationParticipant
        fields = ("id", "conversation", "user", "user_email", "joined_at", "last_read_at")
        read_only_fields = ("id", "user_email", "joined_at")


class ConversationParticipantManageSerializer(serializers.Serializer):
    participant_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)


class ConversationSerializer(serializers.ModelSerializer):
    participants = ConversationParticipantSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ("id", "subject", "resource_request", "participants", "last_message", "created_by", "created_at", "updated_at")
        read_only_fields = ("id", "participants", "last_message", "created_by", "created_at", "updated_at")

    def get_last_message(self, obj):
        msg = obj.messages.last()
        if msg:
            plaintext = decrypt_chat_message_best_effort(msg.body)
            attachments = list(msg.attachments.all()) if hasattr(msg, "attachments") else []
            preview_body = plaintext[:100]
            if not preview_body and attachments:
                preview_body = "Attachment"

            return {
                "body": preview_body,
                "sender": msg.sender.email if msg.sender else None,
                "created_at": msg.created_at,
                "has_attachments": bool(attachments),
                "attachment_types": [attachment.media_kind for attachment in attachments],
            }
        return None


class MessageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageTemplate
        fields = ("id", "hospital", "name", "subject", "body", "created_by", "created_at", "updated_at")
        read_only_fields = ("id", "created_by", "created_at", "updated_at")
