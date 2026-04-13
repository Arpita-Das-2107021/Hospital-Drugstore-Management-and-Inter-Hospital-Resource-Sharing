from django.db import migrations


ML_ROLE_NAMES = ("ML_ADMIN", "ML_ENGINEER")
SYSTEM_ADMIN_ROLE_NAMES = ("SYSTEM_ADMIN", "PLATFORM_ADMIN")
HEALTHCARE_ADMIN_ROLE_NAMES = ("HEALTHCARE_ADMIN", "HOSPITAL_ADMIN")

ANALYTICS_PERMISSION_SPECS = (
    (
        "reports:analytics.view",
        "View Analytics Reports",
        "View platform analytics reports and aggregate trend insights.",
    ),
    (
        "reports:payment.view",
        "View Payment Reports",
        "View payment reporting dashboards and settlement summaries.",
    ),
)


def _ensure_permission(Permission, *, code: str, name: str, description: str):
    permission, _ = Permission.objects.get_or_create(
        code=code,
        defaults={
            "name": name,
            "description": description,
            "is_active": True,
        },
    )

    update_fields = []
    if not permission.is_active:
        permission.is_active = True
        update_fields.append("is_active")
    if not permission.name:
        permission.name = name
        update_fields.append("name")
    if not permission.description:
        permission.description = description
        update_fields.append("description")

    if update_fields:
        permission.save(update_fields=[*update_fields, "updated_at"])

    return permission


def _assign_permissions_to_platform_roles(PlatformRole, PlatformRolePermission, permissions):
    roles = PlatformRole.objects.filter(name__in=ML_ROLE_NAMES, is_active=True)
    for role in roles.iterator():
        for permission in permissions:
            PlatformRolePermission.objects.get_or_create(
                platform_role=role,
                permission=permission,
            )


def _assign_permissions_to_legacy_roles(Role, RolePermission, permissions):
    roles = Role.objects.filter(name__in=ML_ROLE_NAMES)
    for role in roles.iterator():
        for permission in permissions:
            RolePermission.objects.get_or_create(
                role=role,
                permission=permission,
            )


def _grant_platform_analytics(
    *,
    PlatformRole,
    PlatformRolePermission,
    Role,
    RolePermission,
    analytics_permissions,
):
    platform_roles = PlatformRole.objects.filter(name__in=SYSTEM_ADMIN_ROLE_NAMES, is_active=True)
    for platform_role in platform_roles.iterator():
        for permission in analytics_permissions:
            PlatformRolePermission.objects.get_or_create(
                platform_role=platform_role,
                permission=permission,
            )

    legacy_roles = Role.objects.filter(name__in=SYSTEM_ADMIN_ROLE_NAMES)
    for legacy_role in legacy_roles.iterator():
        for permission in analytics_permissions:
            RolePermission.objects.get_or_create(
                role=legacy_role,
                permission=permission,
            )


def realign_ml_and_analytics_permissions(apps, schema_editor):
    Permission = apps.get_model("staff", "Permission")
    PlatformRole = apps.get_model("staff", "PlatformRole")
    PlatformRolePermission = apps.get_model("staff", "PlatformRolePermission")
    HospitalRole = apps.get_model("staff", "HospitalRole")
    HospitalRolePermission = apps.get_model("staff", "HospitalRolePermission")
    Role = apps.get_model("staff", "Role")
    RolePermission = apps.get_model("staff", "RolePermission")

    ml_permissions = list(Permission.objects.filter(code__startswith="ml:", is_active=True))
    if ml_permissions:
        ml_permission_ids = [permission.id for permission in ml_permissions]

        PlatformRolePermission.objects.filter(
            platform_role__name__in=SYSTEM_ADMIN_ROLE_NAMES,
            permission_id__in=ml_permission_ids,
        ).delete()

        HospitalRolePermission.objects.filter(
            hospital_role__name__in=HEALTHCARE_ADMIN_ROLE_NAMES,
            permission_id__in=ml_permission_ids,
        ).delete()

        RolePermission.objects.filter(
            role__name__in=(*SYSTEM_ADMIN_ROLE_NAMES, *HEALTHCARE_ADMIN_ROLE_NAMES),
            permission_id__in=ml_permission_ids,
        ).delete()

        _assign_permissions_to_platform_roles(PlatformRole, PlatformRolePermission, ml_permissions)
        _assign_permissions_to_legacy_roles(Role, RolePermission, ml_permissions)

    analytics_permissions = [
        _ensure_permission(
            Permission,
            code=code,
            name=name,
            description=description,
        )
        for code, name, description in ANALYTICS_PERMISSION_SPECS
    ]

    _grant_platform_analytics(
        PlatformRole=PlatformRole,
        PlatformRolePermission=PlatformRolePermission,
        Role=Role,
        RolePermission=RolePermission,
        analytics_permissions=analytics_permissions,
    )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("staff", "0014_grant_inventory_price_update_permissions_to_hospital_admin"),
    ]

    operations = [
        migrations.RunPython(realign_ml_and_analytics_permissions, noop_reverse),
    ]
