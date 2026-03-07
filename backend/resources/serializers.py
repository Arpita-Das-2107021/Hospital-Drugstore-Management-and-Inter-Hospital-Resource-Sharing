"""
Serializers for Hospital Resource Sharing System
"""

from rest_framework import serializers
from .models import (
    ResourceHospital, ResourceCategory, SharedResource, 
    InventorySyncLog, BedOccupancy, UserProfile, ResourceRequest, 
    Alert, AuditLog, RolePermission, Message, InventoryItem
)


class ResourceHospitalSerializer(serializers.ModelSerializer):
    """Serializer for ResourceHospital model"""
    
    class Meta:
        model = ResourceHospital
        fields = '__all__'


class ResourceCategorySerializer(serializers.ModelSerializer):
    """Serializer for ResourceCategory model"""
    
    class Meta:
        model = ResourceCategory
        fields = '__all__'


class SharedResourceSerializer(serializers.ModelSerializer):
    """Serializer for SharedResource model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_type = serializers.CharField(source='category.type', read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = SharedResource
        fields = '__all__'


class InventorySyncLogSerializer(serializers.ModelSerializer):
    """Serializer for InventorySyncLog model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    success_rate = serializers.FloatField(read_only=True)
    
    class Meta:
        model = InventorySyncLog
        fields = '__all__'


class BedOccupancySerializer(serializers.ModelSerializer):
    """Serializer for BedOccupancy model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    occupancy_rate = serializers.FloatField(read_only=True)
    
    class Meta:
        model = BedOccupancy
        fields = '__all__'


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for UserProfile model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    hospital_city = serializers.CharField(source='hospital.city', read_only=True)
    hospital_region = serializers.CharField(source='hospital.region', read_only=True)
    
    class Meta:
        model = UserProfile
        fields = '__all__'


class ResourceRequestSerializer(serializers.ModelSerializer):
    """Serializer for ResourceRequest model"""
    requesting_hospital_name = serializers.CharField(source='requesting_hospital.name', read_only=True)
    providing_hospital_name = serializers.CharField(source='providing_hospital.name', read_only=True)
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    resource_type = serializers.CharField(source='resource.category.type', read_only=True)
    days_since_request = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = ResourceRequest
        fields = '__all__'


class AlertSerializer(serializers.ModelSerializer):
    """Serializer for Alert model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    resource_name = serializers.CharField(source='resource.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Alert
        fields = '__all__'


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for AuditLog model"""
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = '__all__'


class RolePermissionSerializer(serializers.ModelSerializer):
    """Serializer for RolePermission model"""
    
    class Meta:
        model = RolePermission
        fields = '__all__'


class MessageSerializer(serializers.ModelSerializer):
    """Serializer for Message model"""
    sender_name = serializers.CharField(source='sender.full_name', read_only=True)
    recipient_name = serializers.CharField(source='recipient.full_name', read_only=True)
    
    class Meta:
        model = Message
        fields = '__all__'


class InventoryItemSerializer(serializers.ModelSerializer):
    """Serializer for InventoryItem model"""
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    is_critical_stock = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = InventoryItem
        fields = '__all__'
