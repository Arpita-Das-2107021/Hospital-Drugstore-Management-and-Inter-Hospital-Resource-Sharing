import pytest
from rest_framework import status

from apps.communications.models import Conversation


@pytest.mark.django_db
class TestConversationCreateApi:
    def test_create_conversation_uses_selected_user_name_for_default_subject(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)

        response = api_client.post(
            "/api/v1/conversations/",
            {
                "subject": "New conversation",
                "participant_ids": [str(hospital_b_admin_user.id)],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        payload = response.json()["data"]
        assert payload["subject"] == hospital_b_admin_user.get_full_name()
        assert len(payload["participants"]) == 2

    def test_create_conversation_accepts_staff_id_as_participant(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)

        response = api_client.post(
            "/api/v1/conversations/",
            {
                "subject": "New conversation",
                "participant_ids": [str(hospital_b_admin_user.staff.id)],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        payload = response.json()["data"]
        assert payload["subject"] == hospital_b_admin_user.get_full_name()
        assert len(payload["participants"]) == 2

    def test_create_conversation_rejects_self_only_payload(
        self,
        api_client,
        hospital_admin_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)

        response = api_client.post(
            "/api/v1/conversations/",
            {
                "subject": "New conversation",
                "participant_ids": [str(hospital_admin_user.id)],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        payload = response.json()
        assert "participant_ids" in payload["error"]["details"]

    def test_create_conversation_reuses_existing_one_to_one(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)

        first = api_client.post(
            "/api/v1/conversations/",
            {
                "subject": "New conversation",
                "participant_ids": [str(hospital_b_admin_user.id)],
            },
            format="json",
        )
        second = api_client.post(
            "/api/v1/conversations/",
            {
                "subject": "Any subject",
                "participant_ids": [str(hospital_b_admin_user.id)],
            },
            format="json",
        )

        assert first.status_code == status.HTTP_201_CREATED
        assert second.status_code == status.HTTP_200_OK
        assert first.json()["data"]["id"] == second.json()["data"]["id"]


@pytest.mark.django_db
class TestConversationParticipantManagementApi:
    def test_group_add_and_remove_participants(
        self,
        api_client,
        hospital_admin_user,
        hospital_b_admin_user,
        staff_user,
        pharmacist_user,
    ):
        api_client.force_authenticate(user=hospital_admin_user)
        create_response = api_client.post(
            "/api/v1/conversations/",
            {
                "subject": "Group room",
                "participant_ids": [str(hospital_b_admin_user.id), str(staff_user.id)],
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        conversation_id = create_response.json()["data"]["id"]

        add_response = api_client.post(
            f"/api/v1/conversations/{conversation_id}/participants/add/",
            {"participant_ids": [str(pharmacist_user.id)]},
            format="json",
        )
        assert add_response.status_code == status.HTTP_200_OK
        assert add_response.json()["data"]["added_count"] == 1

        remove_response = api_client.post(
            f"/api/v1/conversations/{conversation_id}/participants/remove/",
            {"participant_ids": [str(staff_user.id)]},
            format="json",
        )
        assert remove_response.status_code == status.HTTP_200_OK

        final_participants = set(
            Conversation.objects.get(id=conversation_id).participants.values_list("user_id", flat=True)
        )
        assert pharmacist_user.id in final_participants
        assert staff_user.id not in final_participants
