"""Integration tests for staff API (staff management, invitations, roles) and notifications."""
import pytest
from unittest.mock import patch
from rest_framework import status

STAFF_URL = "/api/v1/staff/"
INVITATIONS_URL = "/api/v1/invitations/"
ACCEPT_URL = "/api/v1/invitations/accept/"
ROLES_URL = "/api/v1/roles/"
NOTIFICATIONS_URL = "/api/v1/notifications/"
BROADCASTS_URL = "/api/v1/broadcasts/"


def staff_url(pk):
    return f"{STAFF_URL}{pk}/"


def invitation_url(pk):
    return f"{INVITATIONS_URL}{pk}/"


def notification_url(pk):
    return f"{NOTIFICATIONS_URL}{pk}/"


def broadcast_url(pk):
    return f"{BROADCASTS_URL}{pk}/"


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestRoleList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(ROLES_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_can_list(self, auth_client, hospital_admin_role):
        response = auth_client.get(ROLES_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_super_admin_can_list(self, super_admin_client, super_admin_role):
        response = super_admin_client.get(ROLES_URL)
        assert response.status_code == status.HTTP_200_OK
        ids = [r["id"] for r in response.json()["data"]]
        assert str(super_admin_role.id) in ids


# ---------------------------------------------------------------------------
# Staff management
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestStaffList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(STAFF_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_list(self, auth_client, staff_member):
        response = auth_client.get(STAFF_URL)
        assert response.status_code == status.HTTP_200_OK
        items = response.json().get("results", response.json().get("data", []))
        ids = [s["id"] for s in items]
        assert str(staff_member.id) in ids

    def test_super_admin_sees_all(self, super_admin_client, staff_member):
        response = super_admin_client.get(STAFF_URL)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestStaffRetrieve:
    def test_retrieve_own_hospital_staff(self, auth_client, staff_member):
        response = auth_client.get(staff_url(staff_member.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(staff_member.id)

    def test_retrieve_nonexistent_staff(self, auth_client):
        import uuid
        response = auth_client.get(staff_url(uuid.uuid4()))
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestStaffCreate:
    @patch("apps.staff.services.send_email", return_value=True)
    def test_hospital_admin_can_create_staff(self, _, auth_client, hospital):
        payload = {
            "hospital": str(hospital.id),
            "email": "new.employee@hospital.com",
            "first_name": "New",
            "last_name": "Employee",
            "employee_id": "EMP-NEW-001",
            "department": "ICU",
            "position": "Nurse",
        }
        response = auth_client.post(STAFF_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_cannot_create(self, api_client, hospital):
        payload = {
            "hospital": str(hospital.id),
            "email": "anon.user@hospital.com",
            "first_name": "Anon",
            "last_name": "User",
            "employee_id": "EMP-ANON-001",
        }
        response = api_client.post(STAFF_URL, payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestStaffUpdate:
    def test_can_update_staff_member(self, auth_client, staff_member):
        response = auth_client.patch(staff_url(staff_member.id), {"department": "Surgery"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["department"] == "Surgery"


@pytest.mark.django_db
class TestStaffSuspend:
    def test_delete_suspends_staff(self, auth_client, staff_member):
        """DELETE on a staff member suspends them, not actually deletes."""
        response = auth_client.delete(staff_url(staff_member.id))
        assert response.status_code == status.HTTP_200_OK
        staff_member.refresh_from_db()
        from apps.staff.models import Staff
        assert staff_member.employment_status == Staff.EmploymentStatus.SUSPENDED

    def test_suspend_action_endpoint(self, auth_client, staff_member):
        response = auth_client.post(f"{STAFF_URL}{staff_member.id}/suspend/")
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestInvitationList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(INVITATIONS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_list(self, auth_client):
        response = auth_client.get(INVITATIONS_URL)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestInvitationCreate:
    @patch("apps.staff.services.send_email", return_value=True)
    def test_hospital_admin_can_send_invitation(self, mock_email, auth_client, hospital_admin_role):
        payload = {
            "email": "new.staff@hospital.com",
            "role_id": str(hospital_admin_role.id),
            "first_name": "Invited",
            "last_name": "Person",
        }
        response = auth_client.post(INVITATIONS_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert mock_email.called

    @patch("apps.staff.services.send_email", return_value=True)
    def test_duplicate_invitation_rejected(self, mock_email, auth_client, hospital_admin_role):
        payload = {
            "email": "duplicate@hospital.com",
            "role_id": str(hospital_admin_role.id),
        }
        auth_client.post(INVITATIONS_URL, payload, format="json")
        response = auth_client.post(INVITATIONS_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_no_hospital_context_raises(self, super_admin_client, hospital_admin_role):
        """Super admin has no hospital context, should get 400."""
        payload = {"email": "nocontext@hospital.com"}
        response = super_admin_client.post(INVITATIONS_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_cannot_send(self, api_client):
        response = api_client.post(INVITATIONS_URL, {"email": "x@y.com"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestInvitationRetrieveAndRevoke:
    @pytest.fixture
    def invitation(self, db, hospital, hospital_admin_user):
        from django.utils import timezone
        from apps.staff.models import Invitation, Staff
        staff = Staff.objects.create(hospital=hospital, first_name="Inv", last_name="Person", employee_id="INV-001")
        return Invitation.objects.create(
            hospital=hospital,
            staff=staff,
            email="inv@hospital.com",
            token="test-invite-token-abc",
            expires_at=timezone.now() + timezone.timedelta(hours=24),
            invited_by=hospital_admin_user,
        )

    def test_retrieve_invitation(self, auth_client, invitation):
        response = auth_client.get(invitation_url(invitation.id))
        assert response.status_code == status.HTTP_200_OK

    def test_revoke_invitation(self, auth_client, invitation):
        response = auth_client.delete(invitation_url(invitation.id))
        assert response.status_code == status.HTTP_200_OK
        invitation.refresh_from_db()
        from apps.staff.models import Invitation
        assert invitation.status == Invitation.Status.REVOKED


@pytest.mark.django_db
class TestAcceptInvitation:
    @pytest.fixture
    def pending_invitation(self, db, hospital, hospital_admin_user):
        from django.utils import timezone
        from apps.staff.models import Invitation, Staff
        staff = Staff.objects.create(hospital=hospital, first_name="Accept", last_name="Me", employee_id="ACC-001")
        return Invitation.objects.create(
            hospital=hospital,
            staff=staff,
            email="accept.me@hospital.com",
            token="accept-invite-token-xyz",
            expires_at=timezone.now() + timezone.timedelta(hours=24),
            invited_by=hospital_admin_user,
        )

    def test_accept_valid_invitation(self, api_client, pending_invitation):
        payload = {
            "token": "accept-invite-token-xyz",
            "password": "NewSecurePass123!",
            "first_name": "Accepted",
            "last_name": "User",
        }
        response = api_client.post(ACCEPT_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "email" in response.json()["data"]

    def test_accept_invalid_token(self, api_client):
        payload = {"token": "bad-token", "password": "Pass123!"}
        response = api_client.post(ACCEPT_URL, payload, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_accept_expired_invitation(self, api_client, db, hospital, hospital_admin_user):
        from django.utils import timezone
        from apps.staff.models import Invitation, Staff
        staff = Staff.objects.create(hospital=hospital, first_name="Exp", last_name="Ire", employee_id="EXP-001")
        inv = Invitation.objects.create(
            hospital=hospital,
            staff=staff,
            email="expired@hospital.com",
            token="expired-token-001",
            expires_at=timezone.now() - timezone.timedelta(hours=1),
            invited_by=hospital_admin_user,
        )
        payload = {"token": "expired-token-001", "password": "Pass123!"}
        response = api_client.post(ACCEPT_URL, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestNotificationList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(NOTIFICATIONS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_can_list(self, auth_client):
        response = auth_client.get(NOTIFICATIONS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_only_own_notifications(self, auth_client, hospital_admin_user):
        from apps.notifications.models import Notification
        n = Notification.objects.create(
            user=hospital_admin_user,
            notification_type="broadcast",
            message="Hello",
        )
        response = auth_client.get(NOTIFICATIONS_URL)
        ids = [item["id"] for item in response.json().get("results", response.json().get("data", []))]
        assert str(n.id) in ids


@pytest.mark.django_db
class TestNotificationMarkRead:
    @pytest.fixture
    def notification(self, db, hospital_admin_user):
        from apps.notifications.models import Notification
        return Notification.objects.create(
            user=hospital_admin_user,
            notification_type="broadcast",
            message="Test notification",
        )

    def test_mark_notification_read(self, auth_client, notification):
        response = auth_client.post(notification_url(notification.id) + "read/")
        assert response.status_code == status.HTTP_200_OK
        notification.refresh_from_db()
        assert notification.is_read is True

    def test_cannot_mark_others_notification(self, hospital_b_auth_client, notification):
        response = hospital_b_auth_client.post(notification_url(notification.id) + "read/")
        # Either 404 (object not found for their queryset) or 400 (permission denied in service)
        assert response.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND,
        )

    def test_mark_all_read(self, auth_client, hospital_admin_user):
        from apps.notifications.models import Notification
        Notification.objects.create(
            user=hospital_admin_user, notification_type="broadcast", message="N1"
        )
        Notification.objects.create(
            user=hospital_admin_user, notification_type="broadcast", message="N2"
        )
        response = auth_client.post(f"{NOTIFICATIONS_URL}mark-all-read/")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["marked_read"] >= 2


@pytest.mark.django_db
class TestNotificationRetrieve:
    def test_retrieve_own_notification(self, auth_client, hospital_admin_user):
        from apps.notifications.models import Notification
        n = Notification.objects.create(
            user=hospital_admin_user, notification_type="broadcast", message="Hi"
        )
        response = auth_client.get(notification_url(n.id))
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Broadcasts
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestBroadcastList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(BROADCASTS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_list(self, auth_client):
        response = auth_client.get(BROADCASTS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_super_admin_can_list(self, super_admin_client):
        response = super_admin_client.get(BROADCASTS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_hospital_admin_sees_all_scope_broadcast(self, auth_client, super_admin_user):
        from apps.notifications.models import BroadcastMessage

        broadcast = BroadcastMessage.objects.create(
            title="System Alert",
            message="For all hospitals",
            scope="all",
            priority="normal",
            sent_by=super_admin_user,
        )
        response = auth_client.get(BROADCASTS_URL)
        assert response.status_code == status.HTTP_200_OK
        items = response.json().get("results", response.json().get("data", []))
        ids = [item["id"] for item in items]
        assert str(broadcast.id) in ids


@pytest.mark.django_db
class TestBroadcastCreate:
    @patch("apps.notifications.tasks.send_broadcast_task.delay")
    def test_super_admin_can_create_broadcast(self, mock_task, super_admin_client, hospital, hospital_b):
        from apps.notifications.models import BroadcastRecipient

        payload = {
            "title": "Test Broadcast",
            "message": "This is a test broadcast.",
            "scope": "all",
            "priority": "normal",
            "allow_response": True,
        }
        response = super_admin_client.post(BROADCASTS_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert mock_task.called
        broadcast_id = response.json()["data"]["id"]
        assert BroadcastRecipient.objects.filter(broadcast_id=broadcast_id, is_read=False).count() == 2

    @patch("apps.notifications.tasks.send_broadcast_task.delay")
    def test_hospital_admin_can_create_broadcast(self, mock_task, auth_client):
        payload = {
            "title": "Hospital Broadcast",
            "message": "Local alert",
            "scope": "all",
            "priority": "urgent",
            "allow_response": True,
        }
        response = auth_client.post(BROADCASTS_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert mock_task.called

    def test_non_hospital_admin_cannot_create(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        payload = {
            "title": "Unauthorized",
            "message": "Should fail.",
            "scope": "all",
            "priority": "normal",
        }
        response = api_client.post(BROADCASTS_URL, payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestBroadcastUpdateDeleteRespond:
    @pytest.fixture
    def broadcast(self, db, super_admin_user):
        from apps.notifications.models import BroadcastMessage
        return BroadcastMessage.objects.create(
            title="Emergency Call",
            message="Need blood units urgently",
            scope="all",
            priority="emergency",
            allow_response=True,
            sent_by=super_admin_user,
        )

    @patch("apps.notifications.tasks.send_broadcast_task.delay")
    def test_update_not_allowed(self, mock_task, super_admin_client, broadcast):
        response = super_admin_client.patch(
            broadcast_url(broadcast.id), {"title": "Updated"}, format="json"
        )
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_delete_broadcast(self, super_admin_client, broadcast):
        response = super_admin_client.delete(broadcast_url(broadcast.id))
        assert response.status_code == status.HTTP_200_OK

    def test_respond_success_when_active_and_allowed(self, auth_client, broadcast):
        payload = {
            "response": "We can supply 10 oxygen cylinders",
            "can_provide": True,
            "quantity_available": 10,
            "notes": "Available for immediate dispatch",
        }
        response = auth_client.post(f"{BROADCASTS_URL}{broadcast.id}/respond/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["response"] == "We can supply 10 oxygen cylinders"

    def test_broadcast_responses_list_for_creator(self, api_client, super_admin_user, hospital_admin_user, broadcast):
        api_client.force_authenticate(user=hospital_admin_user)
        api_client.post(
            f"{BROADCASTS_URL}{broadcast.id}/respond/",
            {"response": "Can provide 5 units", "can_provide": True, "quantity_available": 5},
            format="json",
        )
        api_client.force_authenticate(user=super_admin_user)
        response = api_client.get(f"{BROADCASTS_URL}{broadcast.id}/responses/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()["data"]) >= 1

    def test_respond_no_hospital_context(self, super_admin_client, broadcast):
        """Super admin has no hospital -> returns 400."""
        payload = {"response": "No hospital context"}
        response = super_admin_client.post(f"{BROADCASTS_URL}{broadcast.id}/respond/", payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_respond_rejected_when_allow_response_false(self, auth_client, super_admin_user):
        from apps.notifications.models import BroadcastMessage
        b = BroadcastMessage.objects.create(
            title="Info",
            message="FYI",
            scope="all",
            priority="normal",
            allow_response=False,
            sent_by=super_admin_user,
        )
        response = auth_client.post(
            f"{BROADCASTS_URL}{b.id}/respond/",
            {"response": "Can still help"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_close_prevents_new_responses(self, api_client, super_admin_user, hospital_admin_user, broadcast):
        api_client.force_authenticate(user=super_admin_user)
        close_response = api_client.post(f"{BROADCASTS_URL}{broadcast.id}/close/")
        assert close_response.status_code == status.HTTP_200_OK
        assert close_response.json()["data"]["status"] == "closed"

        api_client.force_authenticate(user=hospital_admin_user)
        response = api_client.post(
            f"{BROADCASTS_URL}{broadcast.id}/respond/",
            {"response": "Late response"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_creator_cannot_close_broadcast(self, auth_client, broadcast):
        response = auth_client.post(f"{BROADCASTS_URL}{broadcast.id}/close/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_non_creator_cannot_view_responses(self, hospital_b_auth_client, auth_client, broadcast):
        auth_client.post(
            f"{BROADCASTS_URL}{broadcast.id}/respond/",
            {"response": "Stock available"},
            format="json",
        )
        response = hospital_b_auth_client.get(f"{BROADCASTS_URL}{broadcast.id}/responses/")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestBroadcastReadTracking:
    @pytest.fixture
    def tracked_broadcast(self, db, super_admin_user, hospital, hospital_b):
        from apps.notifications.models import BroadcastMessage, BroadcastRecipient

        broadcast = BroadcastMessage.objects.create(
            title="Tracked Emergency",
            message="Track read/unread state",
            scope="all",
            priority="urgent",
            allow_response=True,
            sent_by=super_admin_user,
        )
        BroadcastRecipient.objects.create(broadcast=broadcast, hospital=hospital, is_read=False)
        BroadcastRecipient.objects.create(broadcast=broadcast, hospital=hospital_b, is_read=False)
        return broadcast

    def test_unread_count_returns_hospital_badge_count(self, auth_client, tracked_broadcast):
        response = auth_client.get(f"{BROADCASTS_URL}unread-count/")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["unread_count"] == 1

    def test_unread_count_denied_for_super_admin(self, super_admin_client):
        response = super_admin_client.get(f"{BROADCASTS_URL}unread-count/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_mark_read_endpoint_is_idempotent(self, auth_client, tracked_broadcast, hospital):
        from apps.notifications.models import BroadcastRecipient

        first = auth_client.post(f"{BROADCASTS_URL}{tracked_broadcast.id}/read/")
        assert first.status_code == status.HTTP_200_OK
        recipient = BroadcastRecipient.objects.get(broadcast=tracked_broadcast, hospital=hospital)
        first_read_at = recipient.read_at
        assert recipient.is_read is True

        second = auth_client.post(f"{BROADCASTS_URL}{tracked_broadcast.id}/read/")
        assert second.status_code == status.HTTP_200_OK
        recipient.refresh_from_db()
        assert recipient.is_read is True
        assert recipient.read_at == first_read_at
        assert second.json()["data"]["updated"] is False

    def test_list_includes_is_read_for_hospital(self, auth_client, tracked_broadcast):
        response = auth_client.get(BROADCASTS_URL)
        assert response.status_code == status.HTTP_200_OK
        items = response.json().get("results", response.json().get("data", []))
        broadcast_item = next(item for item in items if item["id"] == str(tracked_broadcast.id))
        assert broadcast_item["is_read"] is False

    def test_retrieve_marks_broadcast_as_read(self, auth_client, tracked_broadcast, hospital):
        from apps.notifications.models import BroadcastRecipient

        response = auth_client.get(f"{BROADCASTS_URL}{tracked_broadcast.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["is_read"] is True

        recipient = BroadcastRecipient.objects.get(broadcast=tracked_broadcast, hospital=hospital)
        assert recipient.is_read is True
        assert recipient.read_at is not None

    def test_hospital_can_only_mark_its_own_recipient_as_read(self, api_client, hospital_b_admin_user, tracked_broadcast, hospital_b):
        from apps.notifications.models import BroadcastRecipient

        api_client.force_authenticate(user=hospital_b_admin_user)
        response = api_client.post(f"{BROADCASTS_URL}{tracked_broadcast.id}/read/")
        assert response.status_code == status.HTTP_200_OK

        hospital_b_recipient = BroadcastRecipient.objects.get(broadcast=tracked_broadcast, hospital=hospital_b)
        assert hospital_b_recipient.is_read is True


# ---------------------------------------------------------------------------
# Notification tasks (unit-style but task layer)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestNotificationTasks:
    def test_send_notification_task_creates_notification(self, hospital_admin_user):
        from apps.notifications.tasks import send_notification_task
        send_notification_task(
            str(hospital_admin_user.id),
            "broadcast",
            "Task test notification",
            {"key": "value"},
        )
        from apps.notifications.models import Notification
        assert Notification.objects.filter(user=hospital_admin_user, message="Task test notification").exists()

    def test_send_broadcast_task_delivers(self, super_admin_user, hospital_admin_user):
        from apps.notifications.models import BroadcastMessage
        from apps.notifications.tasks import send_broadcast_task
        broadcast = BroadcastMessage.objects.create(
            title="Test",
            message="Test broadcast delivery",
            scope="all",
            priority="normal",
            sent_by=super_admin_user,
        )
        result = send_broadcast_task(str(broadcast.id))
        assert "delivered_to" in result

    def test_send_broadcast_task_not_found(self):
        import uuid
        from apps.notifications.tasks import send_broadcast_task
        result = send_broadcast_task(str(uuid.uuid4()))
        assert result.get("error") == "not_found"

    @patch("django.core.mail.EmailMultiAlternatives.send")
    def test_send_email_task_sends(self, mock_send):
        from apps.notifications.tasks import send_email_task
        send_email_task("to@test.com", "Subject", "Body text")
        mock_send.assert_called_once()

    def test_notification_services_mark_wrong_user_raises(self, hospital_admin_user, hospital_b_auth_client):
        from django.contrib.auth import get_user_model
        from rest_framework.exceptions import ValidationError
        from apps.notifications.models import Notification
        from apps.notifications.services import mark_notification_read
        UserAccount = get_user_model()

        n = Notification.objects.create(
            user=hospital_admin_user,
            notification_type="broadcast",
            message="not yours",
        )
        other_user = UserAccount.objects.create_user(
            email="other.mark@test.com", password="Test1234!"
        )
        with pytest.raises(ValidationError, match="Not your notification"):
            mark_notification_read(n, other_user)
