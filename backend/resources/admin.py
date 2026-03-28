"""
Django Admin Configuration for Resources App

Provides admin interface for managing hospital resources, sync logs,
and monitoring the synchronization process.
"""

from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe

from .models import (
    ResourceHospital,
    ResourceCategory,
    SharedResource,
    InventorySyncLog,
    BedOccupancy,
    UserProfile,
    ResourceRequest,
    Alert,
    AuditLog,
    RolePermission,
    Message,
    InventoryItem,
)


@admin.register(ResourceHospital)
class ResourceHospitalAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'city', 'region', 'trust_level', 'total_beds',
        'last_sync', 'is_active', 'sync_status'
    ]
    list_filter = ['trust_level', 'region', 'is_active', 'created_at']
    search_fields = ['name', 'city', 'contact_email']
    readonly_fields = ['external_hospital_id', 'last_sync', 'created_at', 'updated_at']
    fieldsets = [
        ('Basic Information', {
            'fields': ['name', 'external_hospital_id', 'region', 'city']
        }),
        ('Contact Information', {
            'fields': ['contact_email', 'contact_phone', 'api_endpoint']
        }),
        ('Configuration', {
            'fields': ['trust_level', 'total_beds', 'specialties']
        }),
        ('Location', {
            'fields': ['coordinates_lat', 'coordinates_lng'],
            'classes': ['collapse']
        }),
        ('Status', {
            'fields': ['is_active', 'last_sync']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        })
    ]
    
    def sync_status(self, obj):
        """Display sync status with color coding."""
        if not obj.last_sync:
            return format_html('<span style="color: red;">Never synced</span>')
        
        from django.utils import timezone
        from datetime import timedelta
        
        time_diff = timezone.now() - obj.last_sync
        if time_diff < timedelta(minutes=10):
            color = 'green'
            status = 'Recent'
        elif time_diff < timedelta(hours=1):
            color = 'orange'
            status = 'Warning'
        else:
            color = 'red'
            status = 'Overdue'
        
        return format_html(
            '<span style="color: {};">{}</span>',
            color, status
        )
    
    sync_status.short_description = 'Sync Status'


@admin.register(ResourceCategory)
class ResourceCategoryAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'type', 'unit_of_measure', 'requires_cold_chain',
        'max_transport_hours', 'resource_count'
    ]
    list_filter = ['type', 'requires_cold_chain']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    
    def resource_count(self, obj):
        """Display count of resources in this category."""
        return obj.resources.count()
    
    resource_count.short_description = 'Resource Count'


@admin.register(SharedResource)
class SharedResourceAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'hospital', 'category', 'available_quantity',
        'visibility_level', 'quality_grade', 'expiry_status', 'last_updated'
    ]
    list_filter = [
        'category', 'hospital', 'visibility_level', 'quality_grade',
        'is_emergency_stock', 'last_updated'
    ]
    search_fields = ['name', 'description', 'batch_number']
    readonly_fields = [
        'external_resource_id', 'days_until_expiry',
        'is_available', 'created_at', 'last_updated'
    ]
    fieldsets = [
        ('Basic Information', {
            'fields': [
                'name', 'description', 'hospital', 'category',
                'external_resource_id'
            ]
        }),
        ('Quantities', {
            'fields': [
                'current_quantity', 'available_quantity',
                'reserved_quantity', 'minimum_reserve'
            ]
        }),
        ('Quality & Pricing', {
            'fields': ['quality_grade', 'unit_price', 'batch_number']
        }),
        ('Expiry & Storage', {
            'fields': [
                'expiry_date', 'days_until_expiry', 'storage_requirements'
            ]
        }),
        ('Sharing Configuration', {
            'fields': ['visibility_level', 'is_emergency_stock']
        }),
        ('Status', {
            'fields': ['is_available', 'last_updated', 'created_at'],
            'classes': ['collapse']
        })
    ]
    
    def expiry_status(self, obj):
        """Display expiry status with color coding."""
        days = obj.days_until_expiry
        if days is None:
            return 'N/A'
        
        if days < 0:
            return format_html('<span style="color: red;">Expired</span>')
        elif days <= 7:
            return format_html('<span style="color: orange;">{} days</span>', days)
        elif days <= 30:
            return format_html('<span style="color: blue;">{} days</span>', days)
        else:
            return format_html('{} days', days)
    
    expiry_status.short_description = 'Expiry Status'


@admin.register(InventorySyncLog)
class InventorySyncLogAdmin(admin.ModelAdmin):
    list_display = [
        'hospital', 'sync_type', 'sync_status', 'records_processed',
        'success_rate_display', 'started_at', 'duration'
    ]
    list_filter = [
        'sync_type', 'sync_status', 'external_system_type', 'started_at'
    ]
    search_fields = ['hospital__name', 'error_details']
    readonly_fields = [
        'success_rate', 'duration', 'started_at', 'completed_at'
    ]
    fieldsets = [
        ('Sync Information', {
            'fields': [
                'hospital', 'sync_type', 'external_system_type',
                'sync_status'
            ]
        }),
        ('Statistics', {
            'fields': [
                'records_processed', 'records_updated', 'records_failed',
                'success_rate'
            ]
        }),
        ('Timing', {
            'fields': [
                'started_at', 'completed_at', 'duration',
                'next_sync_scheduled'
            ]
        }),
        ('Errors', {
            'fields': ['error_details'],
            'classes': ['collapse']
        })
    ]
    
    def success_rate_display(self, obj):
        """Display success rate with color coding."""
        rate = obj.success_rate
        if rate >= 95:
            color = 'green'
        elif rate >= 80:
            color = 'orange'
        else:
            color = 'red'
        
        return format_html(
            '<span style="color: {};">{:.1f}%</span>',
            color, rate
        )
    
    success_rate_display.short_description = 'Success Rate'
    
    def duration(self, obj):
        """Calculate and display sync duration."""
        if obj.started_at and obj.completed_at:
            delta = obj.completed_at - obj.started_at
            return f"{delta.total_seconds():.1f}s"
        return 'N/A'
    
    duration.short_description = 'Duration'


@admin.register(BedOccupancy)
class BedOccupancyAdmin(admin.ModelAdmin):
    list_display = [
        'hospital', 'bed_type', 'available_beds', 'total_beds',
        'occupancy_rate_display', 'last_updated'
    ]
    list_filter = ['bed_type', 'hospital', 'last_updated']
    search_fields = ['hospital__name']
    readonly_fields = ['occupancy_rate', 'created_at', 'last_updated']
    
    def occupancy_rate_display(self, obj):
        """Display occupancy rate with color coding."""
        rate = obj.occupancy_rate
        if rate >= 90:
            color = 'red'
        elif rate >= 75:
            color = 'orange'
        else:
            color = 'green'
        
        return format_html(
            '<span style="color: {};">{:.1f}%</span>',
            color, rate
        )
    
    occupancy_rate_display.short_description = 'Occupancy Rate'


# Admin site customization
admin.site.site_header = "Hospital Resource Sharing Admin"
admin.site.site_title = "Resource Sharing"
admin.site.index_title = "Welcome to Resource Sharing Administration"


# Register additional models
@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'email', 'role', 'hospital', 'is_online', 'is_active']
    list_filter = ['role', 'hospital', 'is_online', 'is_active']
    search_fields = ['full_name', 'email']
    readonly_fields = ['external_staff_id', 'created_at', 'updated_at', 'last_seen']


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'hospital', 'category', 'current_stock', 'reorder_level', 
                    'abc_classification', 'ved_classification', 'expiry_date']
    list_filter = ['hospital', 'category', 'abc_classification', 'ved_classification']
    search_fields = ['name', 'supplier']
    readonly_fields = ['external_medication_id', 'days_until_expiry', 'is_critical_stock', 
                       'created_at', 'last_updated']


@admin.register(ResourceRequest)
class ResourceRequestAdmin(admin.ModelAdmin):
    list_display = ['resource', 'requesting_hospital', 'providing_hospital', 
                    'quantity', 'urgency', 'status', 'requested_at']
    list_filter = ['status', 'urgency', 'requesting_hospital', 'providing_hospital']
    search_fields = ['justification', 'response_notes']
    readonly_fields = ['days_since_request', 'requested_at', 'updated_at']


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ['title', 'hospital', 'alert_type', 'severity', 'is_read', 
                    'is_resolved', 'created_at']
    list_filter = ['alert_type', 'severity', 'is_read', 'is_resolved', 'hospital']
    search_fields = ['title', 'message']
    readonly_fields = ['created_at', 'resolved_at']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'user', 'hospital', 'action_type', 'timestamp']
    list_filter = ['action_type', 'hospital', 'timestamp']
    search_fields = ['action', 'resource_name', 'details']
    readonly_fields = ['timestamp']


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ['role', 'created_at']
    search_fields = ['role', 'description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'recipient', 'subject', 'is_read', 'created_at']
    list_filter = ['message_type', 'is_read', 'created_at']
    search_fields = ['subject', 'content']
    readonly_fields = ['created_at', 'read_at']
