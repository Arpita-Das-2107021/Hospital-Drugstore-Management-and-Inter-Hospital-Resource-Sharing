"""
DRF Serializers for Hospital Resource Sharing System V2
Maps to the new enterprise database schema
"""

from rest_framework import serializers
from .new_models import (
    Hospital, Role, Permission, RolePermission, Department, Staff, 
    UserAccount, UserRole, Resource, Inventory, ResourceRequest, 
    ResourceRequestItem, AuditLog
)


class HospitalSerializer(serializers.ModelSerializer):
    """Serializer for Hospital model"""
    
    class Meta:
        model = Hospital
        fields = [
            'id', 'code', 'name', 'license_number', 'email', 'phone', 
            'address', 'city', 'state', 'postal_code', 'status', 
            'verified_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for Role model"""
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'display_name', 'description', 'is_system_role', 'created_at']
        read_only_fields = ['id', 'created_at']


class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for Permission model"""
    
    class Meta:
        model = Permission
        fields = ['id', 'name', 'display_name', 'description', 'resource', 'action', 'created_at']
        read_only_fields = ['id', 'created_at']


class DepartmentSerializer(serializers.ModelSerializer):
    """Serializer for Department model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    
    class Meta:
        model = Department
        fields = [
            'id', 'hospital', 'hospital_name', 'code', 'name', 'type', 
            'floor_location', 'bed_capacity', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StaffSerializer(serializers.ModelSerializer):
    """Serializer for Staff model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    full_name = serializers.CharField(read_only=True)
    
    class Meta:
        model = Staff
        fields = [
            'id', 'hospital', 'hospital_name', 'department', 'department_name',
            'employee_code', 'first_name', 'last_name', 'full_name', 'email', 
            'phone', 'designation', 'specialization', 'license_number', 
            'employment_status', 'hire_date', 'years_experience', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'full_name', 'created_at', 'updated_at']


class UserAccountSerializer(serializers.ModelSerializer):
    """Serializer for UserAccount model"""
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    staff_email = serializers.CharField(source='staff.email', read_only=True)
    hospital_name = serializers.CharField(source='staff.hospital.name', read_only=True)
    role_name = serializers.CharField(source='role.display_name', read_only=True)
    
    class Meta:
        model = UserAccount
        fields = [
            'id', 'staff', 'staff_name', 'staff_email', 'hospital_name', 
            'role', 'role_name', 'username', 'status', 'last_login', 
            'failed_login_attempts', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'staff_name', 'staff_email', 'hospital_name', 'role_name', 'created_at', 'updated_at']


class ResourceSerializer(serializers.ModelSerializer):
    """Serializer for Resource model"""
    
    class Meta:
        model = Resource
        fields = [
            'id', 'code', 'name', 'type', 'category', 'unit', 
            'description', 'standard_specification', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class InventorySerializer(serializers.ModelSerializer):
    """Serializer for Inventory model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    resource_code = serializers.CharField(source='resource.code', read_only=True)
    resource_type = serializers.CharField(source='resource.type', read_only=True)
    resource_category = serializers.CharField(source='resource.category', read_only=True)
    resource_unit = serializers.CharField(source='resource.unit', read_only=True)
    stock_level = serializers.CharField(read_only=True)
    is_expiring_soon = serializers.BooleanField(read_only=True)
    
    # Calculate additional fields
    total_value = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()
    
    class Meta:
        model = Inventory
        fields = [
            'id', 'hospital', 'hospital_name', 'resource', 'resource_name', 
            'resource_code', 'resource_type', 'resource_category', 'resource_unit',
            'available_quantity', 'reserved_quantity', 'unit_price', 'total_value',
            'reorder_level', 'max_level', 'stock_level', 'batch_number', 
            'expiry_date', 'days_until_expiry', 'is_expiring_soon',
            'storage_location', 'last_updated', 'created_at'
        ]
        read_only_fields = ['id', 'stock_level', 'is_expiring_soon', 'total_value', 'days_until_expiry', 'last_updated', 'created_at']
    
    def get_total_value(self, obj):
        """Calculate total inventory value"""
        return float(obj.available_quantity * obj.unit_price)
    
    def get_days_until_expiry(self, obj):
        """Calculate days until expiry"""
        if obj.expiry_date:
            from django.utils import timezone
            delta = obj.expiry_date - timezone.now().date()
            return delta.days
        return None


class ResourceRequestItemSerializer(serializers.ModelSerializer):
    """Serializer for ResourceRequestItem model"""
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    resource_code = serializers.CharField(source='resource.code', read_only=True)
    resource_unit = serializers.CharField(source='resource.unit', read_only=True)
    
    class Meta:
        model = ResourceRequestItem
        fields = [
            'id', 'resource', 'resource_name', 'resource_code', 'resource_unit',
            'quantity_requested', 'quantity_approved', 'quantity_dispatched', 
            'quantity_received', 'unit_price', 'notes'
        ]
        read_only_fields = ['id', 'resource_name', 'resource_code', 'resource_unit']


class ResourceRequestSerializer(serializers.ModelSerializer):
    """Serializer for ResourceRequest model"""
    requesting_hospital_name = serializers.CharField(source='requesting_hospital.name', read_only=True)
    supplying_hospital_name = serializers.CharField(source='supplying_hospital.name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.staff.full_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.staff.full_name', read_only=True)
    items = ResourceRequestItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = ResourceRequest
        fields = [
            'id', 'request_number', 'requesting_hospital', 'requesting_hospital_name',
            'supplying_hospital', 'supplying_hospital_name', 'requested_by', 'requested_by_name',
            'reviewed_by', 'reviewed_by_name', 'status', 'priority', 'reason', 
            'requested_at', 'reviewed_at', 'approved_at', 'dispatched_at', 
            'received_at', 'completed_at', 'cancelled_at', 'items', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'requesting_hospital_name', 'supplying_hospital_name', 
            'requested_by_name', 'reviewed_by_name', 'items', 'created_at', 'updated_at'
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for AuditLog model"""
    user_name = serializers.CharField(source='user.staff.full_name', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_name', 'action', 'entity_type', 'entity_id',
            'old_values', 'new_values', 'timestamp', 'ip_address', 'user_agent'
        ]
        read_only_fields = ['id', 'user_name', 'timestamp']


# Dashboard and Analytics Serializers

class InventoryAnalyticsSerializer(serializers.Serializer):
    """Serializer for inventory analytics data"""
    total_items = serializers.IntegerField()
    low_stock_items = serializers.IntegerField()
    expiring_soon_items = serializers.IntegerField()
    out_of_stock_items = serializers.IntegerField()
    total_value = serializers.DecimalField(max_digits=20, decimal_places=2)
    
    stock_level_distribution = serializers.DictField()
    category_breakdown = serializers.DictField()
    expiry_timeline = serializers.ListField()
    top_value_items = serializers.ListField()


class HospitalDashboardSerializer(serializers.Serializer):
    """Serializer for hospital dashboard data"""
    total_staff = serializers.IntegerField()
    active_staff = serializers.IntegerField()
    total_departments = serializers.IntegerField()
    total_inventory_items = serializers.IntegerField()
    total_inventory_value = serializers.DecimalField(max_digits=20, decimal_places=2)
    
    pending_requests = serializers.IntegerField()
    completed_requests_today = serializers.IntegerField()
    active_alerts = serializers.IntegerField()
    
    recent_requests = ResourceRequestSerializer(many=True)
    inventory_alerts = InventorySerializer(many=True)
    staff_online = StaffSerializer(many=True)


class RequestAnalyticsSerializer(serializers.Serializer):
    """Serializer for request analytics data"""
    total_requests = serializers.IntegerField()
    pending_requests = serializers.IntegerField()
    approved_requests = serializers.IntegerField()
    completed_requests = serializers.IntegerField()
    
    average_approval_time = serializers.FloatField()
    average_fulfillment_time = serializers.FloatField()
    
    requests_by_status = serializers.DictField()
    requests_by_priority = serializers.DictField()
    monthly_trend = serializers.ListField()
    top_requested_resources = serializers.ListField()