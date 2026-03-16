from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.staff.models import Role, Staff


class Command(BaseCommand):
    help = 'Create test users for cred.txt'

    def handle(self, *args, **options):
        from apps.hospitals.models import Hospital
        User = get_user_model()
        # Ensure a deterministic hospital exists for staff-linked test users.
        system_hospital, _ = Hospital.objects.get_or_create(
            registration_number='system',
            defaults={
                'name': 'System Hospital',
                'email': 'system@medibridge.local',
                'hospital_type': Hospital.HospitalType.GENERAL,
                'verified_status': Hospital.VerifiedStatus.VERIFIED,
                'address': 'System Seed Data',
                'city': 'System',
                'country': 'Bangladesh',
            },
        )
        users = [
            {
                'email': 'admin@medibridge.com',
                'password': 'Admin@1234',
                'role': 'SUPER_ADMIN',
                'first_name': 'Admin',
                'last_name': 'User',
            },
            {
                'email': 'hospital_admin@medibridge.com',
                'password': 'HospAdmin@123',
                'role': 'HOSPITAL_ADMIN',
                'first_name': 'Hosp',
                'last_name': 'Admin',
            },
            {
                'email': 'staff@medibridge.com',
                'password': 'Staff@123456',
                'role': 'STAFF',
                'first_name': 'Staff',
                'last_name': 'User',
            },
        ]
        for u in users:
            user, created = User.objects.get_or_create(email=u['email'])
            user.set_password(u['password'])
            user.is_active = True
            if u['email'] == 'admin@medibridge.com':
                user.is_superuser = True
                user.is_staff = True
                # Do NOT link to staff or hospital
                user.staff_id = None
                user.save()
            else:
                user.is_superuser = False
                user.is_staff = False
                user.save()
                # Create staff record if needed
                if not user.staff_id:
                    staff = Staff.objects.create(
                        first_name=u['first_name'],
                        last_name=u['last_name'],
                        employee_id=u['email'],
                        department='Test',
                        position=u['role'],
                        phone_number='N/A',
                        employment_status='active',
                        hospital_id=system_hospital.id,
                    )
                    user.staff_id = staff.id
                    user.save()
            # Assign role
            role_obj, _ = Role.objects.get_or_create(name=u['role'])
            user.roles.set([role_obj])
            self.stdout.write(self.style.SUCCESS(f"User {u['email']} created/updated with role {u['role']}"))
