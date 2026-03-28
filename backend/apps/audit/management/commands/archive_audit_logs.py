"""Archive audit logs older than a configurable number of days."""
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
import datetime


class Command(BaseCommand):
    help = "Archive audit logs older than N days (default: 365)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=365,
            help="Archive logs older than this many days.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many records would be archived without deleting.",
        )

    def handle(self, *args, **options):
        from apps.audit.models import AuditLog

        days = options["days"]
        dry_run = options["dry_run"]

        cutoff = timezone.now() - datetime.timedelta(days=days)
        qs = AuditLog.objects.filter(created_at__lt=cutoff)
        count = qs.count()

        if dry_run:
            self.stdout.write(f"[DRY RUN] Would archive {count} audit log entries older than {days} days.")
            return

        # For a real archive, you'd export to S3/file first; here we just delete
        deleted, _ = qs.delete()
        self.stdout.write(self.style.SUCCESS(f"Archived (deleted) {deleted} audit log entries older than {days} days."))
