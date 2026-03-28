# backend/resources/models_registry.py
"""
Models for Hospital Registration and User Management
Compatible with existing hospital_resource_sharing_v2 database
"""

import uuid
from django.db import models
from django.core.validators import EmailValidator, RegexValidator
from django.utils import timezone


class HospitalStatus(models.TextChoices):
    """Hospital verification status choices"""
    PENDING = 'PENDING', 'Pending Verification'
    VERIFIED = 'VERIFIED', 'Verified'
    ACTIVE = 'ACTIVE', 'Active'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    REJECTED = 'REJECTED', 'Rejected'


class Hospital(models.Model):
    """Hospital model mapping to existing 'hospital' table"""
    
    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    license_number = models.CharField(max_length=100, unique=True)
    email = models.EmailField(validators=[EmailValidator()])
    phone = models.CharField(
        max_length=20,
        validators=[
            RegexValidator(
                regex=r'^\+?1?\d{9,15}$',
                message="Phone number must be entered in the format: '+999999999'. Up to 15 digits allowed."
            )
        ]
    )
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=50, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=HospitalStatus.choices,
        default=HospitalStatus.PENDING
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital'
        managed = False
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['code']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def generate_code(self):
        """Generate unique hospital code"""
        # Get the last hospital code
        last_hospital = Hospital.objects.order_by('-id').first()
        if last_hospital and last_hospital.code.startswith('H'):
            try:
                last_number = int(last_hospital.code[1:])
                return f'H{str(last_number + 1).zfill(3)}'
            except ValueError:
                pass
        return 'H001'


class AuthType(models.TextChoices):
    """API authentication type choices"""
    API_KEY = 'API_KEY', 'API Key'
    BEARER = 'BEARER', 'Bearer Token'
    BASIC = 'BASIC', 'Basic Auth'


class ConnectionStatus(models.TextChoices):
    """API connection status choices"""
    PENDING = 'PENDING', 'Pending'
    CONNECTED = 'CONNECTED', 'Connected'
    FAILED = 'FAILED', 'Failed'
    DISCONNECTED = 'DISCONNECTED', 'Disconnected'


class HospitalAPIConfig(models.Model):
    """Hospital API configuration for external system integration"""
    
    id = models.AutoField(primary_key=True)
    hospital = models.OneToOneField(
        Hospital,
        on_delete=models.CASCADE,
        related_name='api_config'
    )
    api_base_url = models.URLField(max_length=500)
    auth_type = models.CharField(
        max_length=20,
        choices=AuthType.choices,
        default=AuthType.API_KEY
    )
    api_key = models.CharField(max_length=500, blank=True)
    api_secret = models.CharField(max_length=500, blank=True)  # For Bearer token or Basic auth
    
    # Endpoint configurations
    inventory_endpoint = models.CharField(max_length=200, default='/api/inventory')
    staff_endpoint = models.CharField(max_length=200, default='/api/staff')
    transfer_request_endpoint = models.CharField(max_length=200, default='/api/transfer-requests')
    
    # Connection status
    connection_status = models.CharField(
        max_length=20,
        choices=ConnectionStatus.choices,
        default=ConnectionStatus.PENDING
    )
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    
    # Configuration
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital_api_config'
        managed = False
        verbose_name = 'Hospital API Configuration'
        verbose_name_plural = 'Hospital API Configurations'

    def __str__(self):
        return f"API Config for {self.hospital.name}"


class EmploymentStatus(models.TextChoices):
    """Employment status choices"""
    ACTIVE = 'ACTIVE', 'Active'
    INACTIVE = 'INACTIVE', 'Inactive'
    ON_LEAVE = 'ON_LEAVE', 'On Leave'
    TERMINATED = 'TERMINATED', 'Terminated'
    RETIRED = 'RETIRED', 'Retired'


class Staff(models.Model):
    """Staff model mapping to existing 'staff' table"""
    
    id = models.AutoField(primary_key=True)
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.CASCADE,
        related_name='staff_members',
        db_column='hospital_id'
    )
    department = models.ForeignKey(
        'Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff_members',
        db_column='department_id'
    )
    employee_code = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    designation = models.CharField(max_length=100)  # Doctor, Nurse, Pharmacist, etc.
    specialization = models.CharField(max_length=255, blank=True, null=True)
    license_number = models.CharField(max_length=100, unique=True, null=True, blank=True)
    employment_status = models.CharField(
        max_length=20,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE
    )
    hire_date = models.DateField(null=True, blank=True)
    years_experience = models.IntegerField(null=True, blank=True)
    external_ref_id = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'staff'
        managed = False
        ordering = ['last_name', 'first_name']
        indexes = [
            models.Index(fields=['hospital']),
            models.Index(fields=['department']),
            models.Index(fields=['email']),
            models.Index(fields=['employment_status']),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.designation}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class Department(models.Model):
    """Department model mapping to existing 'department' table"""
    
    id = models.AutoField(primary_key=True)
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.CASCADE,
        related_name='departments',
        db_column='hospital_id'
    )
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=50, blank=True, null=True)
    floor_location = models.CharField(max_length=100, blank=True, null=True)
    bed_capacity = models.IntegerField(default=0)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'department'
        managed = False
        unique_together = [['hospital', 'code']]
        indexes = [
            models.Index(fields=['hospital']),
            models.Index(fields=['type']),
        ]

    def __str__(self):
        return f"{self.name} - {self.hospital.name}"


class Role(models.Model):
    """Role model mapping to existing 'role' table"""
    
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'role'
        managed = False

    def __str__(self):
        return self.name


class UserStatus(models.TextChoices):
    """User account status choices"""
    INVITED = 'INVITED', 'Invited'
    ACTIVE = 'ACTIVE', 'Active'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    DISABLED = 'DISABLED', 'Disabled'


class User(models.Model):
    """
    User model for hospital resource sharing system
    Maps to 'user_account' table
    Note: This is NOT Django's auth User - it's a separate model for hospital users
    """
    
    id = models.AutoField(primary_key=True)
    staff = models.OneToOneField(
        Staff,
        on_delete=models.CASCADE,
        related_name='user_account',
        null=True,
        blank=True,
        db_column='staff_id'
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name='users',
        db_column='role_id'
    )
    username = models.CharField(max_length=150, unique=True)
    password = models.CharField(max_length=255)  # Will store hashed passwords
    status = models.CharField(
        max_length=20,
        choices=UserStatus.choices,
        default=UserStatus.INVITED
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    last_login = models.DateTimeField(null=True, blank=True)
    login_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_account'
        managed = False
        indexes = [
            models.Index(fields=['staff']),
            models.Index(fields=['status']),
            models.Index(fields=['username']),
        ]

    def __str__(self):
        return f"{self.username} ({self.role.name})"

    @property
    def hospital(self):
        """Get user's hospital through staff relationship"""
        return self.staff.hospital if self.staff else None

    @property
    def full_name(self):
        """Get user's full name through staff relationship"""
        return self.staff.full_name if self.staff else self.username

    @property
    def email(self):
        """Get user's email through staff relationship"""
        return self.staff.email if self.staff else None

    def is_account_locked(self):
        """Check if account is currently locked"""
        if self.locked_until:
            return timezone.now() < self.locked_until
        return False

    def lock_account(self, duration_minutes=30):
        """Lock account for specified duration"""
        self.locked_until = timezone.now() + timezone.timedelta(minutes=duration_minutes)
        self.save(update_fields=['locked_until'])

    def unlock_account(self):
        """Unlock account and reset login attempts"""
        self.login_attempts = 0
        self.locked_until = None
        self.save(update_fields=['login_attempts', 'locked_until'])
