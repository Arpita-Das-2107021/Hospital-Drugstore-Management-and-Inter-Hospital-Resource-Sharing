"""Encryption helpers for chat message bodies at rest."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


_ENCRYPTED_PREFIX = "enc::"


def _derive_key_from_secret(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _resolve_chat_encryption_key() -> bytes:
    configured = (
        getattr(settings, "CHAT_MESSAGE_ENCRYPTION_KEY", "")
        or getattr(settings, "API_CONFIG_ENCRYPTION_KEY", "")
        or ""
    )
    if configured:
        raw = configured.encode() if isinstance(configured, str) else configured
        try:
            Fernet(raw)
            return raw
        except Exception:
            # Some deployments provide a plain secret (not a Fernet key).
            # Derive a stable valid key from that secret to avoid runtime failures.
            normalized = configured.decode(errors="ignore") if isinstance(configured, (bytes, bytearray)) else str(configured)
            return _derive_key_from_secret(normalized)

    # Safe fallback for local/test environments; production should provide a dedicated key.
    return _derive_key_from_secret(settings.SECRET_KEY)


def _fernet() -> Fernet:
    return Fernet(_resolve_chat_encryption_key())


def encrypt_chat_message(plaintext: str) -> str:
    ciphertext = _fernet().encrypt((plaintext or "").encode()).decode()
    return f"{_ENCRYPTED_PREFIX}{ciphertext}"


def decrypt_chat_message(ciphertext: str) -> str:
    raw = ciphertext or ""
    if not raw.startswith(_ENCRYPTED_PREFIX):
        raise ValueError("Chat message body is not encrypted with the expected prefix.")
    token = raw[len(_ENCRYPTED_PREFIX) :]
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt chat message body.") from exc


def decrypt_chat_message_best_effort(value: str) -> str:
    raw = value or ""
    if not raw:
        return ""
    if not raw.startswith(_ENCRYPTED_PREFIX):
        return raw
    try:
        return decrypt_chat_message(raw)
    except ValueError:
        # Keep service resilient even if key changes for legacy values.
        return ""


def is_chat_message_encrypted(value: str) -> bool:
    return bool(value and value.startswith(_ENCRYPTED_PREFIX))
