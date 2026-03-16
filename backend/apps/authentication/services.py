"""Authentication business logic - keep views thin."""
import hashlib
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.services.email_service import render_email_template, send_email

from .models import PasswordResetToken, UserAccount
from .repositories import PasswordResetTokenRepository

logger = logging.getLogger("hrsp.auth")


class PasswordResetFlowError(Exception):
    def __init__(self, code: str, message: str, status_code: int):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def get_tokens_for_user(user: UserAccount) -> dict:
    """Generate access + refresh JWT pair for the given user."""
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def logout_user(refresh_token_str: str) -> None:
    """Blacklist the provided refresh token."""
    try:
        token = RefreshToken(refresh_token_str)
        token.blacklist()
    except Exception:
        pass


def initiate_password_reset(
    email: str,
    *,
    subject: str = "HRSP - Password Reset Request",
    template_name: str = "password_reset.txt",
    template_context: dict | None = None,
) -> None:
    """
    Generate a password reset token and queue the email.
    Deliberately does NOT raise an error if email not found (prevents enumeration).
    """
    user = PasswordResetTokenRepository.get_active_user_by_email(email)
    if not user:
        logger.info("Password reset requested for unknown email: %s", email)
        return

    PasswordResetTokenRepository.invalidate_user_tokens(user)

    token_value = get_random_string(64)
    PasswordResetTokenRepository.create_token(
        user=user,
        token_hash=_hash_reset_token(token_value),
        expires_at=timezone.now() + timedelta(minutes=15),
    )

    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token_value}"
    context = {
        "reset_url": reset_url,
        "expires_in": "15 minutes",
    }
    if template_context:
        context.update(template_context)

    message = render_email_template(template_name, context)
    sent = send_email(
        subject=subject,
        message=message,
        recipient_list=[user.email],
    )
    if not sent:
        logger.warning("Password reset email delivery failed for %s", email)
    logger.info("Password reset email processed for %s", email)


def validate_password_reset_token(token_value: str) -> PasswordResetToken:
    token_hash = _hash_reset_token(token_value)
    reset_token = PasswordResetTokenRepository.get_by_token_hash(token_hash)
    if not reset_token:
        raise PasswordResetFlowError(
            code="TOKEN_INVALID",
            message="The reset token is invalid.",
            status_code=400,
        )

    if reset_token.used:
        raise PasswordResetFlowError(
            code="TOKEN_ALREADY_USED",
            message="The reset token has already been used.",
            status_code=409,
        )

    if reset_token.expires_at <= timezone.now():
        raise PasswordResetFlowError(
            code="TOKEN_EXPIRED",
            message="The reset token has expired.",
            status_code=410,
        )

    return reset_token


def confirm_password_reset(token_value: str, new_password: str) -> None:
    """Validate token and set the new password."""
    try:
        reset_token = validate_password_reset_token(token_value)
    except PasswordResetFlowError as exc:
        raise ValidationError({"token": exc.message})

    user = reset_token.user
    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as exc:
        raise ValidationError({"password": list(exc.messages)})

    user.set_password(new_password)
    user.save(update_fields=["password"])

    reset_token.used = True
    reset_token.used_at = timezone.now()
    reset_token.save(update_fields=["used", "used_at"])

    PasswordResetTokenRepository.invalidate_other_tokens(user, reset_token.id)

    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken  # noqa: PLC0415

    for outstanding in OutstandingToken.objects.filter(user=user):
        try:
            outstanding.blacklistedtoken
        except Exception:
            RefreshToken(outstanding.token).blacklist()

    logger.info("Password reset completed for user %s", user.id)


def change_password(user: UserAccount, current_password: str, new_password: str) -> None:
    """Change password after verifying current password."""
    if not user.check_password(current_password):
        raise AuthenticationFailed("Current password is incorrect.")
    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as exc:
        raise ValidationError({"new_password": list(exc.messages)})
    user.set_password(new_password)
    user.save(update_fields=["password"])
    logger.info("Password changed for user %s", user.id)
