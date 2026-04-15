"""Chat URLs for inventory CSV AI assistant."""
from django.urls import path

from .views import (
    InventoryCSVChatAPIView,
    InventoryCSVChatSessionCreateAPIView,
    InventoryCSVChatSessionMessagesAPIView,
)

urlpatterns = [
    path("chat", InventoryCSVChatAPIView.as_view(), name="inventory-csv-chat"),
    path("sessions/", InventoryCSVChatSessionCreateAPIView.as_view(), name="inventory-csv-chat-session-create"),
    path(
        "sessions/<uuid:session_id>/messages/",
        InventoryCSVChatSessionMessagesAPIView.as_view(),
        name="inventory-csv-chat-session-messages",
    ),
]
