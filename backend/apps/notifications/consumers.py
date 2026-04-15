import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.serializers.json import DjangoJSONEncoder

from common.permissions.realtime import SOCKET_TYPE_BROADCAST, is_user_allowed_for_socket


class BroadcastNotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4401)
            return

        is_allowed = await sync_to_async(is_user_allowed_for_socket)(
            user=self.user,
            socket_type=SOCKET_TYPE_BROADCAST,
        )
        if not is_allowed:
            await self.close(code=4403)
            return

        self.group_name = f"broadcast_user_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Broadcast channel is server-push only; client payloads are ignored.
        return

    async def broadcast_event(self, event):
        await self.send_json(
            {
                "event": event["event"],
                "data": event["payload"],
            }
        )

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload, cls=DjangoJSONEncoder))
