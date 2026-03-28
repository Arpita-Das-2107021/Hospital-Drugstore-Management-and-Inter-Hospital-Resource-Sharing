"""Unit tests for authentication services."""
import hashlib

import pytest
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, ValidationError

from apps.authentication.models import PasswordResetToken
from apps.authentication.services import (
    PasswordResetFlowError,
    change_password,
    confirm_password_reset,
    get_tokens_for_user,
    initiate_password_reset,
    validate_password_reset_token,
)


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


@pytest.mark.django_db
class TestGetTokensForUser:
    def test_returns_access_and_refresh(self, hospital_admin_user):
        tokens = get_tokens_for_user(hospital_admin_user)
        assert "access" in tokens
        assert "refresh" in tokens
        assert isinstance(tokens["access"], str)
        assert isinstance(tokens["refresh"], str)

    def test_tokens_are_non_empty_strings(self, hospital_admin_user):
        tokens = get_tokens_for_user(hospital_admin_user)
        assert len(tokens["access"]) > 20
        assert len(tokens["refresh"]) > 20


@pytest.mark.django_db
class TestInitiatePasswordReset:
    def test_creates_token_for_existing_user(self, hospital_admin_user):
        initiate_password_reset(hospital_admin_user.email)
        token = PasswordResetToken.objects.filter(user=hospital_admin_user, used=False).first()
        assert token is not None

    def test_no_error_for_unknown_email(self):
        initiate_password_reset("nonexistent@nowhere.com")

    def test_invalidates_old_tokens(self, hospital_admin_user):
        initiate_password_reset(hospital_admin_user.email)
        initiate_password_reset(hospital_admin_user.email)
        active_count = PasswordResetToken.objects.filter(user=hospital_admin_user, used=False).count()
        assert active_count == 1

    def test_password_reset_sends_email_for_existing_user(self, hospital_admin_user, mocker):
        mocked_send = mocker.patch("apps.authentication.services.send_email", return_value=True)
        initiate_password_reset(hospital_admin_user.email)
        assert mocked_send.called

    def test_password_reset_unknown_email_does_not_send(self, mocker):
        mocked_send = mocker.patch("apps.authentication.services.send_email", return_value=True)
        initiate_password_reset("missing.user@example.com")
        assert not mocked_send.called

    def test_stores_hashed_token_not_raw_value(self, hospital_admin_user):
        initiate_password_reset(hospital_admin_user.email)
        token = PasswordResetToken.objects.filter(user=hospital_admin_user).latest("created_at")
        assert len(token.token_hash) == 64
        assert all(ch in "0123456789abcdef" for ch in token.token_hash)

    def test_token_expiry_set_to_15_minutes(self, hospital_admin_user):
        before = timezone.now()
        initiate_password_reset(hospital_admin_user.email)
        token = PasswordResetToken.objects.filter(user=hospital_admin_user).latest("created_at")
        delta_seconds = (token.expires_at - before).total_seconds()
        assert 14 * 60 <= delta_seconds <= 15 * 60 + 10


@pytest.mark.django_db
class TestConfirmPasswordReset:
    def test_valid_token_resets_password(self, hospital_admin_user):
        raw_token = "validresettoken123"
        token = PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=_hash_token(raw_token),
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        confirm_password_reset(raw_token, "NewSecurePass!99")
        hospital_admin_user.refresh_from_db()
        token.refresh_from_db()
        assert hospital_admin_user.check_password("NewSecurePass!99")
        assert token.used is True

    def test_invalid_token_raises(self):
        with pytest.raises(ValidationError):
            confirm_password_reset("fakeinvalidtoken", "NewPass!99")

    def test_expired_token_raises(self, hospital_admin_user):
        raw_token = "expiredtoken456"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=_hash_token(raw_token),
            expires_at=timezone.now() - timezone.timedelta(hours=1),
        )
        with pytest.raises(ValidationError):
            confirm_password_reset(raw_token, "NewPass!99")

    def test_token_marked_used_after_reset(self, hospital_admin_user):
        raw_token = "usedtoken789"
        token = PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=_hash_token(raw_token),
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        confirm_password_reset(raw_token, "NewSecurePass!99")
        token.refresh_from_db()
        assert token.used is True
        assert token.used_at is not None


@pytest.mark.django_db
class TestValidatePasswordResetToken:
    def test_invalid_token_error_code(self):
        with pytest.raises(PasswordResetFlowError) as exc:
            validate_password_reset_token("missing-token")
        assert exc.value.code == "TOKEN_INVALID"

    def test_expired_token_error_code(self, hospital_admin_user):
        raw_token = "expired-validate-token"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=_hash_token(raw_token),
            expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )
        with pytest.raises(PasswordResetFlowError) as exc:
            validate_password_reset_token(raw_token)
        assert exc.value.code == "TOKEN_EXPIRED"

    def test_used_token_error_code(self, hospital_admin_user):
        raw_token = "used-validate-token"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=_hash_token(raw_token),
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
            used=True,
            used_at=timezone.now(),
        )
        with pytest.raises(PasswordResetFlowError) as exc:
            validate_password_reset_token(raw_token)
        assert exc.value.code == "TOKEN_ALREADY_USED"


@pytest.mark.django_db
class TestChangePassword:
    def test_correct_current_password(self, hospital_admin_user):
        original_pass = "TestPassword!1"
        hospital_admin_user.set_password(original_pass)
        hospital_admin_user.save()
        change_password(hospital_admin_user, original_pass, "NewPassword!99")
        hospital_admin_user.refresh_from_db()
        assert hospital_admin_user.check_password("NewPassword!99")

    def test_wrong_current_password_raises(self, hospital_admin_user):
        with pytest.raises(AuthenticationFailed):
            change_password(hospital_admin_user, "WrongPassword!", "NewPassword!99")
