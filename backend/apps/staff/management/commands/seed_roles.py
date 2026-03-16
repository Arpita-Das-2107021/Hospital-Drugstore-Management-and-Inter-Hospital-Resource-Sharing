"""Seed system roles into the database."""
from django.core.management.base import BaseCommand

from apps.staff.models import Role

ROLES = [
    {"name": "SUPER_ADMIN", "description": "Full platform access. Manages hospitals, verifies accounts."},
    {"name": "HOSPITAL_ADMIN", "description": "Full access within their hospital. Manages staff and resources."},
    {"name": "PHARMACIST", "description": "Manages inventory and resource catalog within their hospital."},
    {"name": "LOGISTICS_STAFF", "description": "Manages shipments and dispatch operations."},
    {"name": "STAFF", "description": "Basic hospital staff. Can view resources and raise requests."},
]


class Command(BaseCommand):
    help = "Seed system roles into the database."

    def handle(self, *args, **options):
        created = 0
        for role_data in ROLES:
            _, was_created = Role.objects.get_or_create(
                name=role_data["name"],
                defaults={"description": role_data["description"]},
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  Created role: {role_data['name']}"))
            else:
                self.stdout.write(f"  Role already exists: {role_data['name']}")

        self.stdout.write(self.style.SUCCESS(f"\nDone. {created} new role(s) created."))
