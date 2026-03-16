import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from apps.communications.models import Conversation, ConversationParticipant, Message
from apps.chat.models import ChatAuditEvent, DirectConversation, MessageAttachment
from apps.chat.services import create_message
from common.utils.chat_encryption import is_chat_message_encrypted


@pytest.fixture
def conversation_with_participants(hospital_admin_user, hospital_b_admin_user):
    conversation = Conversation.objects.create(subject="Coordination")
    ConversationParticipant.objects.create(conversation=conversation, user=hospital_admin_user)
    ConversationParticipant.objects.create(conversation=conversation, user=hospital_b_admin_user)
    return conversation


@pytest.mark.django_db
class TestDirectConversationApi:
    def test_open_direct_conversation_creates_then_reuses_same_thread(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        url = "/api/v1/chat/direct-conversations/open/"

        first = api_client.post(url, {"participant_id": str(hospital_b_admin_user.id)}, format="json")
        second = api_client.post(url, {"participant_id": str(hospital_b_admin_user.id)}, format="json")

        assert first.status_code == status.HTTP_201_CREATED
        assert second.status_code == status.HTTP_200_OK

        first_conversation_id = first.json()["data"]["conversation"]["id"]
        second_conversation_id = second.json()["data"]["conversation"]["id"]
        assert first_conversation_id == second_conversation_id

        assert DirectConversation.objects.count() == 1

    def test_open_direct_conversation_rejects_self(
        self,
        api_client,
        hospital_admin_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        response = api_client.post(
            "/api/v1/chat/direct-conversations/open/",
            {"participant_id": str(hospital_admin_user.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_open_direct_conversation_rejects_non_staff_actor(
        self,
        api_client,
        super_admin_user,
        hospital_admin_user,
    ):
        api_client.force_authenticate(user=super_admin_user)
        response = api_client.post(
            "/api/v1/chat/direct-conversations/open/",
            {"participant_id": str(hospital_admin_user.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_direct_conversations_returns_only_caller_threads(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
        staff_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)

        api_client.post(
            "/api/v1/chat/direct-conversations/open/",
            {"participant_id": str(hospital_b_admin_user.id)},
            format="json",
        )
        api_client.post(
            "/api/v1/chat/direct-conversations/open/",
            {"participant_id": str(staff_user.id)},
            format="json",
        )

        response = api_client.get("/api/v1/chat/direct-conversations/?limit=10&page=1")
        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["meta"]["total"] == 2


@pytest.mark.django_db
class TestChatHistoryApi:
    def test_history_rejects_non_direct_conversation(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
        staff_user,
    ):
        conversation = Conversation.objects.create(subject="Group")
        ConversationParticipant.objects.create(conversation=conversation, user=hospital_admin_user)
        ConversationParticipant.objects.create(conversation=conversation, user=hospital_b_admin_user)
        ConversationParticipant.objects.create(conversation=conversation, user=staff_user)

        api_client.force_authenticate(user=hospital_admin_user)
        url = f"/api/v1/chat/conversations/{conversation.id}/messages/"
        response = api_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_history_requires_participant(self, api_client, super_admin_user, conversation_with_participants):
        api_client.force_authenticate(user=super_admin_user)
        url = f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/"

        response = api_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_history_returns_chronological_paginated_messages(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
        conversation_with_participants,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        Message.objects.create(conversation=conversation_with_participants, sender=hospital_admin_user, body="first")
        Message.objects.create(
            conversation=conversation_with_participants,
            sender=hospital_b_admin_user,
            body="second",
        )
        Message.objects.create(conversation=conversation_with_participants, sender=hospital_admin_user, body="third")

        url = f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/?limit=2&page=1"
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["meta"]["total"] == 3
        assert payload["meta"]["limit"] == 2
        assert payload["data"][0]["body"] == "first"
        assert payload["data"][1]["body"] == "second"


@pytest.mark.django_db
class TestChatAttachmentApi:
    def test_attachment_upload_creates_message_and_attachment(
        self,
        api_client,
        hospital_admin_user,
        conversation_with_participants,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        url = f"/api/v1/chat/conversations/{conversation_with_participants.id}/attachments/"
        upload = SimpleUploadedFile(
            "report.pdf",
            b"%PDF-1.4 mock",
            content_type="application/pdf",
        )

        response = api_client.post(url, {"file": upload, "body": "Please review"}, format="multipart")

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()["data"]["message"]
        assert data["body"] == "Please review"
        assert len(data["attachments"]) == 1
        attachment = data["attachments"][0]
        assert attachment["original_name"] == "report.pdf"
        assert attachment["name"] == "report.pdf"
        assert attachment["type"] == "file"
        assert attachment["url"].startswith("http") or attachment["url"].startswith("/")
        assert attachment["size"] == len(b"%PDF-1.4 mock")

        message = Message.objects.get(id=data["id"])
        assert is_chat_message_encrypted(message.body)
        assert message.body != "Please review"

    def test_attachment_upload_image_returns_image_type_metadata(
        self,
        api_client,
        hospital_admin_user,
        conversation_with_participants,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        url = f"/api/v1/chat/conversations/{conversation_with_participants.id}/attachments/"
        upload = SimpleUploadedFile(
            "sample.png",
            b"\x89PNG\r\n\x1a\nmock",
            content_type="image/png",
        )

        response = api_client.post(url, {"file": upload, "body": "Image upload"}, format="multipart")

        assert response.status_code == status.HTTP_201_CREATED
        attachment = response.json()["data"]["message"]["attachments"][0]
        assert attachment["name"] == "sample.png"
        assert attachment["type"] == "image"
        assert attachment["media_kind"] == "image"
        assert attachment["size"] == len(b"\x89PNG\r\n\x1a\nmock")

    def test_attachment_upload_voice_returns_voice_metadata(
        self,
        api_client,
        hospital_admin_user,
        conversation_with_participants,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        url = f"/api/v1/chat/conversations/{conversation_with_participants.id}/attachments/"
        upload = SimpleUploadedFile(
            "voice_note.ogg",
            b"OggS\x00\x02mock",
            content_type="audio/ogg",
        )

        response = api_client.post(url, {"file": upload, "media_kind": "voice"}, format="multipart")

        assert response.status_code == status.HTTP_201_CREATED
        attachment = response.json()["data"]["message"]["attachments"][0]
        assert attachment["type"] == "voice"
        assert attachment["media_kind"] == "voice"
        assert attachment["processing_status"] == "ready"

    def test_attachment_upload_video_returns_video_metadata(
        self,
        api_client,
        hospital_admin_user,
        conversation_with_participants,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        url = f"/api/v1/chat/conversations/{conversation_with_participants.id}/attachments/"
        upload = SimpleUploadedFile(
            "clip.mp4",
            b"\x00\x00\x00\x18ftypmp42mock",
            content_type="video/mp4",
        )

        response = api_client.post(url, {"file": upload, "media_kind": "video"}, format="multipart")

        assert response.status_code == status.HTTP_201_CREATED
        attachment = response.json()["data"]["message"]["attachments"][0]
        assert attachment["type"] == "video"
        assert attachment["media_kind"] == "video"
        assert attachment["processing_status"] in {"ready", "pending"}

    def test_attachment_upload_rejects_unsupported_file_type(
        self,
        api_client,
        hospital_admin_user,
        conversation_with_participants,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        url = f"/api/v1/chat/conversations/{conversation_with_participants.id}/attachments/"
        upload = SimpleUploadedFile(
            "script.exe",
            b"MZ",
            content_type="application/octet-stream",
        )

        response = api_client.post(url, {"file": upload}, format="multipart")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Unsupported attachment file type" in str(response.json())


@pytest.mark.django_db
class TestChatDeletionAuditAndExportApi:
    def test_delete_message_is_user_specific(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
        conversation_with_participants,
    ):
        message = create_message(
            conversation=conversation_with_participants,
            sender=hospital_admin_user,
            body="sensitive text",
        )

        api_client.force_authenticate(user=hospital_admin_user)
        delete_response = api_client.post(
            f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/delete/",
            {"message_id": str(message.id)},
            format="json",
        )
        assert delete_response.status_code == status.HTTP_200_OK

        history_a = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/")
        assert history_a.status_code == status.HTTP_200_OK
        assert len(history_a.json()["data"]) == 0

        api_client.force_authenticate(user=hospital_b_admin_user)
        history_b = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/")
        assert history_b.status_code == status.HTTP_200_OK
        assert len(history_b.json()["data"]) == 1
        assert history_b.json()["data"][0]["body"] == "sensitive text"

    def test_delete_message_for_everyone_removes_attachment_file(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
        conversation_with_participants,
    ):
        api_client.force_authenticate(user=hospital_admin_user)

        upload_response = api_client.post(
            f"/api/v1/chat/conversations/{conversation_with_participants.id}/attachments/",
            {
                "file": SimpleUploadedFile("to_delete.pdf", b"mock-pdf", content_type="application/pdf"),
                "body": "remove me",
            },
            format="multipart",
        )
        assert upload_response.status_code == status.HTTP_201_CREATED
        message_id = upload_response.json()["data"]["message"]["id"]
        attachment_id = upload_response.json()["data"]["attachment_id"]
        attachment = MessageAttachment.objects.get(id=attachment_id)
        attachment_storage = attachment.file.storage
        attachment_name = attachment.file.name
        assert attachment_storage.exists(attachment_name)

        delete_response = api_client.post(
            f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/delete/",
            {
                "message_id": message_id,
                "delete_for_everyone": True,
            },
            format="json",
        )
        assert delete_response.status_code == status.HTTP_200_OK
        assert attachment_storage.exists(attachment_name) is False

        api_client.force_authenticate(user=hospital_b_admin_user)
        history_b = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/")
        assert history_b.status_code == status.HTTP_200_OK
        assert len(history_b.json()["data"]) == 0

    def test_delete_conversation_is_user_specific(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        opened = api_client.post(
            "/api/v1/chat/direct-conversations/open/",
            {"participant_id": str(hospital_b_admin_user.id)},
            format="json",
        )
        assert opened.status_code in (status.HTTP_201_CREATED, status.HTTP_200_OK)
        conversation_id = opened.json()["data"]["conversation"]["id"]

        deleted = api_client.post(f"/api/v1/chat/conversations/{conversation_id}/delete/")
        assert deleted.status_code == status.HTTP_200_OK

        list_a = api_client.get("/api/v1/chat/direct-conversations/")
        assert list_a.status_code == status.HTTP_200_OK
        listed_ids_a = [item["conversation"]["id"] for item in list_a.json()["data"]]
        assert conversation_id not in listed_ids_a

        api_client.force_authenticate(user=hospital_b_admin_user)
        list_b = api_client.get("/api/v1/chat/direct-conversations/")
        assert list_b.status_code == status.HTTP_200_OK
        listed_ids_b = [item["conversation"]["id"] for item in list_b.json()["data"]]
        assert conversation_id in listed_ids_b

    def test_chat_audit_events_are_created_and_listed(
        self,
        api_client,
        hospital_admin_user,
        conversation_with_participants,
    ):
        message = create_message(
            conversation=conversation_with_participants,
            sender=hospital_admin_user,
            body="audit me",
        )

        api_client.force_authenticate(user=hospital_admin_user)
        response = api_client.post(
            f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/delete/",
            {"message_id": str(message.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        audit_response = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/audit-events/")
        assert audit_response.status_code == status.HTTP_200_OK
        events = audit_response.json()["data"]
        assert any(event["event_type"] == ChatAuditEvent.EventType.MESSAGE_SENT for event in events)
        assert any(event["event_type"] == ChatAuditEvent.EventType.MESSAGE_DELETED for event in events)

    def test_chat_export_json_and_csv(
        self,
        api_client,
        hospital_admin_user,
        conversation_with_participants,
    ):
        create_message(
            conversation=conversation_with_participants,
            sender=hospital_admin_user,
            body="export line",
        )

        api_client.force_authenticate(user=hospital_admin_user)
        json_response = api_client.get(
            f"/api/v1/chat/conversations/{conversation_with_participants.id}/export/?export_format=json&include_audit=true"
        )
        assert json_response.status_code == status.HTTP_200_OK
        payload = json_response.json()["data"]
        assert payload["messages"][0]["body"] == "export line"
        assert "audit_events" in payload

        csv_response = api_client.get(
            f"/api/v1/chat/conversations/{conversation_with_participants.id}/export/?export_format=csv"
        )
        assert csv_response.status_code == status.HTTP_200_OK
        assert "text/csv" in csv_response["Content-Type"]
        assert "message_id" in csv_response.content.decode()


@pytest.mark.django_db
class TestChatUnreadAndStatusApi:
    def test_unread_count_and_status_progression(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
        conversation_with_participants,
    ):
        create_message(
            conversation=conversation_with_participants,
            sender=hospital_admin_user,
            body="new message",
        )

        api_client.force_authenticate(user=hospital_b_admin_user)
        unread_before = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/unread-count/")
        assert unread_before.status_code == status.HTTP_200_OK
        assert unread_before.json()["data"]["unread_count"] == 1

        history_before = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/")
        assert history_before.status_code == status.HTTP_200_OK
        assert history_before.json()["data"][0]["status"] == "delivered"

        conversation_with_participants.participants.filter(user=hospital_b_admin_user).update(last_read_at=Message.objects.latest("created_at").created_at)

        unread_after = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/unread-count/")
        assert unread_after.status_code == status.HTTP_200_OK
        assert unread_after.json()["data"]["unread_count"] == 0

        history_after = api_client.get(f"/api/v1/chat/conversations/{conversation_with_participants.id}/messages/")
        assert history_after.status_code == status.HTTP_200_OK
        assert history_after.json()["data"][0]["status"] == "read"
