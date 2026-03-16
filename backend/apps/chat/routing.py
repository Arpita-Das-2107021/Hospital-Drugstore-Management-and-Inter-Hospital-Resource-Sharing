from django.urls import path

from .consumers import ConversationChatConsumer

websocket_urlpatterns = [
    path("ws/chat/<uuid:conversation_id>/", ConversationChatConsumer.as_asgi()),
]
