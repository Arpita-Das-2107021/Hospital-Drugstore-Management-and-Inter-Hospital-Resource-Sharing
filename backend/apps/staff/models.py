"""Staff domain models: Staff profile, Role, UserRole join, Invitation."""
import uuid

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone


class Role(models.Model):
    """
    System-defined roles.  Seeded via management command seed_roles.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "staff_role"

    def __str__(self) -> str:
        return self.name


class Staff(models.Model):
    """
    Staff profile — linked 1-to-1 with a UserAccount after the invitation is
    accepted.  Before acceptance the record exists with user=None.
    """

    class EmploymentStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        SUSPENDED = "suspended", "Suspended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="staff_members",
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_members",
    )
    email = models.EmailField(blank=True, default="", db_index=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    employee_id = models.CharField(max_length=50, blank=True)
    department = models.CharField(max_length=100, blank=True)
    position = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    employment_status = models.CharField(
        max_length=20,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_staff"
        unique_together = [("hospital", "employee_id")]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.hospital})"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class UserRole(models.Model):
    """
    Through-table: UserAccount ↔ Role with optional hospital scoping.
    Used as the AUTH_USER_MODEL roles M2M through model.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="user_roles",
    )
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="user_roles")
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="staff_roles",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_roles",
    )

    class Meta:
        db_table = "staff_userrole"
        unique_together = [("user", "role", "hospital")]

    def __str__(self) -> str:
        return f"{self.user} → {self.role} @ {self.hospital}"


class Invitation(models.Model):
    """
    Email invitation for new staff members.  The token is single-use and
    expires after INVITATION_EXPIRY_HOURS hours.
    """

    EXPIRY_HOURS = 72

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    staff = models.OneToOneField(
        Staff,
        on_delete=models.CASCADE,
        related_name="invitation",
        null=True,
        blank=True,
    )
    email = models.EmailField()
    token = models.CharField(max_length=128, unique=True)
    role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitations",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()
    invited_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_invitations",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_invitation"

    def __str__(self) -> str:
        return f"Invitation({self.email}, {self.status})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at
