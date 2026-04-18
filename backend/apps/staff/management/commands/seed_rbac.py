"""Seed RBAC roles, permissions, and mappings from a configurable JSON file."""
import json
import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.staff.models import Permission, Role, RolePermission


class Command(BaseCommand):
    help = "Seed roles, permissions, and role-permission mappings from JSON config."

    def add_arguments(self, parser):
        parser.add_argument(
            "--config",
            dest="config_path",
            default="",
            help="Path to RBAC JSON file. Defaults to RBAC_SEED_CONFIG or apps/staff/seeds/rbac.default.json.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate and print summary without writing database changes.",
        )

    def handle(self, *args, **options):
        config_path = self._resolve_config_path(options.get("config_path") or "")
        config_data = self._load_config(config_path)

        permission_rows = self._parse_permissions(config_data.get("permissions", []))
        role_rows = self._parse_roles(config_data.get("roles", []))

        if options.get("dry_run"):
            self.stdout.write(self.style.WARNING("[dry-run] No database changes will be applied."))
            self.stdout.write(f"Config file: {config_path}")
            self.stdout.write(f"Permissions in config: {len(permission_rows)}")
            self.stdout.write(f"Roles in config: {len(role_rows)}")
            return

        summary = self._apply_seed(permission_rows, role_rows)
        self.stdout.write(self.style.SUCCESS("RBAC seed complete."))
        self.stdout.write(f"  Config: {config_path}")
        self.stdout.write(
            f"  Permissions: created={summary['permissions_created']} updated={summary['permissions_updated']}"
        )
        self.stdout.write(f"  Roles: created={summary['roles_created']} updated={summary['roles_updated']}")
        self.stdout.write(
            f"  RolePermission mappings: added={summary['mappings_added']} removed={summary['mappings_removed']}"
        )

    def _resolve_config_path(self, cli_path: str) -> Path:
        if cli_path:
            candidate = Path(cli_path)
        else:
            env_path = os.getenv("RBAC_SEED_CONFIG", "")
            if env_path:
                candidate = Path(env_path)
            else:
                configured = getattr(settings, "RBAC_SEED_CONFIG", "")
                if configured:
                    candidate = Path(configured)
                else:
                    candidate = Path(settings.BASE_DIR) / "apps" / "staff" / "seeds" / "rbac.default.json"

        if not candidate.is_absolute():
            candidate = Path(settings.BASE_DIR) / candidate

        if not candidate.exists():
            raise CommandError(f"RBAC seed config not found: {candidate}")
        return candidate

    def _load_config(self, path: Path) -> dict:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON in RBAC seed file {path}: {exc}") from exc

        if not isinstance(data, dict):
            raise CommandError("RBAC seed config root must be a JSON object.")
        return data

    def _parse_permissions(self, rows) -> list[dict]:
        if not isinstance(rows, list):
            raise CommandError("'permissions' must be an array in RBAC seed config.")

        parsed = []
        seen_codes = set()
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise CommandError(f"permissions[{index}] must be an object.")

            code = self._normalize_code(row.get("code", ""), field=f"permissions[{index}].code")
            if code in seen_codes:
                raise CommandError(f"Duplicate permission code in config: {code}")
            seen_codes.add(code)

            name = str(row.get("name") or code.replace("_", " ").title()).strip()
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

    def _parse_roles(self, rows) -> list[dict]:
        if not isinstance(rows, list):
            raise CommandError("'roles' must be an array in RBAC seed config.")

        parsed = []
        seen_names = set()
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise CommandError(f"roles[{index}] must be an object.")

            name = str(row.get("name", "")).strip().upper()
            if not name:
                raise CommandError(f"roles[{index}].name is required.")
            if name in seen_names:
                raise CommandError(f"Duplicate role name in config: {name}")
            seen_names.add(name)

            description = str(row.get("description") or "").strip()
            permissions = row.get("permissions", [])
            if permissions is None:
                permissions = []
            if not isinstance(permissions, list):
                raise CommandError(f"roles[{index}].permissions must be an array.")

            normalized_permission_codes = []
            wildcard_all = False
            for permission_index, code in enumerate(permissions):
                normalized_code = self._normalize_code(
                    code,
                    field=f"roles[{index}].permissions[{permission_index}]",
                    allow_wildcard=True,
                )
                if normalized_code == "*":
                    wildcard_all = True
                    continue
                normalized_permission_codes.append(normalized_code)

            parsed.append(
                {
                    "name": name,
                    "description": description,
                    "permissions": sorted(set(normalized_permission_codes)),
                    "wildcard_all": wildcard_all,
                }
            )
        return parsed

    def _normalize_code(self, raw_value, *, field: str, allow_wildcard: bool = False) -> str:
        code = str(raw_value or "").strip().upper()
        if allow_wildcard and code == "*":
            return code
        if not code:
            raise CommandError(f"{field} is required.")
        return code

    @transaction.atomic
    def _apply_seed(self, permission_rows: list[dict], role_rows: list[dict]) -> dict:
        permissions_created = 0
        permissions_updated = 0
        roles_created = 0
        roles_updated = 0
        mappings_added = 0
        mappings_removed = 0

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

        role_objects = {}
        for role_row in role_rows:
            role, created = Role.objects.update_or_create(
                name=role_row["name"],
                defaults={"description": role_row["description"]},
            )
            role_objects[role_row["name"]] = role
            if created:
                roles_created += 1
            else:
                roles_updated += 1

        permission_lookup = {permission.code: permission for permission in Permission.objects.all()}
        all_permission_codes = set(permission_lookup.keys())

        for role_row in role_rows:
            role = role_objects[role_row["name"]]
            desired_codes = set(role_row["permissions"])
            if role_row["wildcard_all"]:
                desired_codes = set(all_permission_codes)

            unknown_codes = sorted(desired_codes - all_permission_codes)
            if unknown_codes:
                raise CommandError(
                    f"Role {role.name} references unknown permission codes: {', '.join(unknown_codes)}"
                )

            current_codes = set(role.permissions.values_list("code", flat=True))
            add_codes = sorted(desired_codes - current_codes)
            remove_codes = sorted(current_codes - desired_codes)

            for code in add_codes:
                RolePermission.objects.get_or_create(role=role, permission=permission_lookup[code])
                mappings_added += 1

            if remove_codes:
                deleted_count, _ = RolePermission.objects.filter(
                    role=role,
                    permission__code__in=remove_codes,
                ).delete()
                mappings_removed += deleted_count

        return {
            "permissions_created": permissions_created,
            "permissions_updated": permissions_updated,
            "roles_created": roles_created,
            "roles_updated": roles_updated,
            "mappings_added": mappings_added,
            "mappings_removed": mappings_removed,
        }
