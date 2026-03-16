"""Cryptographically secure token generation utilities."""
import secrets
import string


def generate_hex_token(byte_length: int = 32) -> str:
    """Generate a URL-safe hex token. 32 bytes → 64 hex characters."""
    return secrets.token_hex(byte_length)


def generate_alphanumeric_token(length: int = 48) -> str:
    """Generate a random alphanumeric token of specified length."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_numeric_otp(length: int = 6) -> str:
    """Generate a numeric OTP of specified length."""
    return "".join(secrets.choice(string.digits) for _ in range(length))
