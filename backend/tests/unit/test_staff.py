"""Unit tests for Staff models and services."""
import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.staff.models import Invitation, Role, Staff
from apps.staff.services import accept_invitation, send_invitation, suspend_staff


@pytest.mark.django_db
class TestStaffModel:
    def test_staff_creation(self, staff_member):
        assert staff_member.pk is not None
        assert staff_member.employment_status == Staff.EmploymentStatus.ACTIVE

    def test_staff_full_name(self, staff_member):
        assert staff_member.full_name == "John Doe"

    def test_staff_str(self, staff_member):
        assert "John Doe" in str(staff_member)


@pytest.mark.django_db
class TestInvitationModel:
    def test_invitation_not_expired(self, db, hospital, hospital_admin_user):
        inv = Invitation.objects.create(
            hospital=hospital,
            email="new@test.com",
            token="testtoken123",
            expires_at=timezone.now() + timezone.timedelta(hours=24),
            invited_by=hospital_admin_user,
        )
        assert not inv.is_expired

    def test_invitation_expired(self, db, hospital, hospital_admin_user):
        inv = Invitation.objects.create(
            hospital=hospital,
            email="new@test.com",
            token="expiredtoken999",
            expires_at=timezone.now() - timezone.timedelta(hours=1),
            invited_by=hospital_admin_user,
        )
        assert inv.is_expired


@pytest.mark.django_db
class TestStaffServices:
    def test_suspend_staff(self, staff_member, hospital_admin_user):
        result = suspend_staff(staff_member, hospital_admin_user)
        assert result.employment_status == Staff.EmploymentStatus.SUSPENDED

    def test_accept_invitation_invalid_token(self):
        with pytest.raises(Exception):
            accept_invitation("nonexistent_token", "Password123!")

    def test_send_invitation_duplicate_raises(self, db, hospital, hospital_admin_user, mocker):
        mocker.patch("apps.staff.services.send_email", return_value=True)
        send_invitation(hospital, "test@invite.com", actor=hospital_admin_user)
        with pytest.raises(ValidationError):
            send_invitation(hospital, "test@invite.com", actor=hospital_admin_user)

    def test_send_invitation_with_invalid_role_raises(self, db, hospital, hospital_admin_user, mocker):
        mocker.patch("apps.staff.services.send_email", return_value=True)
        import uuid
        with pytest.raises(ValidationError):
            send_invitation(hospital, "roletest@invite.com", role_id=uuid.uuid4(), actor=hospital_admin_user)

    def test_send_invitation_with_valid_role(self, db, hospital, hospital_admin_user, hospital_admin_role, mocker):
        mocker.patch("apps.staff.services.send_email", return_value=True)
        inv = send_invitation(hospital, "withrole@invite.com", role_id=hospital_admin_role.id, actor=hospital_admin_user)
        assert inv.role == hospital_admin_role


@pytest.mark.django_db
class TestAssignRevokeRole:
    def test_assign_role_creates_user_role(self, hospital_admin_user, hospital, hospital_admin_role, super_admin_user):
        from apps.staff.services import assign_role
        from apps.staff.models import UserRole
        # Remove pre-existing role to avoid duplicate
        UserRole.objects.filter(user=hospital_admin_user, role=hospital_admin_role).delete()
        ur = assign_role(
            user=hospital_admin_user,
            role_id=hospital_admin_role.id,
            hospital_id=hospital.id,
            actor=super_admin_user,
        )
        assert ur.pk is not None
        assert ur.role == hospital_admin_role
        hospital_admin_user.staff.refresh_from_db()
        assert hospital_admin_user.staff.role_id == hospital_admin_role.id

    def test_assign_duplicate_role_raises(self, hospital_admin_user, hospital, hospital_admin_role, super_admin_user):
        from apps.staff.services import assign_role
        with pytest.raises(ValidationError, match="Role already assigned"):
            assign_role(
                user=hospital_admin_user,
                role_id=hospital_admin_role.id,
                hospital_id=hospital.id,
                actor=super_admin_user,
            )

    def test_assign_invalid_role_raises(self, hospital_admin_user, hospital, super_admin_user):
        import uuid
        from apps.staff.services import assign_role
        from rest_framework.exceptions import NotFound
        with pytest.raises(NotFound):
            assign_role(hospital_admin_user, uuid.uuid4(), hospital.id, super_admin_user)

    def test_revoke_role(self, hospital_admin_user, hospital, hospital_admin_role, super_admin_user):
        from apps.staff.services import revoke_role
        from apps.staff.models import UserRole
        hospital_admin_user.staff.role = hospital_admin_role
        hospital_admin_user.staff.save(update_fields=["role", "updated_at"])
        revoke_role(hospital_admin_user, hospital_admin_role.id, hospital.id)
        assert not UserRole.objects.filter(
            user=hospital_admin_user, role=hospital_admin_role, hospital=hospital
        ).exists()
        hospital_admin_user.staff.refresh_from_db()
        assert hospital_admin_user.staff.role is None

    def test_revoke_nonexistent_role_raises(self, hospital_admin_user, hospital):
        import uuid
        from apps.staff.services import revoke_role
        from rest_framework.exceptions import NotFound
        with pytest.raises(NotFound):
            revoke_role(hospital_admin_user, uuid.uuid4(), hospital.id)


@pytest.mark.django_db
class TestAcceptInvitation:
    def test_full_accept_flow(self, db, hospital, hospital_admin_user, mocker):
        from django.utils import timezone
        from apps.staff.models import Invitation, Staff
        from apps.staff.services import accept_invitation, send_invitation

        mocker.patch("apps.staff.services.send_email", return_value=True)
        inv = send_invitation(hospital, "newstaff@inv.com", actor=hospital_admin_user)
        user = accept_invitation(inv.token, "SecurePass123!", first_name="New", last_name="Staff")
        assert user.email == "newstaff@inv.com"
        inv.refresh_from_db()
        assert inv.status == Invitation.Status.ACCEPTED

    def test_already_used_invitation_raises(self, db, hospital, hospital_admin_user, mocker):
        from apps.staff.services import accept_invitation, send_invitation
        mocker.patch("apps.staff.services.send_email", return_value=True)
        inv = send_invitation(hospital, "used@inv.com", actor=hospital_admin_user)
        accept_invitation(inv.token, "SecurePass123!")
        with pytest.raises(ValidationError, match="accepted"):
            accept_invitation(inv.token, "SecurePass123!")

    def test_revoke_invitation(self, db, hospital, hospital_admin_user, mocker):
        from apps.staff.services import revoke_invitation, send_invitation
        mocker.patch("apps.staff.services.send_email", return_value=True)
        from apps.staff.models import Invitation
        inv = send_invitation(hospital, "revoke@inv.com", actor=hospital_admin_user)
        revoke_invitation(inv, hospital_admin_user)
        inv.refresh_from_db()
        assert inv.status == Invitation.Status.REVOKED

    def test_revoke_non_pending_invitation_raises(self, db, hospital, hospital_admin_user, mocker):
        from apps.staff.services import revoke_invitation, send_invitation, accept_invitation
        from apps.staff.models import Invitation
        mocker.patch("apps.staff.services.send_email", return_value=True)
        inv = send_invitation(hospital, "revaccept@inv.com", actor=hospital_admin_user)
        accept_invitation(inv.token, "SecurePass123!")
        inv.refresh_from_db()  # refresh so status is ACCEPTED in memory
        assert inv.status == Invitation.Status.ACCEPTED
        with pytest.raises(ValidationError, match="pending"):
            revoke_invitation(inv, hospital_admin_user)
