from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.staff.models import Role, Staff

class Command(BaseCommand):
    help = 'Create test users for cred.txt'

    def handle(self, *args, **options):
        User = get_user_model()
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
                    hospital_id=None,
                )
                user.staff_id = staff.id
                user.save()
            # Assign role
            role_obj, _ = Role.objects.get_or_create(name=u['role'])
            user.roles.set([role_obj])
            self.stdout.write(self.style.SUCCESS(f"User {u['email']} created/updated with role {u['role']}"))
