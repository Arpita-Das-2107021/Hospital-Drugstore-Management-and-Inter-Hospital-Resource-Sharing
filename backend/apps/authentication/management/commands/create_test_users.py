from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.hospitals.models import Hospital
from apps.staff.models import (
    HospitalRole,
    HospitalRolePermission,
    Permission,
    PlatformRole,
    Staff,
    UserHospitalRole,
    UserPlatformRole,
)


class Command(BaseCommand):
    help = "Create deterministic development users for local login verification."

    HOSPITAL_ADMIN_COMPAT_PERMISSION_CODES = {
        "share.request.create",
        "share.request.approve",
        "inventory.batch.view",
        "inventory.cost.view",
    }

    PLATFORM_USERS = [
        {
            "email": "admin@medibridge.com",
            "password": "Admin@1234",
            "role": "SUPER_ADMIN",
            "is_superuser": True,
            "is_staff": True,
        },
        {
            "email": "ml_admin@medibridge.com",
            "password": "MlAdmin@1234",
            "role": "ML_ADMIN",
            "is_superuser": False,
            "is_staff": False,
        },
        # Keep the historical dummy accounts for backward-compatible local scripts.
        {
            "email": "super_admin@dummy.test",
            "password": "DevSuperAdmin@123",
            "role": "SUPER_ADMIN",
            "is_superuser": True,
            "is_staff": True,
        },
        {
            "email": "ml_admin@dummy.test",
            "password": "DevMlAdmin@123",
            "role": "ML_ADMIN",
            "is_superuser": False,
            "is_staff": False,
        },
    ]

    HOSPITAL_USERS = [
        {
            "email": "hospital_admin@medibridge.com",
            "password": "HospAdmin@123",
            "hospital_registration_number": "system",
            "hospital_role": "HEALTHCARE_ADMIN",
            "first_name": "Hosp",
            "last_name": "Admin",
            "employee_id_base": "ADMIN-SYSTEM",
            "position": "Hospital Administrator",
        },
        {
            "email": "staff@medibridge.com",
            "password": "Staff@123456",
            "hospital_registration_number": "system",
            "hospital_role": "HEALTHCARE_ADMIN",
            "first_name": "Staff",
            "last_name": "User",
            "employee_id_base": "STAFF-SYSTEM",
            "position": "Staff",
        },
        {
            "email": "client_admin@medibridge.com",
            "password": "ClientAdmin@123",
            "hospital_registration_number": "client-001",
            "hospital_role": "HEALTHCARE_ADMIN",
            "first_name": "Client",
            "last_name": "Admin",
            "employee_id_base": "ADMIN-CLIENT-001",
            "position": "Hospital Administrator",
        },
    ]

    HOSPITAL_SEEDS = [
        {
            "registration_number": "system",
            "name": "System Hospital",
            "email": "system@medibridge.local",
            "city": "System",
        },
        {
            "registration_number": "client-001",
            "name": "Client Hospital",
            "email": "client@medibridge.local",
            "city": "Dhaka",
        },
    ]

    def _pick_user_for_email(self, User, email: str):
        user = User.objects.filter(email__iexact=email).order_by("-is_active", "-created_at").first()
        if user is None:
            user = User(email=email)

        # Keep exactly one active account per email for deterministic test logins.
        User.objects.filter(email__iexact=email, is_active=True).exclude(pk=user.pk).update(is_active=False)
        return user

    def _next_employee_id(self, hospital: Hospital, base: str) -> str:
        candidate = base
        suffix = 2
        while Staff.objects.filter(
            hospital=hospital,
            employee_id=candidate,
            employment_status=Staff.EmploymentStatus.ACTIVE,
        ).exists():
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate

    def _ensure_hospital(self, seed: dict) -> Hospital:
        hospital, _ = Hospital.objects.get_or_create(
            registration_number=seed["registration_number"],
            defaults={
                "name": seed["name"],
                "email": seed["email"],
                "hospital_type": Hospital.HospitalType.GENERAL,
                "verified_status": Hospital.VerifiedStatus.VERIFIED,
                "address": "Seeded by create_test_users",
                "city": seed["city"],
                "country": "Bangladesh",
            },
        )
        if hospital.verified_status != Hospital.VerifiedStatus.VERIFIED:
            hospital.verified_status = Hospital.VerifiedStatus.VERIFIED
            hospital.save(update_fields=["verified_status", "updated_at"])
        return hospital

    def _ensure_hospital_admin_role(self, hospital: Hospital) -> HospitalRole:
        role, _ = HospitalRole.objects.get_or_create(
            hospital=hospital,
            name="HEALTHCARE_ADMIN",
            defaults={"description": "Full access within their hospital.", "is_active": True},
        )
        if not role.is_active:
            role.is_active = True
            role.save(update_fields=["is_active", "updated_at"])

        permission_ids = set(
            Permission.objects.filter(is_active=True, code__startswith="hospital:").values_list("id", flat=True)
        )
        permission_ids.update(
            Permission.objects.filter(
                is_active=True,
                code__in=self.HOSPITAL_ADMIN_COMPAT_PERMISSION_CODES,
            ).values_list("id", flat=True)
        )
        existing_permission_ids = set(role.role_permissions.values_list("permission_id", flat=True))
        missing_ids = permission_ids - existing_permission_ids
        for permission_id in missing_ids:
            HospitalRolePermission.objects.get_or_create(
                hospital_role=role,
                permission_id=permission_id,
                defaults={"assigned_by": None},
            )

        return role

    def _ensure_staff(
        self,
        *,
        hospital: Hospital,
        email: str,
        first_name: str,
        last_name: str,
        employee_id_base: str,
        position: str,
    ) -> Staff:
        staff = (
            Staff.objects.filter(
                hospital=hospital,
                email__iexact=email,
                employment_status=Staff.EmploymentStatus.ACTIVE,
            )
            .order_by("-created_at")
            .first()
        )
        if staff is None:
            staff = Staff.objects.filter(hospital=hospital, email__iexact=email).order_by("-created_at").first()

        if staff is None:
            return Staff.objects.create(
                hospital=hospital,
                role=None,
                email=email,
                first_name=first_name,
                last_name=last_name,
                employee_id=self._next_employee_id(hospital, employee_id_base),
                department="Administration",
                position=position,
                employment_status=Staff.EmploymentStatus.ACTIVE,
            )

        staff.email = email
        staff.first_name = first_name
        staff.last_name = last_name
        staff.department = staff.department or "Administration"
        staff.position = position
        staff.employment_status = Staff.EmploymentStatus.ACTIVE

        if not staff.employee_id:
            staff.employee_id = self._next_employee_id(hospital, employee_id_base)
        elif Staff.objects.filter(
            hospital=hospital,
            employee_id=staff.employee_id,
            employment_status=Staff.EmploymentStatus.ACTIVE,
        ).exclude(pk=staff.pk).exists():
            staff.employee_id = self._next_employee_id(hospital, employee_id_base)

        staff.save()
        return staff

    def _seed_platform_user(self, User, payload: dict) -> None:
        user = self._pick_user_for_email(User, payload["email"])

        user.email = payload["email"]
        user.set_password(payload["password"])
        user.is_active = True
        user.is_superuser = payload["is_superuser"]
        user.is_staff = payload["is_staff"]
        user.staff_id = None
        user.context_domain = User.ContextDomain.PLATFORM
        user.access_mode = User.AccessMode.UI
        user.failed_login_count = 0
        user.locked_until = None
        user.save()

        platform_role = PlatformRole.objects.filter(name=payload["role"]).first()
        if platform_role is None:
            raise CommandError(
                f"Platform role '{payload['role']}' not found. Ensure dual-scope RBAC is seeded first."
            )

        UserPlatformRole.objects.filter(user=user).exclude(platform_role=platform_role).delete()
        UserPlatformRole.objects.update_or_create(
            user=user,
            platform_role=platform_role,
            defaults={"assigned_by": None},
        )
        UserHospitalRole.objects.filter(user=user).delete()

        self.stdout.write(self.style.SUCCESS(f"User {payload['email']} created/updated with role {payload['role']}"))

    def _seed_hospital_user(self, User, payload: dict, hospitals_by_registration: dict[str, Hospital]) -> None:
        hospital = hospitals_by_registration[payload["hospital_registration_number"]]
        hospital_role = self._ensure_hospital_admin_role(hospital)
        staff = self._ensure_staff(
            hospital=hospital,
            email=payload["email"],
            first_name=payload["first_name"],
            last_name=payload["last_name"],
            employee_id_base=payload["employee_id_base"],
            position=payload["position"],
        )

        user = self._pick_user_for_email(User, payload["email"])

        user.email = payload["email"]
        user.set_password(payload["password"])
        user.is_active = True
        user.is_superuser = False
        user.is_staff = False
        user.staff = staff
        user.context_domain = User.ContextDomain.HEALTHCARE
        user.access_mode = User.AccessMode.UI
        user.failed_login_count = 0
        user.locked_until = None
        user.save()

        UserPlatformRole.objects.filter(user=user).delete()
        UserHospitalRole.objects.update_or_create(
            user=user,
            defaults={
                "hospital": hospital,
                "hospital_role": hospital_role,
                "assigned_by": None,
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"User {payload['email']} created/updated with role {payload['hospital_role']} @ {hospital.registration_number}"
            )
        )

    def handle(self, *args, **options):
        # Make command self-sufficient on a fresh DB.
        call_command("seed_dual_scope_rbac", verbosity=0)

        User = get_user_model()
        hospitals_by_registration: dict[str, Hospital] = {}

        with transaction.atomic():
            for hospital_seed in self.HOSPITAL_SEEDS:
                hospital = self._ensure_hospital(hospital_seed)
                hospitals_by_registration[hospital.registration_number] = hospital

            for payload in self.PLATFORM_USERS:
                self._seed_platform_user(User, payload)

            for payload in self.HOSPITAL_USERS:
                self._seed_hospital_user(User, payload, hospitals_by_registration)
