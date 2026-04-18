"""Staff domain models: identity, legacy roles, and dual-scope RBAC."""
import uuid

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Role(models.Model):
    """
    System-defined roles. Seeded via management command seed_rbac.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(
        "staff.Permission",
        through="staff.RolePermission",
        through_fields=("role", "permission"),
        related_name="roles",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "staff_role"

    def __str__(self) -> str:
        return self.name


class Permission(models.Model):
    """Granular permission assigned to roles via RolePermission."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(
        max_length=100,
        unique=True,
        validators=[
            RegexValidator(
                r"^(?:[A-Z][A-Z0-9_]*|[a-z][a-z0-9]*(?::[a-z][a-z0-9]*)?(?:\.[a-z][a-z0-9]*)*)$",
                "Use UPPER_SNAKE_CASE (legacy) or namespaced lowercase (e.g. platform:role.assign).",
            )
        ],
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_permission"
        indexes = [
            models.Index(fields=["is_active"]),
        ]

    def __str__(self) -> str:
        return self.code


class RolePermission(models.Model):
    """Through-table: Role ↔ Permission mapping."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name="role_permissions",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_role_permissions",
    )

    class Meta:
        db_table = "staff_role_permission"
        constraints = [
            models.UniqueConstraint(fields=["role", "permission"], name="uniq_staff_role_permission"),
        ]
        indexes = [
            models.Index(fields=["role", "permission"]),
            models.Index(fields=["permission", "role"]),
        ]

    def __str__(self) -> str:
        return f"{self.role.name} -> {self.permission.code}"


class PlatformRole(models.Model):
    """Platform-wide role definitions shared across hospitals."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(
        max_length=50,
        unique=True,
        validators=[RegexValidator(r"^[A-Z][A-Z0-9_]*$", "Use UPPER_SNAKE_CASE (e.g. PLATFORM_ADMIN).")],
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_role"
        indexes = [models.Index(fields=["is_active"])]

    def __str__(self) -> str:
        return self.name


class PlatformRolePermission(models.Model):
    """Platform role to permission mapping."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    platform_role = models.ForeignKey(
        PlatformRole,
        on_delete=models.CASCADE,
        related_name="role_permissions",
    )
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name="platform_role_permissions",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_platform_role_permissions",
    )

    class Meta:
        db_table = "platform_role_permission"
        constraints = [
            models.UniqueConstraint(
                fields=["platform_role", "permission"],
                name="uniq_platform_role_permission",
            ),
        ]
        indexes = [
            models.Index(fields=["platform_role", "permission"]),
            models.Index(fields=["permission", "platform_role"]),
        ]

    def __str__(self) -> str:
        return f"{self.platform_role.name} -> {self.permission.code}"


class UserPlatformRole(models.Model):
    """Platform roles directly assigned to users."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="platform_role_assignments",
    )
    platform_role = models.ForeignKey(
        PlatformRole,
        on_delete=models.CASCADE,
        related_name="user_assignments",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_platform_roles",
    )

    class Meta:
        db_table = "user_platform_role"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "platform_role"],
                name="uniq_user_platform_role",
            )
        ]
        indexes = [models.Index(fields=["user", "platform_role"])]

    def __str__(self) -> str:
        return f"{self.user_id} -> {self.platform_role.name}"


class HospitalRole(models.Model):
    """Hospital-owned role definitions scoped to a single hospital."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="hospital_roles",
    )
    name = models.CharField(
        max_length=50,
        validators=[RegexValidator(r"^[A-Z][A-Z0-9_]*$", "Use UPPER_SNAKE_CASE (e.g. PHARMACY_MANAGER).")],
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital_role"
        constraints = [
            models.UniqueConstraint(fields=["hospital", "name"], name="uniq_hospital_role_name"),
        ]
        indexes = [
            models.Index(fields=["hospital", "is_active"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} @ {self.hospital_id}"


class HospitalRolePermission(models.Model):
    """Hospital role to permission mapping."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital_role = models.ForeignKey(
        HospitalRole,
        on_delete=models.CASCADE,
        related_name="role_permissions",
    )
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name="hospital_role_permissions",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_hospital_role_permissions",
    )

    class Meta:
        db_table = "hospital_role_permission"
        constraints = [
            models.UniqueConstraint(
                fields=["hospital_role", "permission"],
                name="uniq_hospital_role_permission",
            ),
        ]
        indexes = [
            models.Index(fields=["hospital_role", "permission"]),
            models.Index(fields=["permission", "hospital_role"]),
        ]

    def __str__(self) -> str:
        return f"{self.hospital_role.name} -> {self.permission.code}"


class UserHospitalRole(models.Model):
    """Single hospital-scoped role assignment per user."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        "authentication.UserAccount",
        on_delete=models.CASCADE,
        related_name="hospital_role_assignment",
    )
    hospital_role = models.ForeignKey(
        HospitalRole,
        on_delete=models.CASCADE,
        related_name="user_assignments",
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="user_hospital_roles",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_user_hospital_roles",
    )

    class Meta:
        db_table = "user_hospital_role"
        indexes = [
            models.Index(fields=["hospital", "hospital_role"]),
            models.Index(fields=["user"]),
        ]

    def clean(self):
        if not self.user_id or not self.hospital_id or not self.hospital_role_id:
            return

        try:
            user_hospital_id = self.user.staff.hospital_id
        except Exception as exc:
            raise ValidationError({"user": "User must be linked to staff and hospital."}) from exc

        if user_hospital_id != self.hospital_id:
            raise ValidationError({"hospital": "User hospital must match assignment hospital."})

        if self.hospital_role.hospital_id != self.hospital_id:
            raise ValidationError({"hospital_role": "Hospital role must belong to assignment hospital."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.user_id} -> {self.hospital_role.name} @ {self.hospital_id}"


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
        constraints = [
            models.UniqueConstraint(
                fields=["hospital", "employee_id"],
                condition=Q(employment_status="active") & ~Q(employee_id=""),
                name="uniq_active_staff_employee_per_hospital",
            ),
        ]

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
