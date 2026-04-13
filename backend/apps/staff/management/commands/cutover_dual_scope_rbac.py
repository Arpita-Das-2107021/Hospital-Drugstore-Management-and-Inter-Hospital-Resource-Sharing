"""Cut over role assignments from legacy Role/UserRole to dual-scope RBAC."""
import json
import os
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.hospitals.models import Hospital
from apps.staff.models import (
    HospitalRole,
    HospitalRolePermission,
    Invitation,
    Permission,
    PlatformRole,
    PlatformRolePermission,
    Role,
    RolePermission,
    UserHospitalRole,
    UserPlatformRole,
    UserRole,
)

LEGACY_TO_DUAL_ROLE_MAP = {
    "HOSPITAL_ADMIN": "HEALTHCARE_ADMIN",
    "HEALTHCARE_ADMIN": "HEALTHCARE_ADMIN",
    "STAFF": "STAFF",
    "PHARMACIST": "STAFF",
    "LOGISTICS_STAFF": "STAFF",
    "SUPER_ADMIN": "SUPER_ADMIN",
    "PLATFORM_ADMIN": "PLATFORM_ADMIN",
}

HOSPITAL_ROLE_PRECEDENCE = [
    "HEALTHCARE_ADMIN",
    "STAFF",
]

REMOVED_HOSPITAL_ROLE_NAMES = {
    "PHARMACIST",
    "LOGISTICS_STAFF",
}

HOSPITAL_SCOPED_ROLE_NAMES = {
    "HEALTHCARE_ADMIN",
    "STAFF",
    "PHARMACIST",
    "LOGISTICS_STAFF",
    "INVENTORY_MANAGER",
    "DOCTOR",
}

DEPRECATED_PERMISSION_CODES = {
    "hospital:staff.admin",
    "hospital:inventory.admin",
    "hospital:resource_share.admin",
    "hospital:request.admin",
    "hospital:shipment.admin",
}


class Command(BaseCommand):
    help = (
        "Migrate users to dual-scope RBAC, assign platform/hospital roles, "
        "purge legacy Role/UserRole data, and optionally deactivate legacy permissions."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--config",
            dest="config_path",
            default="",
            help=(
                "Path to dual-scope RBAC JSON file. "
                "Defaults to RBAC_DUAL_SCOPE_SEED_CONFIG or apps/staff/seeds/rbac.dual_scope.default.json."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run full migration logic and roll back transaction at the end.",
        )
        parser.add_argument(
            "--keep-legacy-permissions",
            action="store_true",
            help="Do not deactivate legacy UPPER_SNAKE_CASE permissions.",
        )

    def handle(self, *args, **options):
        config_path = self._resolve_config_path(options.get("config_path") or "")
        config_data = self._load_config(config_path)

        permission_rows = self._parse_permissions(config_data.get("permissions", []))
        platform_role_rows = self._parse_role_rows(config_data.get("platform_roles", []), key="platform_roles")
        hospital_template_rows = self._parse_role_rows(
            config_data.get("hospital_role_templates", []), key="hospital_role_templates"
        )

        with transaction.atomic():
            summary = self._apply_cutover(
                permission_rows=permission_rows,
                platform_role_rows=platform_role_rows,
                hospital_template_rows=hospital_template_rows,
                deactivate_legacy_permissions=not options.get("keep_legacy_permissions", False),
            )

            if options.get("dry_run"):
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("[dry-run] Rolled back all database changes."))

        self.stdout.write(self.style.SUCCESS("Dual-scope RBAC cutover complete."))
        self.stdout.write(f"  Config: {config_path}")
        self.stdout.write(f"  Permissions upserted: {summary['permissions_upserted']}")
        self.stdout.write(
            f"  Platform roles upserted: {summary['platform_roles_upserted']} "
            f"(mappings added={summary['platform_mappings_added']} removed={summary['platform_mappings_removed']})"
        )
        self.stdout.write(
            "  Hospital-scoped platform role cleanup: "
            f"roles_deactivated={summary['platform_hospital_roles_deactivated']} "
            f"assignments_removed={summary['platform_hospital_assignments_removed']} "
            f"mappings_removed={summary['platform_hospital_mappings_removed']}"
        )
        self.stdout.write(
            f"  Hospital roles upserted: {summary['hospital_roles_upserted']} "
            f"(mappings added={summary['hospital_mappings_added']} removed={summary['hospital_mappings_removed']})"
        )
        self.stdout.write(
            "  Hospital role cleanup: "
            f"roles_deleted={summary['removed_hospital_roles_deleted']} "
            f"assignments_repointed={summary['removed_hospital_role_assignments_repointed']}"
        )
        self.stdout.write(
            f"  Users migrated: {summary['users_migrated']} "
            f"(platform assignments added={summary['platform_assignments_added']} removed={summary['platform_assignments_removed']}, "
            f"hospital assignments upserted={summary['hospital_assignments_upserted']} removed={summary['hospital_assignments_removed']})"
        )
        self.stdout.write(
            f"  Legacy cleanup: user_roles_deleted={summary['legacy_user_roles_deleted']} "
            f"role_permissions_deleted={summary['legacy_role_permissions_deleted']} roles_deleted={summary['legacy_roles_deleted']} "
            f"staff_role_cleared={summary['staff_role_cleared']} invitation_role_cleared={summary['invitation_role_cleared']}"
        )
        self.stdout.write(
            f"  Deprecated permissions deactivated: {summary['deprecated_permissions_deactivated']}"
        )
        self.stdout.write(f"  Legacy permissions deactivated: {summary['legacy_permissions_deactivated']}")

    def _resolve_config_path(self, cli_path: str) -> Path:
        if cli_path:
            candidate = Path(cli_path)
        else:
            env_path = os.getenv("RBAC_DUAL_SCOPE_SEED_CONFIG", "")
            if env_path:
                candidate = Path(env_path)
            else:
                configured = getattr(settings, "RBAC_DUAL_SCOPE_SEED_CONFIG", "")
                if configured:
                    candidate = Path(configured)
                else:
                    candidate = Path(settings.BASE_DIR) / "apps" / "staff" / "seeds" / "rbac.dual_scope.default.json"

        if not candidate.is_absolute():
            candidate = Path(settings.BASE_DIR) / candidate

        if not candidate.exists():
            raise CommandError(f"Dual-scope RBAC seed config not found: {candidate}")
        return candidate

    def _load_config(self, path: Path) -> dict:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON in RBAC seed file {path}: {exc}") from exc

        if not isinstance(data, dict):
            raise CommandError("Dual-scope RBAC seed config root must be a JSON object.")
        return data

    def _parse_permissions(self, rows) -> list[dict]:
        if not isinstance(rows, list):
            raise CommandError("'permissions' must be an array in RBAC seed config.")

        parsed = []
        seen_codes = set()
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise CommandError(f"permissions[{index}] must be an object.")

            code = str(row.get("code") or "").strip()
            if not code:
                raise CommandError(f"permissions[{index}].code is required.")
            if code in seen_codes:
                raise CommandError(f"Duplicate permission code in config: {code}")
            seen_codes.add(code)

            parsed.append(
                {
                    "code": code,
                    "name": str(row.get("name") or code).strip(),
                    "description": str(row.get("description") or "").strip(),
                }
            )
        return parsed

    def _parse_role_rows(self, rows, *, key: str) -> list[dict]:
        if not isinstance(rows, list):
            raise CommandError(f"'{key}' must be an array in RBAC seed config.")

        parsed = []
        seen_names = set()
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise CommandError(f"{key}[{index}] must be an object.")

            name = str(row.get("name") or "").strip().upper()
            if not name:
                raise CommandError(f"{key}[{index}].name is required.")
            if name in seen_names:
                raise CommandError(f"Duplicate role name in config: {name}")
            if key == "platform_roles" and name in HOSPITAL_SCOPED_ROLE_NAMES:
                raise CommandError(
                    f"{key}[{index}].name '{name}' is hospital-scoped and cannot be defined as a platform role."
                )
            seen_names.add(name)

            permissions = row.get("permissions") or []
            if not isinstance(permissions, list):
                raise CommandError(f"{key}[{index}].permissions must be an array.")

            wildcard_all = False
            normalized_permissions = []
            for permission in permissions:
                code = str(permission or "").strip()
                if not code:
                    continue
                if code == "*":
                    wildcard_all = True
                    continue
                normalized_permissions.append(code)

            parsed.append(
                {
                    "name": name,
                    "description": str(row.get("description") or "").strip(),
                    "permissions": sorted(set(normalized_permissions)),
                    "wildcard_all": wildcard_all,
                }
            )
        return parsed

    def _apply_cutover(
        self,
        *,
        permission_rows: list[dict],
        platform_role_rows: list[dict],
        hospital_template_rows: list[dict],
        deactivate_legacy_permissions: bool,
    ) -> dict:
        permissions_upserted = 0
        platform_roles_upserted = 0
        platform_mappings_added = 0
        platform_mappings_removed = 0
        platform_hospital_roles_deactivated = 0
        platform_hospital_assignments_removed = 0
        platform_hospital_mappings_removed = 0
        hospital_roles_upserted = 0
        hospital_mappings_added = 0
        hospital_mappings_removed = 0
        removed_hospital_roles_deleted = 0
        removed_hospital_role_assignments_repointed = 0
        deprecated_permissions_deactivated = 0

        # 1) Ensure permission catalog exists for dual-scope definitions.
        for row in permission_rows:
            Permission.objects.update_or_create(
                code=row["code"],
                defaults={
                    "name": row["name"],
                    "description": row["description"],
                    "is_active": True,
                },
            )
            permissions_upserted += 1

        deprecated_permissions_deactivated = Permission.objects.filter(
            code__in=DEPRECATED_PERMISSION_CODES,
            is_active=True,
        ).update(is_active=False)

        permission_lookup = {permission.code: permission for permission in Permission.objects.all()}
        all_permission_codes = set(permission_lookup.keys())

        # 2) Ensure platform roles and their mappings are synchronized.
        platform_role_map = {}
        for role_row in platform_role_rows:
            role, _ = PlatformRole.objects.update_or_create(
                name=role_row["name"],
                defaults={
                    "description": role_row["description"],
                    "is_active": True,
                },
            )
            platform_roles_upserted += 1
            platform_role_map[role_row["name"]] = role

            desired_codes = set(role_row["permissions"])
            if role_row["wildcard_all"]:
                desired_codes = set(all_permission_codes)

            unknown = sorted(desired_codes - all_permission_codes)
            if unknown:
                raise CommandError(
                    f"Platform role {role.name} references unknown permissions: {', '.join(unknown)}"
                )

            current_codes = set(role.role_permissions.values_list("permission__code", flat=True))
            add_codes = sorted(desired_codes - current_codes)
            remove_codes = sorted(current_codes - desired_codes)

            for code in add_codes:
                PlatformRolePermission.objects.get_or_create(platform_role=role, permission=permission_lookup[code])
                platform_mappings_added += 1

            if remove_codes:
                removed, _ = PlatformRolePermission.objects.filter(
                    platform_role=role,
                    permission__code__in=remove_codes,
                ).delete()
                platform_mappings_removed += removed

        hospital_scoped_platform_roles = PlatformRole.objects.filter(name__in=HOSPITAL_SCOPED_ROLE_NAMES)
        hospital_scoped_platform_role_ids = list(hospital_scoped_platform_roles.values_list("id", flat=True))
        if hospital_scoped_platform_role_ids:
            platform_hospital_assignments_removed, _ = UserPlatformRole.objects.filter(
                platform_role_id__in=hospital_scoped_platform_role_ids
            ).delete()
            platform_hospital_mappings_removed, _ = PlatformRolePermission.objects.filter(
                platform_role_id__in=hospital_scoped_platform_role_ids
            ).delete()
            platform_hospital_roles_deactivated = hospital_scoped_platform_roles.update(is_active=False)

        # 3) Ensure every hospital has template hospital roles and mappings.
        hospitals = list(Hospital.objects.all())
        hospital_role_index = {}
        for hospital in hospitals:
            for template in hospital_template_rows:
                role, _ = HospitalRole.objects.update_or_create(
                    hospital=hospital,
                    name=template["name"],
                    defaults={
                        "description": template["description"],
                        "is_active": True,
                    },
                )
                hospital_roles_upserted += 1
                hospital_role_index[(str(hospital.id), template["name"])] = role

                desired_codes = set(template["permissions"])
                if template["wildcard_all"]:
                    desired_codes = set(all_permission_codes)

                unknown = sorted(desired_codes - all_permission_codes)
                if unknown:
                    raise CommandError(
                        f"Hospital template {template['name']} references unknown permissions: {', '.join(unknown)}"
                    )

                current_codes = set(role.role_permissions.values_list("permission__code", flat=True))
                add_codes = sorted(desired_codes - current_codes)
                remove_codes = sorted(current_codes - desired_codes)

                for code in add_codes:
                    HospitalRolePermission.objects.get_or_create(hospital_role=role, permission=permission_lookup[code])
                    hospital_mappings_added += 1

                if remove_codes:
                    removed, _ = HospitalRolePermission.objects.filter(
                        hospital_role=role,
                        permission__code__in=remove_codes,
                    ).delete()
                    hospital_mappings_removed += removed

        # 4) Migrate users to dual-scope assignments.
        UserAccount = get_user_model()
        users = list(
            UserAccount.objects.select_related("staff", "staff__hospital")
            .prefetch_related("roles", "platform_role_assignments__platform_role", "hospital_role_assignment")
            .all()
        )

        users_migrated = 0
        platform_assignments_added = 0
        platform_assignments_removed = 0
        hospital_assignments_upserted = 0
        hospital_assignments_removed = 0
        staff_role_cleared = 0

        for user in users:
            users_migrated += 1
            legacy_role_names = set(user.roles.values_list("name", flat=True))
            mapped_legacy_roles = {
                LEGACY_TO_DUAL_ROLE_MAP.get(role_name, "")
                for role_name in legacy_role_names
            }
            mapped_legacy_roles.discard("")

            existing_platform_names = set(
                user.platform_role_assignments.values_list("platform_role__name", flat=True)
            )
            target_platform_names = set(existing_platform_names)

            if user.is_superuser or "SUPER_ADMIN" in mapped_legacy_roles:
                target_platform_names = {"SUPER_ADMIN"}
            elif "PLATFORM_ADMIN" in mapped_legacy_roles:
                target_platform_names.add("PLATFORM_ADMIN")

            target_platform_names = {
                role_name
                for role_name in target_platform_names
                if role_name in platform_role_map and role_name not in HOSPITAL_SCOPED_ROLE_NAMES
            }

            current_platform_assignments = {
                assignment.platform_role.name: assignment
                for assignment in user.platform_role_assignments.select_related("platform_role")
            }
            for role_name in sorted(target_platform_names):
                if role_name in current_platform_assignments:
                    continue
                UserPlatformRole.objects.create(
                    user=user,
                    platform_role=platform_role_map[role_name],
                    assigned_by=None,
                )
                platform_assignments_added += 1

            remove_platform_names = set(current_platform_assignments.keys()) - target_platform_names
            if remove_platform_names:
                removed, _ = UserPlatformRole.objects.filter(
                    user=user,
                    platform_role__name__in=sorted(remove_platform_names),
                ).delete()
                platform_assignments_removed += removed

            staff = getattr(user, "staff", None)
            hospital = getattr(staff, "hospital", None)
            if hospital is None:
                removed, _ = UserHospitalRole.objects.filter(user=user).delete()
                hospital_assignments_removed += removed
            else:
                desired_hospital_role_name = None

                existing_hospital_assignment = UserHospitalRole.objects.filter(user=user).select_related(
                    "hospital_role", "hospital"
                ).first()
                if existing_hospital_assignment and existing_hospital_assignment.hospital_id == hospital.id:
                    desired_hospital_role_name = LEGACY_TO_DUAL_ROLE_MAP.get(
                        existing_hospital_assignment.hospital_role.name,
                        existing_hospital_assignment.hospital_role.name,
                    )

                if not desired_hospital_role_name:
                    for candidate in HOSPITAL_ROLE_PRECEDENCE:
                        if candidate in mapped_legacy_roles:
                            desired_hospital_role_name = candidate
                            break

                if not desired_hospital_role_name:
                    desired_hospital_role_name = "STAFF"

                if desired_hospital_role_name in REMOVED_HOSPITAL_ROLE_NAMES:
                    desired_hospital_role_name = "STAFF"
                    removed_hospital_role_assignments_repointed += 1

                role_key = (str(hospital.id), desired_hospital_role_name)
                hospital_role = hospital_role_index.get(role_key)
                if hospital_role is None:
                    hospital_role, _ = HospitalRole.objects.get_or_create(
                        hospital=hospital,
                        name=desired_hospital_role_name,
                        defaults={"description": f"{desired_hospital_role_name.title()} role", "is_active": True},
                    )
                    hospital_role_index[role_key] = hospital_role
                    hospital_roles_upserted += 1

                UserHospitalRole.objects.update_or_create(
                    user=user,
                    defaults={
                        "hospital": hospital,
                        "hospital_role": hospital_role,
                        "assigned_by": None,
                    },
                )
                hospital_assignments_upserted += 1

            if staff is not None and staff.role_id is not None:
                staff.role = None
                staff.save(update_fields=["role", "updated_at"])
                staff_role_cleared += 1

        removed_hospital_roles = HospitalRole.objects.filter(name__in=REMOVED_HOSPITAL_ROLE_NAMES)
        removed_hospital_roles_deleted = removed_hospital_roles.count()
        if removed_hospital_roles_deleted:
            removed_hospital_roles.delete()

        # 5) Clear legacy role references and purge legacy role tables.
        invitation_role_cleared = Invitation.objects.exclude(role__isnull=True).update(role=None)

        legacy_user_roles_deleted = UserRole.objects.count()
        UserRole.objects.all().delete()

        legacy_role_permissions_deleted = RolePermission.objects.count()
        RolePermission.objects.all().delete()

        legacy_roles_deleted = Role.objects.count()
        Role.objects.all().delete()

        # 6) Deactivate legacy permissions so only namespaced permissions remain active.
        legacy_permissions_deactivated = 0
        if deactivate_legacy_permissions:
            legacy_permission_ids = [
                permission.id
                for permission in Permission.objects.all()
                if ":" not in permission.code and permission.is_active
            ]
            if legacy_permission_ids:
                legacy_permissions_deactivated = Permission.objects.filter(id__in=legacy_permission_ids).update(
                    is_active=False
                )

        return {
            "permissions_upserted": permissions_upserted,
            "platform_roles_upserted": platform_roles_upserted,
            "platform_mappings_added": platform_mappings_added,
            "platform_mappings_removed": platform_mappings_removed,
            "platform_hospital_roles_deactivated": platform_hospital_roles_deactivated,
            "platform_hospital_assignments_removed": platform_hospital_assignments_removed,
            "platform_hospital_mappings_removed": platform_hospital_mappings_removed,
            "hospital_roles_upserted": hospital_roles_upserted,
            "hospital_mappings_added": hospital_mappings_added,
            "hospital_mappings_removed": hospital_mappings_removed,
            "removed_hospital_roles_deleted": removed_hospital_roles_deleted,
            "removed_hospital_role_assignments_repointed": removed_hospital_role_assignments_repointed,
            "deprecated_permissions_deactivated": deprecated_permissions_deactivated,
            "users_migrated": users_migrated,
            "platform_assignments_added": platform_assignments_added,
            "platform_assignments_removed": platform_assignments_removed,
            "hospital_assignments_upserted": hospital_assignments_upserted,
            "hospital_assignments_removed": hospital_assignments_removed,
            "legacy_user_roles_deleted": legacy_user_roles_deleted,
            "legacy_role_permissions_deleted": legacy_role_permissions_deleted,
            "legacy_roles_deleted": legacy_roles_deleted,
            "staff_role_cleared": staff_role_cleared,
            "invitation_role_cleared": invitation_role_cleared,
            "legacy_permissions_deactivated": legacy_permissions_deactivated,
        }
