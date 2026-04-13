import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.serializers.json import DjangoJSONEncoder

from common.permissions.realtime import (
    SOCKET_TYPE_CHAT,
    filter_socket_eligible_user_ids,
    is_user_allowed_for_socket,
)

from .serializers import ChatMessageHistorySerializer, ChatReadReceiptSerializer, ChatSendMessageSerializer
from .services import (
    create_message,
    get_chat_unread_summary_for_user_id,
    get_conversation_for_user,
    mark_read,
)


class ConversationChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        self.conversation_id = self.scope["url_route"]["kwargs"].get("conversation_id")

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4401)
            return

        is_allowed = await sync_to_async(is_user_allowed_for_socket)(
            user=self.user,
            socket_type=SOCKET_TYPE_CHAT,
        )
        if not is_allowed:
            await self.close(code=4403)
            return

        try:
            self.conversation = await sync_to_async(get_conversation_for_user)(
                self.conversation_id,
                self.user,
            )
        except Exception:
            await self.close(code=4403)
            return

        self.group_name = f"chat_conversation_{self.conversation_id}"
        self.user_group_name = f"chat_user_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send_json(
                {
                    "event": "error",
                    "code": "invalid_json",
                    "message": "Invalid JSON payload.",
                }
            )
            return

        event_type = payload.get("type")
        if event_type == "message.send":
            await self._handle_send_message(payload)
            return

        if event_type == "typing.start" or event_type == "typing.stop":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "chat.event",
                    "event": event_type,
                    "payload": {
                        "conversation_id": str(self.conversation_id),
                        "user_id": str(self.user.id),
                    },
                },
            )
            return

        if event_type == "message.read":
            await self._handle_read_receipt(payload)
            return

        await self.send_json(
            {
                "event": "error",
                "code": "unsupported_event",
                "message": "Unsupported event type.",
            }
        )

    async def _handle_send_message(self, payload):
        serializer = ChatSendMessageSerializer(data=payload)
        if not serializer.is_valid():
            await self.send_json(
                {
                    "event": "error",
                    "code": "validation_error",
                    "errors": serializer.errors,
                }
            )
            return

        message = await sync_to_async(create_message)(
            conversation=self.conversation,
            sender=self.user,
            body=serializer.validated_data["body"],
        )

        broadcast_payload = await sync_to_async(self._serialize_message_payload)(message)

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat.event",
                "event": "message.created",
                "payload": broadcast_payload,
            },
        )
        await self._broadcast_unread_count_updates(source_event="message.created")

    def _serialize_message_payload(self, message):
        return ChatMessageHistorySerializer(message, context={"user": self.user}).data

    async def _handle_read_receipt(self, payload):
        serializer = ChatReadReceiptSerializer(data=payload)
        if not serializer.is_valid():
            await self.send_json(
                {
                    "event": "error",
                    "code": "validation_error",
                    "errors": serializer.errors,
                }
            )
            return

        participant = await sync_to_async(mark_read)(
            conversation=self.conversation,
            user=self.user,
            last_read_message_id=(
                serializer.validated_data.get("last_read_message_id")
                or serializer.validated_data.get("message_id")
            ),
        )

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat.event",
                "event": "message.read",
                "payload": {
                    "conversation_id": str(self.conversation_id),
                    "user_id": str(self.user.id),
                    "last_read_message_id": (
                        str(participant.last_read_message_id) if participant.last_read_message_id else None
                    ),
                    "last_read_at": participant.last_read_at.isoformat() if participant.last_read_at else None,
                },
            },
        )
        await self._broadcast_unread_count_updates(source_event="message.read")

    async def _broadcast_unread_count_updates(self, source_event: str):
        participant_ids = await sync_to_async(list)(
            self.conversation.participants.values_list("user_id", flat=True)
        )
        eligible_participant_ids = await sync_to_async(filter_socket_eligible_user_ids)(
            socket_type=SOCKET_TYPE_CHAT,
            user_ids=participant_ids,
        )
        for participant_id in eligible_participant_ids:
            summary = await sync_to_async(get_chat_unread_summary_for_user_id)(user_id=participant_id)
            summary_payload = {
                **summary,
                "conversation_id": str(self.conversation_id),
                "source_event": source_event,
            }
            await self.channel_layer.group_send(
                f"chat_user_{participant_id}",
                {
                    "type": "chat.event",
                    "event": "unread_count.updated",
                    "payload": summary_payload,
                },
            )

    async def chat_event(self, event):
        await self.send_json(
            {
                "event": event["event"],
                "data": event["payload"],
            }
        )

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload, cls=DjangoJSONEncoder))
