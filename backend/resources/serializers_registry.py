# backend/resources/serializers_registry.py
"""
Serializers for Hospital Registration
"""

from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from .models_registry import (
    Hospital, HospitalAPIConfig, User, Staff, Role,
    HospitalStatus, AuthType, ConnectionStatus, EmploymentStatus, UserStatus
)


class HospitalAPIConfigSerializer(serializers.ModelSerializer):
    """Serializer for Hospital API Configuration"""
    
    class Meta:
        model = HospitalAPIConfig
        fields = [
            'api_base_url',
            'auth_type',
            'api_key',
            'api_secret',
            'inventory_endpoint',
            'staff_endpoint',
            'transfer_request_endpoint',
        ]
        extra_kwargs = {
            'api_key': {'write_only': True},
            'api_secret': {'write_only': True},
        }

    def validate_api_base_url(self, value):
        """Ensure API base URL is properly formatted"""
        if not value.startswith(('http://', 'https://')):
            raise serializers.ValidationError("API base URL must start with http:// or https://")
        if value.endswith('/'):
            value = value[:-1]  # Remove trailing slash
        return value


class HospitalAdminUserSerializer(serializers.Serializer):
    """Serializer for Hospital Admin User during registration"""
    
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    designation = serializers.CharField(max_length=100, default='Hospital Administrator')

    def validate_username(self, value):
        """Check if username already exists"""
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists")
        return value

    def validate_email(self, value):
        """Check if email already exists"""
        if Staff.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered")
        return value

    def validate(self, data):
        """Validate password match and strength"""
        password = data.get('password')
        confirm_password = data.get('confirm_password')

        if password != confirm_password:
            raise serializers.ValidationError({
                'confirm_password': 'Passwords do not match'
            })

        # Validate password strength
        try:
            validate_password(password)
        except DjangoValidationError as e:
            raise serializers.ValidationError({
                'password': list(e.messages)
            })

        return data


class HospitalRegistrationSerializer(serializers.Serializer):
    """Main serializer for Hospital Registration"""
    
    # Hospital Information
    hospital_name = serializers.CharField(max_length=255)
    license_number = serializers.CharField(max_length=100)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=50, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    contact_email = serializers.EmailField()
    contact_phone = serializers.CharField(max_length=20)
    
    # API Configuration
    api_config = HospitalAPIConfigSerializer()
    
    # Hospital Admin User
    admin_user = HospitalAdminUserSerializer()

    def validate_license_number(self, value):
        """Check if license number already exists"""
        if Hospital.objects.filter(license_number=value).exists():
            raise serializers.ValidationError("License number already registered")
        return value

    def validate_contact_email(self, value):
        """Check if contact email already exists"""
        if Hospital.objects.filter(email=value).exists():
            raise serializers.ValidationError("Contact email already registered")
        return value

    def validate(self, data):
        """Additional cross-field validation"""
        # Ensure admin email matches hospital contact email or is different
        admin_email = data['admin_user']['email']
        contact_email = data['contact_email']
        
        # Optional: You can enforce they should be the same or different based on your requirements
        # For now, we'll allow them to be different
        
        return data


class HospitalSerializer(serializers.ModelSerializer):
    """Serializer for Hospital model"""
    
    api_config = HospitalAPIConfigSerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = Hospital
        fields = [
            'id',
            'code',
            'name',
            'license_number',
            'email',
            'phone',
            'address',
            'city',
            'state',
            'postal_code',
            'status',
            'status_display',
            'verified_at',
            'created_at',
            'updated_at',
            'api_config',
        ]
        read_only_fields = ['id', 'code', 'status', 'verified_at', 'created_at', 'updated_at']


class StaffSerializer(serializers.ModelSerializer):
    """Serializer for Staff model"""
    
    full_name = serializers.CharField(read_only=True)
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    
    class Meta:
        model = Staff
        fields = [
            'id',
            'employee_code',
            'first_name',
            'last_name',
            'full_name',
            'email',
            'phone',
            'designation',
            'specialization',
            'employment_status',
            'hospital',
            'hospital_name',
            'department',
            'hire_date',
            'years_experience',
        ]
        read_only_fields = ['id', 'employee_code']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model"""
    
    full_name = serializers.CharField(read_only=True)
    email = serializers.CharField(read_only=True)
    hospital_name = serializers.SerializerMethodField()
    role_name = serializers.CharField(source='role.name', read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'full_name',
            'email',
            'role',
            'role_name',
            'status',
            'hospital_name',
            'last_login',
            'created_at',
        ]
        read_only_fields = ['id', 'last_login', 'created_at']

    def get_hospital_name(self, obj):
        """Get hospital name from staff relationship"""
        if obj.staff and obj.staff.hospital:
            return obj.staff.hospital.name
        return None


class HospitalRegistrationResponseSerializer(serializers.Serializer):
    """Response serializer for successful hospital registration"""
    
    hospital = HospitalSerializer()
    admin_user = UserSerializer()


class HospitalListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing hospitals"""
    
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    connection_status = serializers.SerializerMethodField()
    
    class Meta:
        model = Hospital
        fields = [
            'id',
            'code',
            'name',
            'license_number',
            'email',
            'phone',
            'city',
            'state',
            'status',
            'status_display',
            'connection_status',
            'verified_at',
            'created_at',
        ]
    
    def get_connection_status(self, obj):
        """Get API connection status"""
        if hasattr(obj, 'api_config'):
            return obj.api_config.connection_status
        return None

    def get_hospital_name(self, obj):
        """Get hospital name through staff relationship"""
        return obj.hospital.name if obj.hospital else None


class HospitalRegistrationResponseSerializer(serializers.Serializer):
    """Serializer for registration response"""
    
    hospital = HospitalSerializer()
    admin_user = UserSerializer()
    message = serializers.CharField()
    
    class Meta:
        fields = ['hospital', 'admin_user', 'message']
