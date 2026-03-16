"""Repository layer for authentication persistence operations."""
from django.utils import timezone

from .models import PasswordResetToken, UserAccount


class PasswordResetTokenRepository:
    @staticmethod
    def get_active_user_by_email(email: str) -> UserAccount | None:
        return UserAccount.objects.filter(email=email, is_active=True).first()

    @staticmethod
    def invalidate_user_tokens(user: UserAccount) -> int:
        return PasswordResetToken.objects.filter(user=user, used=False).update(
            used=True,
            used_at=timezone.now(),
        )

    @staticmethod
    def create_token(user: UserAccount, token_hash: str, expires_at):
        return PasswordResetToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=expires_at,
        )

    @staticmethod
    def get_by_token_hash(token_hash: str) -> PasswordResetToken | None:
        return PasswordResetToken.objects.select_related("user").filter(token_hash=token_hash).first()

    @staticmethod
    def invalidate_other_tokens(user: UserAccount, token_id) -> int:
        return PasswordResetToken.objects.filter(user=user, used=False).exclude(id=token_id).update(
            used=True,
            used_at=timezone.now(),
        )
