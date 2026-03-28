"""Hospital admin registrations."""
from django.contrib import admin

from .models import (
    Hospital,
    HospitalAPIConfig,
    HospitalCapacity,
    HospitalOffboardingRequest,
    HospitalPartnership,
    HospitalRegistrationRequest,
    HospitalUpdateRequest,
)


@admin.register(HospitalRegistrationRequest)
class HospitalRegistrationRequestAdmin(admin.ModelAdmin):
    list_display = ("name", "registration_number", "email", "hospital_type", "status", "submitted_at", "reviewed_at")
    list_filter = ("status", "hospital_type", "country")
    search_fields = ("name", "registration_number", "email")
    readonly_fields = ("id", "api_key", "api_password", "submitted_at", "updated_at")
    ordering = ("-submitted_at",)

    def get_fields(self, request, obj=None):
        fields = super().get_fields(request, obj)
        # Never show raw encrypted credentials in admin
        return fields

@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = ("name", "hospital_type", "verified_status", "city", "country", "created_at")
    list_filter = ("verified_status", "hospital_type", "country")
    search_fields = ("name", "registration_number", "email")
    readonly_fields = ("id", "created_at", "updated_at")
    ordering = ("-created_at",)


@admin.register(HospitalOffboardingRequest)
class HospitalOffboardingRequestAdmin(admin.ModelAdmin):
    list_display = ("hospital", "status", "requested_by", "requested_at", "reviewed_by", "reviewed_at")
    list_filter = ("status", "requested_at", "reviewed_at")
    search_fields = ("hospital__name", "hospital__registration_number")
    readonly_fields = ("id", "requested_at", "updated_at")
    ordering = ("-requested_at",)


@admin.register(HospitalUpdateRequest)
class HospitalUpdateRequestAdmin(admin.ModelAdmin):
    list_display = ("hospital", "status", "requested_by", "requested_at", "reviewed_by", "reviewed_at")
    list_filter = ("status", "requested_at", "reviewed_at")
    search_fields = ("hospital__name", "hospital__registration_number")
    readonly_fields = ("id", "requested_at", "updated_at")
    ordering = ("-requested_at",)


@admin.register(HospitalCapacity)
class HospitalCapacityAdmin(admin.ModelAdmin):
    list_display = ("hospital", "bed_total", "bed_available", "icu_total", "icu_available", "last_updated")
    readonly_fields = ("id", "last_updated")


@admin.register(HospitalAPIConfig)
class HospitalAPIConfigAdmin(admin.ModelAdmin):
    list_display = ("hospital", "api_endpoint", "is_active", "last_sync", "created_at")
    list_filter = ("is_active",)
    readonly_fields = ("id", "encrypted_token", "created_at", "updated_at")
    # Never show raw token in admin


@admin.register(HospitalPartnership)
class HospitalPartnershipAdmin(admin.ModelAdmin):
    list_display = ("hospital_a", "hospital_b", "initiated_by", "status", "created_at")
    list_filter = ("status",)
    readonly_fields = ("id", "created_at")
