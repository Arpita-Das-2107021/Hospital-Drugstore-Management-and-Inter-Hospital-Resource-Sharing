"""Seed resource types into the database."""
from django.core.management.base import BaseCommand

from apps.resources.models import ResourceType

RESOURCE_TYPES = [
    {"name": "Medication", "description": "Pharmaceutical drugs and medicines.", "unit_of_measure": "units"},
    {"name": "Blood", "description": "Blood and blood products.", "unit_of_measure": "units"},
    {"name": "Medical Equipment", "description": "Reusable medical devices and equipment.", "unit_of_measure": "units"},
    {"name": "Consumables", "description": "Single-use medical supplies.", "unit_of_measure": "units"},
    {"name": "PPE", "description": "Personal Protective Equipment.", "unit_of_measure": "units"},
    {"name": "Oxygen", "description": "Medical oxygen supply.", "unit_of_measure": "liters"},
    {"name": "Vaccines", "description": "Vaccine doses.", "unit_of_measure": "doses"},
    {"name": "Lab Supplies", "description": "Laboratory reagents and supplies.", "unit_of_measure": "units"},
]


class Command(BaseCommand):
    help = "Seed resource types into the database."

    def handle(self, *args, **options):
        created = 0
        for rt_data in RESOURCE_TYPES:
            _, was_created = ResourceType.objects.get_or_create(
                name=rt_data["name"],
                defaults={
                    "description": rt_data["description"],
                    "unit_of_measure": rt_data["unit_of_measure"],
                },
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  Created resource type: {rt_data['name']}"))
            else:
                self.stdout.write(f"  Resource type already exists: {rt_data['name']}")

        self.stdout.write(self.style.SUCCESS(f"\nDone. {created} new resource type(s) created."))
