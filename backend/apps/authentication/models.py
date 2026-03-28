"""
Authentication models.

UserAccount is the Django AUTH_USER_MODEL.
It uses the staff email as username and links 1-to-1 with Staff.
"""
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserAccountManager(BaseUserManager):
    def create_user(self, email: str, password: str = None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class UserAccount(AbstractBaseUser, PermissionsMixin):
    """Login account — separate from Staff identity record."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # staff is set after the Staff record is created; nullable during creation
    staff = models.OneToOneField(
        "staff.Staff",
        on_delete=models.CASCADE,
        related_name="user_account",
        null=True,
        blank=True,
    )

    email = models.EmailField(unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin access

    # Role relationship (many-to-many via UserRole)
    # through_fields required because UserRole has two FKs to UserAccount (user + assigned_by)
    roles = models.ManyToManyField(
        "staff.Role",
        through="staff.UserRole",
        through_fields=("user", "role"),
        related_name="user_accounts",
        blank=True,
    )

    # Security
    failed_login_count = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserAccountManager()

    class Meta:
        db_table = "auth_user_account"
        verbose_name = "User Account"
        verbose_name_plural = "User Accounts"

    def __str__(self):
        return self.email

    def get_full_name(self) -> str:
        if self.staff:
            return f"{self.staff.first_name} {self.staff.last_name}"
        return self.email

    def get_hospital_id(self):
        if self.staff:
            return self.staff.hospital_id
        return None

    def has_role(self, *role_names: str) -> bool:
        return self.roles.filter(name__in=role_names).exists()


class PasswordResetToken(models.Model):
    """Single-use password reset token."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "auth_password_reset_token"

    def __str__(self):
        return f"PasswordResetToken({self.user.email})"
