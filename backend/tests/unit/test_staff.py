"""Unit tests for Staff models and services."""
import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.staff.models import Invitation, Permission, Role, Staff
from apps.staff.services import (
    accept_invitation,
    assign_permissions_to_role,
    get_effective_permissions_for_user,
    revoke_permissions_from_role,
    send_invitation,
    suspend_staff,
)


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

    def test_accept_invitation_assigns_default_staff_hospital_role(self, hospital, hospital_admin_user, mocker):
        from apps.staff.models import Permission, UserHospitalRole

        Permission.objects.get_or_create(
            code="hospital:inventory.view",
            defaults={"name": "View Hospital Inventory"},
        )
        Permission.objects.get_or_create(
            code="hospital:resource_share.view",
            defaults={"name": "View Resource Shares"},
        )
        Permission.objects.get_or_create(
            code="communication:chat.view",
            defaults={"name": "View Chat Conversations"},
        )
        Permission.objects.get_or_create(
            code="communication:conversation.view",
            defaults={"name": "View Conversation Module"},
        )

        mocker.patch("apps.staff.services.send_email", return_value=True)
        invitation = send_invitation(hospital, "default.staff@inv.com", actor=hospital_admin_user)
        user = accept_invitation(invitation.token, "SecurePass123!", first_name="Default", last_name="Staff")

        assignment = UserHospitalRole.objects.select_related("hospital_role", "hospital").get(user=user)
        assert assignment.hospital_id == hospital.id
        assert assignment.hospital_role.name == "STAFF"

        assigned_codes = set(assignment.hospital_role.role_permissions.values_list("permission__code", flat=True))
        assert assigned_codes == {
            "hospital:inventory.view",
            "hospital:resource_share.view",
            "communication:chat.view",
            "communication:conversation.view",
        }

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


@pytest.mark.django_db
class TestRolePermissionServices:
    def test_assign_permissions_to_role_is_idempotent(self, hospital_admin_role, hospital_admin_user):
        Permission.objects.create(code="ROLE_VIEW", name="Role View")
        Permission.objects.create(code="ROLE_ASSIGN", name="Role Assign")

        first = assign_permissions_to_role(
            role=hospital_admin_role,
            permission_codes=["role_view", "ROLE_ASSIGN"],
            actor=hospital_admin_user,
        )
        second = assign_permissions_to_role(
            role=hospital_admin_role,
            permission_codes=["ROLE_VIEW"],
            actor=hospital_admin_user,
        )

        assert first["assigned"] == ["ROLE_ASSIGN", "ROLE_VIEW"]
        assert second["assigned"] == []
        assert second["already_assigned"] == ["ROLE_VIEW"]
        assert hospital_admin_role.permissions.filter(code__in=["ROLE_VIEW", "ROLE_ASSIGN"]).count() == 2

    def test_assign_permissions_to_role_missing_permission_raises(self, hospital_admin_role, hospital_admin_user):
        with pytest.raises(ValidationError, match="Permission not found"):
            assign_permissions_to_role(
                role=hospital_admin_role,
                permission_codes=["UNKNOWN_PERMISSION"],
                actor=hospital_admin_user,
            )

    def test_revoke_permissions_from_role(self, hospital_admin_role, hospital_admin_user):
        permission = Permission.objects.create(code="ROLE_PERMISSION_MANAGE", name="Role Permission Manage")
        assign_permissions_to_role(
            role=hospital_admin_role,
            permission_codes=[permission.code],
            actor=hospital_admin_user,
        )

        result = revoke_permissions_from_role(
            role=hospital_admin_role,
            permission_codes=[permission.code],
        )

        assert result["removed"] == ["ROLE_PERMISSION_MANAGE"]
        assert not hospital_admin_role.permissions.filter(code=permission.code).exists()

    def test_get_effective_permissions_for_user(self, hospital_admin_user, hospital_admin_role):
        from apps.staff.models import HospitalRole, HospitalRolePermission, UserHospitalRole

        permission, _ = Permission.objects.get_or_create(
            code="auth:permission.effective.view",
            defaults={"name": "View Effective Permissions"},
        )
        hospital_role, _ = HospitalRole.objects.get_or_create(
            hospital=hospital_admin_user.staff.hospital,
            name="HEALTHCARE_ADMIN",
            defaults={"description": "Healthcare admin"},
        )
        HospitalRolePermission.objects.get_or_create(
            hospital_role=hospital_role,
            permission=permission,
        )
        UserHospitalRole.objects.update_or_create(
            user=hospital_admin_user,
            defaults={
                "hospital": hospital_admin_user.staff.hospital,
                "hospital_role": hospital_role,
                "assigned_by": None,
            },
        )

        payload = get_effective_permissions_for_user(hospital_admin_user)
        role_name = hospital_admin_role.name

        assert payload["roles"] == [role_name]
        assert "auth:permission.effective.view" in payload["effective_permissions"]
        assert "auth:permission.effective.view" in payload["permissions_by_role"][role_name]
