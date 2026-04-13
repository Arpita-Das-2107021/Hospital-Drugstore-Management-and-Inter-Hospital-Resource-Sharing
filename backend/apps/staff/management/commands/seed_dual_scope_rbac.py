"""Seed dual-scope RBAC permissions and platform roles from JSON config."""
import json
import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.staff.models import Permission, PlatformRole, PlatformRolePermission, UserPlatformRole


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
    help = "Seed dual-scope RBAC permissions and platform roles from JSON config."

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
            help="Validate config and print summary without DB writes.",
        )

    def handle(self, *args, **options):
        config_path = self._resolve_config_path(options.get("config_path") or "")
        config_data = self._load_config(config_path)

        permission_rows = self._parse_permissions(config_data.get("permissions", []))
        platform_role_rows = self._parse_platform_roles(config_data.get("platform_roles", []))
        hospital_templates = self._parse_hospital_templates(config_data.get("hospital_role_templates", []))

        if options.get("dry_run"):
            self.stdout.write(self.style.WARNING("[dry-run] No database changes will be applied."))
            self.stdout.write(f"Config file: {config_path}")
            self.stdout.write(f"Permissions in config: {len(permission_rows)}")
            self.stdout.write(f"Platform roles in config: {len(platform_role_rows)}")
            self.stdout.write(f"Hospital role templates in config: {len(hospital_templates)}")
            return

        summary = self._apply_seed(permission_rows, platform_role_rows)
        self.stdout.write(self.style.SUCCESS("Dual-scope RBAC seed complete."))
        self.stdout.write(f"  Config: {config_path}")
        self.stdout.write(
            f"  Permissions: created={summary['permissions_created']} updated={summary['permissions_updated']}"
        )
        self.stdout.write(
            f"  Platform roles: created={summary['platform_roles_created']} updated={summary['platform_roles_updated']}"
        )
        self.stdout.write(
            f"  Platform role-permission mappings: "
            f"added={summary['platform_mappings_added']} removed={summary['platform_mappings_removed']}"
        )
        self.stdout.write(
            "  Hospital-scoped platform role cleanup: "
            f"roles_deactivated={summary['platform_hospital_roles_deactivated']} "
            f"assignments_removed={summary['platform_hospital_assignments_removed']} "
            f"mappings_removed={summary['platform_hospital_mappings_removed']}"
        )
        self.stdout.write(
            f"  Deprecated permissions deactivated: {summary['deprecated_permissions_deactivated']}"
        )

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

            code = self._normalize_permission_code(row.get("code", ""), field=f"permissions[{index}].code")
            if code in seen_codes:
                raise CommandError(f"Duplicate permission code in config: {code}")
            seen_codes.add(code)

            name = str(row.get("name") or code).strip()
            description = str(row.get("description") or "").strip()
            is_active = bool(row.get("is_active", True))

            parsed.append(
                {
                    "code": code,
                    "name": name,
                    "description": description,
                    "is_active": is_active,
                }
            )
        return parsed

    def _parse_platform_roles(self, rows) -> list[dict]:
        return self._parse_role_rows(rows, key="platform_roles")

    def _parse_hospital_templates(self, rows) -> list[dict]:
        return self._parse_role_rows(rows, key="hospital_role_templates")

    def _parse_role_rows(self, rows, *, key: str) -> list[dict]:
        if not isinstance(rows, list):
            raise CommandError(f"'{key}' must be an array in RBAC seed config.")

        parsed = []
        seen_names = set()
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise CommandError(f"{key}[{index}] must be an object.")

            name = str(row.get("name", "")).strip().upper()
            if not name:
                raise CommandError(f"{key}[{index}].name is required.")
            if name in seen_names:
                raise CommandError(f"Duplicate role name in config: {name}")
            if key == "platform_roles" and name in HOSPITAL_SCOPED_ROLE_NAMES:
                raise CommandError(
                    f"{key}[{index}].name '{name}' is hospital-scoped and cannot be defined as a platform role."
                )
            seen_names.add(name)

            description = str(row.get("description") or "").strip()
            permissions = row.get("permissions", [])
            if permissions is None:
                permissions = []
            if not isinstance(permissions, list):
                raise CommandError(f"{key}[{index}].permissions must be an array.")

            normalized_codes = []
            wildcard_all = False
            for permission_index, code in enumerate(permissions):
                normalized = self._normalize_permission_code(
                    code,
                    field=f"{key}[{index}].permissions[{permission_index}]",
                    allow_wildcard=True,
                )
                if normalized == "*":
                    wildcard_all = True
                    continue
                normalized_codes.append(normalized)

            parsed.append(
                {
                    "name": name,
                    "description": description,
                    "permissions": sorted(set(normalized_codes)),
                    "wildcard_all": wildcard_all,
                }
            )
        return parsed

    def _normalize_permission_code(self, raw_value, *, field: str, allow_wildcard: bool = False) -> str:
        code = str(raw_value or "").strip()
        if allow_wildcard and code == "*":
            return code
        if not code:
            raise CommandError(f"{field} is required.")
        return code

    @transaction.atomic
    def _apply_seed(self, permission_rows: list[dict], platform_role_rows: list[dict]) -> dict:
        permissions_created = 0
        permissions_updated = 0
        platform_roles_created = 0
        platform_roles_updated = 0
        platform_mappings_added = 0
        platform_mappings_removed = 0
        platform_hospital_roles_deactivated = 0
        platform_hospital_assignments_removed = 0
        platform_hospital_mappings_removed = 0
        deprecated_permissions_deactivated = 0

        for permission_row in permission_rows:
            _, created = Permission.objects.update_or_create(
                code=permission_row["code"],
                defaults={
                    "name": permission_row["name"],
                    "description": permission_row["description"],
                    "is_active": permission_row["is_active"],
                },
            )
            if created:
                permissions_created += 1
            else:
                permissions_updated += 1

        deprecated_permissions_deactivated = Permission.objects.filter(
            code__in=DEPRECATED_PERMISSION_CODES,
            is_active=True,
        ).update(is_active=False)

        platform_role_objects = {}
        for role_row in platform_role_rows:
            role, created = PlatformRole.objects.update_or_create(
                name=role_row["name"],
                defaults={"description": role_row["description"], "is_active": True},
            )
            platform_role_objects[role_row["name"]] = role
            if created:
                platform_roles_created += 1
            else:
                platform_roles_updated += 1

        permission_lookup = {permission.code: permission for permission in Permission.objects.all()}
        all_permission_codes = set(permission_lookup.keys())

        for role_row in platform_role_rows:
            role = platform_role_objects[role_row["name"]]
            desired_codes = set(role_row["permissions"])
            if role_row["wildcard_all"]:
                desired_codes = set(all_permission_codes)

            unknown_codes = sorted(desired_codes - all_permission_codes)
            if unknown_codes:
                raise CommandError(
                    f"Platform role {role.name} references unknown permission codes: {', '.join(unknown_codes)}"
                )

            current_codes = set(role.role_permissions.values_list("permission__code", flat=True))
            add_codes = sorted(desired_codes - current_codes)
            remove_codes = sorted(current_codes - desired_codes)

            for code in add_codes:
                PlatformRolePermission.objects.get_or_create(platform_role=role, permission=permission_lookup[code])
                platform_mappings_added += 1

            if remove_codes:
                deleted_count, _ = PlatformRolePermission.objects.filter(
                    platform_role=role,
                    permission__code__in=remove_codes,
                ).delete()
                platform_mappings_removed += deleted_count

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

        return {
            "permissions_created": permissions_created,
            "permissions_updated": permissions_updated,
            "platform_roles_created": platform_roles_created,
            "platform_roles_updated": platform_roles_updated,
            "platform_mappings_added": platform_mappings_added,
            "platform_mappings_removed": platform_mappings_removed,
            "platform_hospital_roles_deactivated": platform_hospital_roles_deactivated,
            "platform_hospital_assignments_removed": platform_hospital_assignments_removed,
            "platform_hospital_mappings_removed": platform_hospital_mappings_removed,
            "deprecated_permissions_deactivated": deprecated_permissions_deactivated,
        }
