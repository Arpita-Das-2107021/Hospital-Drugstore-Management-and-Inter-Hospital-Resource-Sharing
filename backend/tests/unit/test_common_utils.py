"""Unit tests for common utilities: encryption, validators, lockout, audit service."""
import pytest
from unittest.mock import MagicMock

# A valid Fernet key for tests
VALID_FERNET_KEY = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY="


# ---------------------------------------------------------------------------
# Encryption utilities
# ---------------------------------------------------------------------------
class TestEncryptionUtils:
    def test_encrypt_returns_string(self, settings):
        settings.API_CONFIG_ENCRYPTION_KEY = VALID_FERNET_KEY
        from common.utils.encryption import encrypt_value
        result = encrypt_value("my-secret-token")
        assert isinstance(result, str)
        assert result != "my-secret-token"

    def test_decrypt_roundtrip(self, settings):
        settings.API_CONFIG_ENCRYPTION_KEY = VALID_FERNET_KEY
        from common.utils.encryption import decrypt_value, encrypt_value
        plaintext = "super-secret-api-key-12345"
        ciphertext = encrypt_value(plaintext)
        assert decrypt_value(ciphertext) != ciphertext
        assert decrypt_value(ciphertext) == plaintext

    def test_decrypt_invalid_token_raises(self, settings):
        settings.API_CONFIG_ENCRYPTION_KEY = VALID_FERNET_KEY
        from common.utils.encryption import decrypt_value
        with pytest.raises(ValueError, match="Failed to decrypt"):
            decrypt_value("this-is-not-valid-fernet-data-but-long-enough-to-parse==")

    def test_encrypt_empty_string(self, settings):
        settings.API_CONFIG_ENCRYPTION_KEY = VALID_FERNET_KEY
        from common.utils.encryption import decrypt_value, encrypt_value
        ciphertext = encrypt_value("")
        assert decrypt_value(ciphertext) == ""

    def test_different_encryptions_of_same_value(self, settings):
        """Fernet produces different ciphertexts each time (uses random IV)."""
        settings.API_CONFIG_ENCRYPTION_KEY = VALID_FERNET_KEY
        from common.utils.encryption import encrypt_value
        c1 = encrypt_value("same-value")
        c2 = encrypt_value("same-value")
        assert c1 != c2  # nondeterministic


# ---------------------------------------------------------------------------
# Validator utilities
# ---------------------------------------------------------------------------
class TestValidatorUtils:
    def test_validate_future_datetime_past_raises(self):
        from django.utils import timezone
        from common.utils.validators import validate_future_datetime
        past = timezone.now() - timezone.timedelta(hours=1)
        with pytest.raises(ValueError, match="must be in the future"):
            validate_future_datetime(past)

    def test_validate_future_datetime_future_ok(self):
        from django.utils import timezone
        from common.utils.validators import validate_future_datetime
        future = timezone.now() + timezone.timedelta(hours=1)
        # Should not raise
        validate_future_datetime(future)

    def test_validate_future_datetime_none_ok(self):
        from common.utils.validators import validate_future_datetime
        # None should not raise
        validate_future_datetime(None)

    def test_validate_positive_integer_zero_raises(self):
        from common.utils.validators import validate_positive_integer
        with pytest.raises(ValueError, match="must be a positive integer"):
            validate_positive_integer(0)

    def test_validate_positive_integer_negative_raises(self):
        from common.utils.validators import validate_positive_integer
        with pytest.raises(ValueError, match="must be a positive integer"):
            validate_positive_integer(-5)

    def test_validate_positive_integer_positive_ok(self):
        from common.utils.validators import validate_positive_integer
        # Should not raise
        validate_positive_integer(1)
        validate_positive_integer(999)

    def test_validate_positive_integer_none_ok(self):
        from common.utils.validators import validate_positive_integer
        # None should not raise
        validate_positive_integer(None)


# ---------------------------------------------------------------------------
# Lockout response
# ---------------------------------------------------------------------------
class TestLockoutResponse:
    def test_returns_json_response(self):
        from django.test import RequestFactory
        from common.utils.lockout import lockout_response
        factory = RequestFactory()
        request = factory.post("/api/auth/login")
        response = lockout_response(request, credentials={})
        assert response.status_code == 429
        import json
        data = json.loads(response.content)
        assert data["error"]["code"] == "account_locked"


# ---------------------------------------------------------------------------
# Audit service
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestAuditService:
    def test_write_audit_log_creates_entry(self):
        from apps.audit.services import write_audit_log
        entry = write_audit_log(
            event_type="TEST_EVENT",
            object_type="TestModel",
            ip_address="127.0.0.1",
        )
        assert entry is not None
        assert entry.pk is not None
        assert entry.event_type == "TEST_EVENT"

    def test_write_audit_log_with_actor(self, super_admin_user):
        from apps.audit.services import write_audit_log
        entry = write_audit_log(
            event_type="LOGIN",
            actor=super_admin_user,
            ip_address="10.0.0.1",
        )
        assert entry.actor == super_admin_user

    def test_write_audit_log_absorbs_errors(self, monkeypatch):
        """Errors inside write_audit_log must be swallowed and return None."""
        from apps.audit import services as audit_services
        from apps.audit.models import AuditLog

        def raise_on_save(self):
            raise RuntimeError("DB is down")

        monkeypatch.setattr(AuditLog, "save", raise_on_save)
        result = audit_services.write_audit_log(event_type="FAIL_EVENT")
        assert result is None

    def test_write_audit_log_from_request_authenticated(self, super_admin_user):
        from django.test import RequestFactory
        from apps.audit.services import write_audit_log_from_request
        factory = RequestFactory()
        request = factory.get("/api/v1/hospitals/")
        request.user = super_admin_user
        request.META["REMOTE_ADDR"] = "192.168.1.1"
        entry = write_audit_log_from_request(request, "VIEW_LIST")
        assert entry is not None
        assert entry.actor == super_admin_user

    def test_write_audit_log_from_request_anonymous(self):
        from unittest.mock import MagicMock
        from apps.audit.services import write_audit_log_from_request

        request = MagicMock()
        request.user.is_authenticated = False
        request.META = {"REMOTE_ADDR": "10.0.0.1"}
        # Remove audit_ip / audit_user_agent attributes so the hasattr/getattr fallback is used
        del request.audit_ip
        del request.audit_user_agent
        entry = write_audit_log_from_request(request, "ANON_ACTION")
        assert entry is not None
        assert entry.actor is None
