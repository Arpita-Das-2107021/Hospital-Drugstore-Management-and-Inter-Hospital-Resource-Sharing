"""Staff app admin registrations."""
from django.contrib import admin

from .models import Invitation, Role, Staff, UserRole


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "created_at")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at")


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
