"""Integration tests for authentication API endpoints."""
import hashlib

import pytest
from unittest.mock import patch
from rest_framework import status

from apps.authentication.models import PasswordResetToken


@pytest.mark.django_db
class TestLoginView:
    url = "/api/auth/login/"

    def test_login_with_valid_credentials(self, api_client, hospital_admin_user):
        hospital_admin_user.set_password("TestPassword!1")
        hospital_admin_user.save()
        response = api_client.post(
            self.url,
            {"email": hospital_admin_user.email, "password": "TestPassword!1"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert "access" in data["data"]
        assert "refresh" in data["data"]

    def test_login_with_wrong_password(self, api_client, hospital_admin_user):
        response = api_client.post(
            self.url,
            {"email": hospital_admin_user.email, "password": "WrongPassword!"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_with_unknown_email(self, api_client):
        response = api_client.post(
            self.url,
            {"email": "nobody@nowhere.com", "password": "Whatever!1"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_inactive_user(self, api_client, hospital_admin_user):
        hospital_admin_user.is_active = False
        hospital_admin_user.save()
        hospital_admin_user.set_password("TestPassword!1")
        hospital_admin_user.save()
        response = api_client.post(
            self.url,
            {"email": hospital_admin_user.email, "password": "TestPassword!1"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestLogoutView:
    login_url = "/api/auth/login/"
    logout_url = "/api/auth/logout/"

    def _get_tokens(self, api_client, user):
        user.set_password("TestPassword!1")
        user.save()
        resp = api_client.post(
            self.login_url,
            {"email": user.email, "password": "TestPassword!1"},
            format="json",
        )
        return resp.json()["data"]

    def test_logout_blacklists_token(self, api_client, hospital_admin_user):
        tokens = self._get_tokens(api_client, hospital_admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        response = api_client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_logout_without_auth_returns_401(self, api_client, hospital_admin_user):
        response = api_client.post(self.logout_url, {"refresh": "faketoken"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestMeView:
    me_url = "/api/auth/me/"

    def test_authenticated_user_gets_profile(self, auth_client, hospital_admin_user):
        response = auth_client.get(self.me_url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert data["data"]["email"] == hospital_admin_user.email

    def test_unauthenticated_request_returns_401(self, api_client):
        response = api_client.get(self.me_url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestRefreshTokenView:
    login_url = "/api/auth/login/"
    refresh_url = "/api/auth/refresh/"

    def test_refresh_returns_new_access_token(self, api_client, hospital_admin_user):
        hospital_admin_user.set_password("TestPassword!1")
        hospital_admin_user.save()
        login_resp = api_client.post(
            self.login_url,
            {"email": hospital_admin_user.email, "password": "TestPassword!1"},
            format="json",
        ).json()["data"]

        refresh_resp = api_client.post(
            self.refresh_url,
            {"refresh": login_resp["refresh"]},
            format="json",
        )
        assert refresh_resp.status_code == status.HTTP_200_OK
        new_data = refresh_resp.json()
        assert "data" in new_data
        assert "access" in new_data["data"]


@pytest.mark.django_db
class TestPasswordResetRequestView:
    url = "/api/auth/password-reset/"

    @patch("apps.authentication.services.send_email", return_value=True)
    def test_existing_email_returns_200_and_triggers_email(self, mock_send, api_client, hospital_admin_user):
        response = api_client.post(self.url, {"email": hospital_admin_user.email}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert mock_send.called

    @patch("apps.authentication.services.send_email", return_value=True)
    def test_unknown_email_returns_200_without_email_send(self, mock_send, api_client):
        response = api_client.post(self.url, {"email": "unknown@test.com"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert not mock_send.called


@pytest.mark.django_db
class TestPasswordResetConfirmView:
    url = "/api/auth/password-reset/confirm/"

    def _token_hash(self, raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def test_confirm_password_reset_with_valid_token(self, api_client, hospital_admin_user):
        from django.utils import timezone

        raw_token = "reset-live-token"
        token_row = PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=self._token_hash(raw_token),
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )

        response = api_client.post(
            self.url,
            {"token": raw_token, "new_password": "NewPassword!99"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["success"] is True
        hospital_admin_user.refresh_from_db()
        token_row.refresh_from_db()
        assert hospital_admin_user.check_password("NewPassword!99")
        assert token_row.used is True

    def test_confirm_password_with_expired_token_returns_validation_error(self, api_client, hospital_admin_user):
        from django.utils import timezone

        raw_token = "expired-reset-token"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=self._token_hash(raw_token),
            expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )
        response = api_client.post(
            self.url,
            {"token": raw_token, "new_password": "NewPassword!99"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        payload = response.json()
        assert payload["success"] is False
        assert payload["error"]["code"] == "validation_error"
        assert payload["error"]["message"] == "Invalid data submitted."
        assert "token" in payload["error"]["details"]
        assert "expired" in str(payload["error"]["details"]["token"]).lower()

    def test_confirm_password_with_used_token_returns_validation_error(self, api_client, hospital_admin_user):
        from django.utils import timezone

        raw_token = "used-reset-token"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=self._token_hash(raw_token),
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
            used=True,
            used_at=timezone.now(),
        )
        response = api_client.post(
            self.url,
            {"token": raw_token, "new_password": "NewPassword!99"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        payload = response.json()
        assert payload["success"] is False
        assert payload["error"]["code"] == "validation_error"
        assert payload["error"]["message"] == "Invalid data submitted."
        assert "token" in payload["error"]["details"]
        assert "already been used" in str(payload["error"]["details"]["token"]).lower()


@pytest.mark.django_db
class TestResetPasswordValidateEndpoint:
    url = "/api/auth/reset-password/validate"

    def _token_hash(self, raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def test_validate_returns_valid_true_for_live_token(self, api_client, hospital_admin_user):
        from django.utils import timezone

        raw_token = "validate-live-token"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=self._token_hash(raw_token),
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )
        response = api_client.get(self.url, {"token": raw_token})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["valid"] is True

    def test_validate_returns_token_invalid(self, api_client):
        response = api_client.get(self.url, {"token": "missing-token"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["error"]["code"] == "TOKEN_INVALID"


@pytest.mark.django_db
class TestResetPasswordEndpoint:
    url = "/api/auth/reset-password"

    def _token_hash(self, raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def test_reset_password_success(self, api_client, hospital_admin_user):
        from django.utils import timezone

        raw_token = "reset-live-token-v2"
        token_row = PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=self._token_hash(raw_token),
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )
        response = api_client.post(
            self.url,
            {"token": raw_token, "newPassword": "NewPassword!99"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        hospital_admin_user.refresh_from_db()
        token_row.refresh_from_db()
        assert hospital_admin_user.check_password("NewPassword!99")
        assert token_row.used is True

    def test_reset_password_returns_token_expired(self, api_client, hospital_admin_user):
        from django.utils import timezone

        raw_token = "expired-reset-token-v2"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=self._token_hash(raw_token),
            expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )
        response = api_client.post(
            self.url,
            {"token": raw_token, "newPassword": "NewPassword!99"},
            format="json",
        )
        assert response.status_code == status.HTTP_410_GONE
        assert response.json()["error"]["code"] == "TOKEN_EXPIRED"

    def test_reset_password_returns_token_already_used(self, api_client, hospital_admin_user):
        from django.utils import timezone

        raw_token = "used-reset-token-v2"
        PasswordResetToken.objects.create(
            user=hospital_admin_user,
            token_hash=self._token_hash(raw_token),
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
            used=True,
            used_at=timezone.now(),
        )
        response = api_client.post(
            self.url,
            {"token": raw_token, "newPassword": "NewPassword!99"},
            format="json",
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.json()["error"]["code"] == "TOKEN_ALREADY_USED"
