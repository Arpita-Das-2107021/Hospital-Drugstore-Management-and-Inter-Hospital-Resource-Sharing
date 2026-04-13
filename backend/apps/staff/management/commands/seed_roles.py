"""Backward-compatible alias for seed_rbac."""
from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Deprecated alias for seed_rbac. Seeds roles from configurable RBAC config."

    def add_arguments(self, parser):
        parser.add_argument(
            "--config",
            dest="config_path",
            default="",
            help="Path to RBAC JSON file.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate config and print summary without DB changes.",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("seed_roles is deprecated. Delegating to seed_rbac."))

        kwargs = {}
        if options.get("config_path"):
            kwargs["config_path"] = options["config_path"]
        if options.get("dry_run"):
            kwargs["dry_run"] = True

        call_command("seed_rbac", **kwargs)
