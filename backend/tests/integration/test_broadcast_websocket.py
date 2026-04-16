import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.db import connections
from django.test.utils import override_settings
from rest_framework_simplejwt.tokens import AccessToken

from apps.notifications.models import BroadcastMessage, BroadcastRecipient
from apps.notifications.services import deliver_broadcast, get_unread_broadcast_count, mark_broadcast_read
from config.asgi import application


@pytest.fixture(autouse=True)
async def close_connections_after_async_test():
    yield
    await database_sync_to_async(connections.close_all)()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_broadcast_websocket_rejects_unauthenticated():
    communicator = WebsocketCommunicator(application, "/ws/broadcasts/")

    connected, _ = await communicator.connect()

    assert connected is False
    await communicator.wait()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_broadcast_websocket_allows_super_admin(super_admin_user):
    token = str(AccessToken.for_user(super_admin_user))
    communicator = WebsocketCommunicator(application, f"/ws/broadcasts/?token={token}")

    connected, _ = await communicator.connect()

    assert connected is True
    await communicator.disconnect()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_broadcast_websocket_rejects_ml_engineer(ml_engineer_user):
    token = str(AccessToken.for_user(ml_engineer_user))
    communicator = WebsocketCommunicator(application, f"/ws/broadcasts/?token={token}")

    connected, _ = await communicator.connect()

    assert connected is False
    await communicator.wait()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_broadcast_delivery_does_not_push_ws_events(
    hospital_admin_user,
    super_admin_user,
    hospital,
):
    broadcast = await database_sync_to_async(BroadcastMessage.objects.create)(
        title="Critical Broadcast",
        message="Immediate support needed",
        scope=BroadcastMessage.Scope.ALL,
        priority=BroadcastMessage.Priority.URGENT,
        allow_response=True,
        sent_by=super_admin_user,
    )
    await database_sync_to_async(BroadcastRecipient.objects.create)(
        broadcast=broadcast,
        hospital=hospital,
        is_read=False,
    )

    token = str(AccessToken.for_user(hospital_admin_user))
    communicator = WebsocketCommunicator(application, f"/ws/broadcasts/?token={token}")
    connected, _ = await communicator.connect()
    assert connected

    await database_sync_to_async(deliver_broadcast)(broadcast)
    assert await communicator.receive_nothing(timeout=0.25)

    unread_count = await database_sync_to_async(get_unread_broadcast_count)(hospital_admin_user)
    assert unread_count >= 1

    await communicator.disconnect()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_sender_and_recipient_do_not_receive_ws_push_for_broadcast_updates(
    hospital_admin_user,
    hospital_b_admin_user,
    hospital,
    hospital_b,
):
    broadcast = await database_sync_to_async(BroadcastMessage.objects.create)(
        title="Sender initiated broadcast",
        message="Sender should not get unread badge updates",
        scope=BroadcastMessage.Scope.ALL,
        priority=BroadcastMessage.Priority.NORMAL,
        allow_response=True,
        sent_by=hospital_admin_user,
    )
    await database_sync_to_async(BroadcastRecipient.objects.create)(
        broadcast=broadcast,
        hospital=hospital,
        is_read=False,
    )
    await database_sync_to_async(BroadcastRecipient.objects.create)(
        broadcast=broadcast,
        hospital=hospital_b,
        is_read=False,
    )

    sender_token = str(AccessToken.for_user(hospital_admin_user))
    sender_communicator = WebsocketCommunicator(application, f"/ws/broadcasts/?token={sender_token}")
    sender_connected, _ = await sender_communicator.connect()
    assert sender_connected

    recipient_token = str(AccessToken.for_user(hospital_b_admin_user))
    recipient_communicator = WebsocketCommunicator(application, f"/ws/broadcasts/?token={recipient_token}")
    recipient_connected, _ = await recipient_communicator.connect()
    assert recipient_connected

    try:
        await database_sync_to_async(deliver_broadcast)(broadcast)
        assert await sender_communicator.receive_nothing(timeout=0.25)
        assert await recipient_communicator.receive_nothing(timeout=0.25)

        sender_unread = await database_sync_to_async(get_unread_broadcast_count)(hospital_admin_user)
        recipient_unread = await database_sync_to_async(get_unread_broadcast_count)(hospital_b_admin_user)
        assert sender_unread == 0
        assert recipient_unread >= 1
    finally:
        try:
            await sender_communicator.disconnect()
        except Exception:
            pass
        try:
            await recipient_communicator.disconnect()
        except Exception:
            pass


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_mark_read_updates_state_without_ws_push(
    hospital_admin_user,
    super_admin_user,
    hospital,
):
    broadcast = await database_sync_to_async(BroadcastMessage.objects.create)(
        title="Tracked Broadcast",
        message="Track read state",
        scope=BroadcastMessage.Scope.ALL,
        priority=BroadcastMessage.Priority.NORMAL,
        allow_response=True,
        sent_by=super_admin_user,
    )
    await database_sync_to_async(BroadcastRecipient.objects.create)(
        broadcast=broadcast,
        hospital=hospital,
        is_read=False,
    )

    token = str(AccessToken.for_user(hospital_admin_user))
    communicator = WebsocketCommunicator(application, f"/ws/broadcasts/?token={token}")
    connected, _ = await communicator.connect()
    assert connected

    update_result = await database_sync_to_async(mark_broadcast_read)(broadcast, hospital_admin_user)
    assert update_result["is_read"] is True
    assert update_result["updated"] is True
    assert await communicator.receive_nothing(timeout=0.25)

    unread_count = await database_sync_to_async(get_unread_broadcast_count)(hospital_admin_user)
    assert unread_count == 0

    await communicator.disconnect()
