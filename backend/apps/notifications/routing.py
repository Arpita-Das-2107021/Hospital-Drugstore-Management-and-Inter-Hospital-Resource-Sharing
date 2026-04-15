from django.urls import path

from .consumers import BroadcastNotificationConsumer

websocket_urlpatterns = [
    path("ws/broadcasts/", BroadcastNotificationConsumer.as_asgi()),
]
