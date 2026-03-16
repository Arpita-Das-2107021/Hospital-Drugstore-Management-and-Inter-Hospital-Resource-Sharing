import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.db import connections
from django.test.utils import override_settings
from rest_framework_simplejwt.tokens import AccessToken

from apps.communications.models import Conversation, ConversationParticipant, Message
from config.asgi import application


@pytest.fixture
def conversation_with_participants(hospital_admin_user, hospital_b_admin_user):
    conversation = Conversation.objects.create(subject="Realtime")
    ConversationParticipant.objects.create(conversation=conversation, user=hospital_admin_user)
    ConversationParticipant.objects.create(conversation=conversation, user=hospital_b_admin_user)
    return conversation


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
async def test_websocket_rejects_unauthenticated(conversation_with_participants):
    communicator = WebsocketCommunicator(
        application,
        f"/ws/chat/{conversation_with_participants.id}/",
    )

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
async def test_websocket_rejects_non_participant(conversation_with_participants, super_admin_user):
    token = str(AccessToken.for_user(super_admin_user))
    communicator = WebsocketCommunicator(
        application,
        f"/ws/chat/{conversation_with_participants.id}/?token={token}",
    )

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
async def test_send_and_receive_message_event(
    conversation_with_participants,
    hospital_admin_user,
    hospital_b_admin_user,
):
    token_a = str(AccessToken.for_user(hospital_admin_user))
    token_b = str(AccessToken.for_user(hospital_b_admin_user))

    sender = WebsocketCommunicator(
        application,
        f"/ws/chat/{conversation_with_participants.id}/?token={token_a}",
    )
    receiver = WebsocketCommunicator(
        application,
        f"/ws/chat/{conversation_with_participants.id}/?token={token_b}",
    )

    connected_a, _ = await sender.connect()
    connected_b, _ = await receiver.connect()
    assert connected_a and connected_b

    await sender.send_json_to({"type": "message.send", "body": "hello team"})

    payload_on_receiver = await receiver.receive_json_from()
    assert payload_on_receiver["event"] == "message.created"
    assert payload_on_receiver["data"]["body"] == "hello team"
    assert payload_on_receiver["data"]["attachments"] == []
    assert payload_on_receiver["data"]["status"] in {"sent", "delivered", "read"}
    assert isinstance(payload_on_receiver["data"]["read_by"], list)

    await sender.disconnect()
    await receiver.disconnect()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_bidirectional_multiple_messages_in_same_conversation(
    conversation_with_participants,
    hospital_admin_user,
    hospital_b_admin_user,
):
    async def _receive_until_body(communicator, expected_body: str):
        for _ in range(5):
            event = await communicator.receive_json_from()
            if event.get("event") == "message.created" and event.get("data", {}).get("body") == expected_body:
                return event
        raise AssertionError(f"Did not receive expected message body: {expected_body}")

    token_a = str(AccessToken.for_user(hospital_admin_user))
    token_b = str(AccessToken.for_user(hospital_b_admin_user))

    client_a = WebsocketCommunicator(
        application,
        f"/ws/chat/{conversation_with_participants.id}/?token={token_a}",
    )
    client_b = WebsocketCommunicator(
        application,
        f"/ws/chat/{conversation_with_participants.id}/?token={token_b}",
    )

    connected_a, _ = await client_a.connect()
    connected_b, _ = await client_b.connect()
    assert connected_a and connected_b

    try:
        await client_a.send_json_to({"type": "message.send", "body": "A1"})
        await _receive_until_body(client_b, "A1")

        await client_b.send_json_to({"type": "message.send", "body": "B1"})
        await _receive_until_body(client_a, "B1")

        await client_a.send_json_to({"type": "message.send", "body": "A2"})
        await _receive_until_body(client_b, "A2")
    finally:
        await client_a.disconnect()
        await client_b.disconnect()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_typing_indicator_broadcast(
    conversation_with_participants,
    hospital_admin_user,
    hospital_b_admin_user,
):
    token_a = str(AccessToken.for_user(hospital_admin_user))
    token_b = str(AccessToken.for_user(hospital_b_admin_user))

    sender = WebsocketCommunicator(application, f"/ws/chat/{conversation_with_participants.id}/?token={token_a}")
    receiver = WebsocketCommunicator(application, f"/ws/chat/{conversation_with_participants.id}/?token={token_b}")

    connected_a, _ = await sender.connect()
    connected_b, _ = await receiver.connect()
    assert connected_a and connected_b

    await sender.send_json_to({"type": "typing.start"})
    payload = await receiver.receive_json_from()

    assert payload["event"] == "typing.start"
    assert payload["data"]["user_id"] == str(hospital_admin_user.id)

    await sender.disconnect()
    await receiver.disconnect()


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_read_receipt_updates_last_read_at(conversation_with_participants, hospital_admin_user):
    message = await database_sync_to_async(Message.objects.create)(
        conversation=conversation_with_participants,
        sender=hospital_admin_user,
        body="read me",
    )

    token = str(AccessToken.for_user(hospital_admin_user))
    communicator = WebsocketCommunicator(
        application,
        f"/ws/chat/{conversation_with_participants.id}/?token={token}",
    )

    connected, _ = await communicator.connect()
    assert connected

    await communicator.send_json_to({"type": "message.read", "message_id": str(message.id)})
    payload = await communicator.receive_json_from()

    assert payload["event"] == "message.read"

    participant = await database_sync_to_async(ConversationParticipant.objects.get)(
        conversation=conversation_with_participants,
        user=hospital_admin_user,
    )
    assert participant.last_read_at is not None

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
async def test_message_isolation_between_different_conversations(
    hospital_admin_user,
    hospital_b_admin_user,
    pharmacist_user,
):
    convo_ab = await database_sync_to_async(Conversation.objects.create)(subject="AB")
    convo_ap = await database_sync_to_async(Conversation.objects.create)(subject="AP")

    await database_sync_to_async(ConversationParticipant.objects.create)(
        conversation=convo_ab,
        user=hospital_admin_user,
    )
    await database_sync_to_async(ConversationParticipant.objects.create)(
        conversation=convo_ab,
        user=hospital_b_admin_user,
    )
    await database_sync_to_async(ConversationParticipant.objects.create)(
        conversation=convo_ap,
        user=hospital_admin_user,
    )
    await database_sync_to_async(ConversationParticipant.objects.create)(
        conversation=convo_ap,
        user=pharmacist_user,
    )

    token_admin = str(AccessToken.for_user(hospital_admin_user))
    token_b = str(AccessToken.for_user(hospital_b_admin_user))
    token_pharmacist = str(AccessToken.for_user(pharmacist_user))

    admin_ab = WebsocketCommunicator(application, f"/ws/chat/{convo_ab.id}/?token={token_admin}")
    user_b = WebsocketCommunicator(application, f"/ws/chat/{convo_ab.id}/?token={token_b}")
    pharmacist_ap = WebsocketCommunicator(application, f"/ws/chat/{convo_ap.id}/?token={token_pharmacist}")

    connected_admin, _ = await admin_ab.connect()
    connected_b, _ = await user_b.connect()
    connected_pharmacist, _ = await pharmacist_ap.connect()
    assert connected_admin and connected_b and connected_pharmacist

    await admin_ab.send_json_to({"type": "message.send", "body": "only AB should receive"})

    payload_b = await user_b.receive_json_from()
    assert payload_b["event"] == "message.created"
    assert payload_b["data"]["body"] == "only AB should receive"

    assert await pharmacist_ap.receive_nothing(timeout=0.2, interval=0.01)

    await admin_ab.disconnect()
    await user_b.disconnect()
    await pharmacist_ap.disconnect()
