"""Staff app admin registrations."""
from django.contrib import admin

from .models import (
    HospitalRole,
    HospitalRolePermission,
    Invitation,
    Permission,
    PlatformRole,
    PlatformRolePermission,
    Role,
    RolePermission,
    Staff,
    UserHospitalRole,
    UserPlatformRole,
    UserRole,
)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "created_at")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at")


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ("role", "permission", "assigned_at", "assigned_by")
    list_filter = ("role", "permission")
    search_fields = ("role__name", "permission__code", "permission__name")
    readonly_fields = ("id", "assigned_at")


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ("full_name", "hospital", "department", "position", "employment_status", "created_at")
    list_filter = ("employment_status", "hospital")
    search_fields = ("first_name", "last_name", "employee_id")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "hospital", "assigned_at")
    list_filter = ("role", "hospital")
    readonly_fields = ("id", "assigned_at")


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "hospital", "role", "status", "expires_at", "created_at")
    list_filter = ("status", "hospital")
    search_fields = ("email",)
    readonly_fields = ("id", "token", "created_at", "updated_at")


@admin.register(PlatformRole)
class PlatformRoleAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(PlatformRolePermission)
class PlatformRolePermissionAdmin(admin.ModelAdmin):
    list_display = ("platform_role", "permission", "assigned_at", "assigned_by")
    list_filter = ("platform_role", "permission")
    search_fields = ("platform_role__name", "permission__code")
    readonly_fields = ("id", "assigned_at")


@admin.register(UserPlatformRole)
class UserPlatformRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "platform_role", "assigned_at")
    list_filter = ("platform_role",)
    readonly_fields = ("id", "assigned_at")


@admin.register(HospitalRole)
class HospitalRoleAdmin(admin.ModelAdmin):
    list_display = ("name", "hospital", "is_active", "created_at")
    list_filter = ("hospital", "is_active")
    search_fields = ("name", "hospital__name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(HospitalRolePermission)
class HospitalRolePermissionAdmin(admin.ModelAdmin):
    list_display = ("hospital_role", "permission", "assigned_at", "assigned_by")
    list_filter = ("hospital_role", "permission")
    search_fields = ("hospital_role__name", "permission__code")
    readonly_fields = ("id", "assigned_at")


@admin.register(UserHospitalRole)
class UserHospitalRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "hospital", "hospital_role", "assigned_at")
    list_filter = ("hospital", "hospital_role")
    readonly_fields = ("id", "assigned_at")
