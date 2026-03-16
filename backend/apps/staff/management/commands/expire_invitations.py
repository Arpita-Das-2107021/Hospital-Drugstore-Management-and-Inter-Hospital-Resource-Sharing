"""Expire pending invitations that have passed their expiry date."""
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Mark expired pending invitations."

    def handle(self, *args, **options):
        from apps.staff.models import Invitation

        expired = Invitation.objects.filter(
            status=Invitation.Status.PENDING,
            expires_at__lt=timezone.now(),
        )
        count = expired.update(status=Invitation.Status.EXPIRED)
        self.stdout.write(self.style.SUCCESS(f"Expired {count} pending invitation(s)."))
