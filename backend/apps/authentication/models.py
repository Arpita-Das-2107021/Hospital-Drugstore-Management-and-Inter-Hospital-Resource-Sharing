"""
Authentication models.

UserAccount is the Django AUTH_USER_MODEL.
It uses the staff email as username and links 1-to-1 with Staff.
"""
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower


class UserAccountManager(BaseUserManager):
    def create_user(self, email: str, password: str = None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        if self.model.objects.filter(email__iexact=email, is_active=True).exists():
            raise ValueError("An active account with this email already exists.")
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def get_by_natural_key(self, username):
        """
        Resolve logins against the currently active account first.
        This prevents MultipleObjectsReturned when historical inactive accounts
        retain the same email for audit purposes.
        """
        normalized = self.normalize_email(username)
        active_user = self.filter(email__iexact=normalized, is_active=True).order_by("-created_at").first()
        if active_user:
            return active_user

        fallback_user = self.filter(email__iexact=normalized).order_by("-created_at").first()
        if fallback_user:
            return fallback_user

        raise self.model.DoesNotExist

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class UserAccount(AbstractBaseUser, PermissionsMixin):
    """Login account — separate from Staff identity record."""

    class ContextDomain(models.TextChoices):
        HEALTHCARE = "HEALTHCARE", "Healthcare"
        PLATFORM = "PLATFORM", "Platform"

    class AccessMode(models.TextChoices):
        UI = "UI", "UI Client"
        API = "API", "API Client"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # staff is set after the Staff record is created; nullable during creation
    staff = models.OneToOneField(
        "staff.Staff",
        on_delete=models.CASCADE,
        related_name="user_account",
        null=True,
        blank=True,
    )

    email = models.EmailField(db_index=True)
    profile_picture = models.ImageField(upload_to="users/profile-pictures/", null=True, blank=True)
    # Domain context controls where the user belongs (healthcare vs platform).
    context_domain = models.CharField(
        max_length=20,
        choices=ContextDomain.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    # Access mode controls how the user/client interacts (UI vs API).
    access_mode = models.CharField(
        max_length=10,
        choices=AccessMode.choices,
        default=AccessMode.UI,
        db_index=True,
    )
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
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=Q(is_active=True),
                name="uniq_auth_user_email_active_ci",
            ),
        ]

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

    def get_healthcare_id(self):
        """Forward-compatible alias for hospital context identifier."""
        return self.get_hospital_id()

    def get_context_domain(self) -> str | None:
        valid_contexts = {choice for choice, _ in self.ContextDomain.choices}
        explicit = str(self.context_domain or "").strip().upper()
        if explicit in valid_contexts:
            return explicit

        if self.get_hospital_id():
            return self.ContextDomain.HEALTHCARE

        try:
            hospital_assignment = self.hospital_role_assignment
        except Exception:
            hospital_assignment = None
        if hospital_assignment and getattr(hospital_assignment, "hospital_id", None):
            return self.ContextDomain.HEALTHCARE

        if self.platform_role_assignments.filter(platform_role__is_active=True).exists():
            return self.ContextDomain.PLATFORM

        if self.has_platform_role("SUPER_ADMIN", "PLATFORM_ADMIN"):
            return self.ContextDomain.PLATFORM

        return None

    def get_access_mode(self) -> str:
        valid_modes = {choice for choice, _ in self.AccessMode.choices}
        explicit = str(self.access_mode or "").strip().upper()
        if explicit in valid_modes:
            return explicit
        return self.AccessMode.UI

    def has_role(self, *role_names: str) -> bool:
        normalized_names = [name.strip().upper() for name in role_names if name and name.strip()]
        if not normalized_names:
            return False

        if self.platform_role_assignments.filter(
            platform_role__name__in=normalized_names,
            platform_role__is_active=True,
        ).exists():
            return True

        return self.__class__.objects.filter(
            id=self.id,
            hospital_role_assignment__hospital_role__name__in=normalized_names,
            hospital_role_assignment__hospital_role__is_active=True,
        ).exists()

    def has_platform_role(self, *role_names: str) -> bool:
        normalized_names = [name.strip().upper() for name in role_names if name and name.strip()]
        if not normalized_names:
            return False
        return self.platform_role_assignments.filter(
            platform_role__name__in=normalized_names,
            platform_role__is_active=True,
        ).exists()

    def has_hospital_role(self, *role_names: str) -> bool:
        normalized_names = [name.strip().upper() for name in role_names if name and name.strip()]
        if not normalized_names:
            return False
        return self.__class__.objects.filter(
            id=self.id,
            hospital_role_assignment__hospital_role__name__in=normalized_names,
            hospital_role_assignment__hospital_role__is_active=True,
        ).exists()

    def get_platform_role_names(self) -> list[str]:
        return sorted(
            set(
                self.platform_role_assignments.filter(platform_role__is_active=True).values_list(
                    "platform_role__name",
                    flat=True,
                )
            )
        )

    def get_hospital_role_name(self) -> str | None:
        assignment = self.__class__.objects.filter(id=self.id).values_list(
            "hospital_role_assignment__hospital_role__name",
            flat=True,
        ).first()
        return assignment

    def get_all_role_names(self) -> list[str]:
        platform_roles = set(self.get_platform_role_names())
        hospital_role = self.get_hospital_role_name()
        if hospital_role:
            platform_roles.add(hospital_role)
        return sorted(platform_roles)

    def has_permission_code(self, *permission_codes: str) -> bool:
        """Check if the user has any effective permission code."""
        normalized_codes = [code.strip() for code in permission_codes if code and code.strip()]
        if not normalized_codes:
            return False

        if self.platform_role_assignments.filter(
            platform_role__is_active=True,
            platform_role__role_permissions__permission__code__in=normalized_codes,
            platform_role__role_permissions__permission__is_active=True,
        ).exists():
            return True

        if self.__class__.objects.filter(
            id=self.id,
            hospital_role_assignment__hospital_role__is_active=True,
            hospital_role_assignment__hospital_role__role_permissions__permission__code__in=normalized_codes,
            hospital_role_assignment__hospital_role__role_permissions__permission__is_active=True,
        ).exists():
            return True

        # Extension point: optional future direct user-level permissions relation.
        direct_permissions = getattr(self, "direct_permissions", None)
        if direct_permissions is not None:
            return direct_permissions.filter(code__in=normalized_codes, is_active=True).exists()

        return False

    def get_effective_permission_codes(self) -> list[str]:
        role_codes = set(
            self.platform_role_assignments.filter(
                platform_role__is_active=True,
                platform_role__role_permissions__permission__is_active=True,
            )
            .values_list("platform_role__role_permissions__permission__code", flat=True)
            .exclude(platform_role__role_permissions__permission__code__isnull=True)
        )

        role_codes.update(
            self.__class__.objects.filter(
                id=self.id,
                hospital_role_assignment__hospital_role__is_active=True,
                hospital_role_assignment__hospital_role__role_permissions__permission__is_active=True,
            )
            .values_list("hospital_role_assignment__hospital_role__role_permissions__permission__code", flat=True)
            .exclude(hospital_role_assignment__hospital_role__role_permissions__permission__code__isnull=True)
        )

        direct_permissions = getattr(self, "direct_permissions", None)
        if direct_permissions is not None:
            role_codes.update(
                direct_permissions.filter(is_active=True).values_list("code", flat=True)
            )

        return sorted(role_codes)

    def get_authorization_role_snapshot(self) -> dict:
        return {
            "platform_roles": self.get_platform_role_names(),
            "hospital_role": self.get_hospital_role_name(),
            "all_roles": self.get_all_role_names(),
        }

    def has_any_role_or_permission(
        self,
        *,
        role_names: tuple[str, ...] = (),
        permission_codes: tuple[str, ...] = (),
    ) -> bool:
        if role_names and self.has_role(*role_names):
            return True
        if permission_codes and self.has_permission_code(*permission_codes):
            return True
        return False


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
