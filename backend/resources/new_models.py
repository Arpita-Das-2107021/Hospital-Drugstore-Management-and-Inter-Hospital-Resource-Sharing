"""
Updated Django Models for Hospital Resource Sharing System V2
Maps to the new enterprise database schema with hospital-scoped constraints
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
import uuid


# Enterprise Database Models (V2 Schema)

class HospitalV2(models.Model):
    """Hospital model matching the new database schema"""
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
        ('SUSPENDED', 'Suspended'),
    ]
    
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=255)
    license_number = models.CharField(max_length=50, unique=True)
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=50)
    postal_code = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True, help_text="Soft delete timestamp")
    
    class Meta:
        db_table = 'hospital'
        
    def __str__(self):
        return f"{self.name} ({self.code})"


class Role(models.Model):
    """Role model for the new RBAC system"""
    name = models.CharField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_system_role = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'role'
        
    def __str__(self):
        return self.display_name


class Permission(models.Model):
    """Permission model for granular access control"""
    name = models.CharField(max_length=100, unique=True)
    display_name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    resource = models.CharField(max_length=50)
    action = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'permission'
        unique_together = [['resource', 'action']]
        
    def __str__(self):
        return f"{self.resource}:{self.action}"


class RolePermission(models.Model):
    """Many-to-many relationship between roles and permissions"""
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name='roles')
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey('UserAccount', on_delete=models.SET_NULL, null=True, blank=True)
    
    class Meta:
        db_table = 'role_permission'
        unique_together = [['role', 'permission']]
        

class Department(models.Model):
    """Department model with hospital scoping"""
    DEPARTMENT_TYPES = [
        ('clinical', 'Clinical'),
        ('support', 'Support'),
        ('administrative', 'Administrative'),
        ('emergency', 'Emergency'),
    ]
    
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='departments')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=DEPARTMENT_TYPES)
    floor_location = models.CharField(max_length=100, blank=True)
    bed_capacity = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'department'
        unique_together = [['hospital', 'code']]
        
    def __str__(self):
        return f"{self.hospital.name} - {self.name}"


class Staff(models.Model):
    """Staff model with hospital-scoped constraints"""
    EMPLOYMENT_STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
        ('ON_LEAVE', 'On Leave'),
        ('TERMINATED', 'Terminated'),
    ]
    
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='staff')
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='staff')
    employee_code = models.CharField(max_length=50)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    designation = models.CharField(max_length=100)
    specialization = models.CharField(max_length=255, blank=True)
    license_number = models.CharField(max_length=100, blank=True)
    employment_status = models.CharField(max_length=20, choices=EMPLOYMENT_STATUS_CHOICES, default='ACTIVE')
    hire_date = models.DateField()
    years_experience = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'staff'
        unique_together = [['hospital', 'employee_code'], ['hospital', 'email']]
        
    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.employee_code})"
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class UserAccount(models.Model):
    """User account model for authentication"""
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
        ('LOCKED', 'Locked'),
        ('SUSPENDED', 'Suspended'),
    ]
    
    staff = models.OneToOneField(Staff, on_delete=models.CASCADE, related_name='user_account')
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='user_accounts')
    username = models.CharField(max_length=150, unique=True)
    password_hash = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    last_login = models.DateTimeField(null=True, blank=True)
    failed_login_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'user_account'
        
    def __str__(self):
        return f"{self.username} ({self.staff.full_name})"


class UserRole(models.Model):
    """Many-to-many relationship for multi-role support"""
    user = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name='user_roles')
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='user_assignments')
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(UserAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='role_assignments_made')
    
    class Meta:
        db_table = 'user_role'
        unique_together = [['user', 'role']]


class Resource(models.Model):
    """Global resource catalog"""
    RESOURCE_TYPES = [
        ('MEDICINE', 'Medicine'),
        ('EQUIPMENT', 'Equipment'),
        ('BLOOD', 'Blood Product'),
        ('BED', 'Hospital Bed'),
    ]
    
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=RESOURCE_TYPES)
    category = models.CharField(max_length=100)
    unit = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    standard_specification = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'resource'
        
    def __str__(self):
        return f"{self.name} ({self.code})"


class Inventory(models.Model):
    """Hospital-specific inventory"""
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='inventory')
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='inventory')
    available_quantity = models.DecimalField(max_digits=15, decimal_places=3, validators=[MinValueValidator(0)])
    reserved_quantity = models.DecimalField(max_digits=15, decimal_places=3, default=0, validators=[MinValueValidator(0)])
    unit_price = models.DecimalField(max_digits=15, decimal_places=2, validators=[MinValueValidator(0)])
    reorder_level = models.DecimalField(max_digits=15, decimal_places=3, validators=[MinValueValidator(0)])
    max_level = models.DecimalField(max_digits=15, decimal_places=3, validators=[MinValueValidator(0)])
    batch_number = models.CharField(max_length=100, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    storage_location = models.CharField(max_length=255, blank=True)
    last_updated = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'inventory'
        unique_together = [['hospital', 'resource']]
        
    def __str__(self):
        return f"{self.hospital.name} - {self.resource.name}"
    
    @property 
    def stock_level(self):
        """Calculate stock level status"""
        if self.available_quantity <= self.reorder_level:
            return 'LOW'
        elif self.available_quantity >= self.max_level * 0.8:
            return 'GOOD'
        else:
            return 'MEDIUM'
    
    @property
    def is_expiring_soon(self):
        """Check if item is expiring within 90 days"""
        if not self.expiry_date:
            return False
        days_until_expiry = (self.expiry_date - timezone.now().date()).days
        return days_until_expiry <= 90


class ResourceRequest(models.Model):
    """Resource request model"""
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('DISPATCHED', 'Dispatched'),
        ('RECEIVED', 'Received'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    PRIORITY_CHOICES = [
        ('LOW', 'Low'),
        ('NORMAL', 'Normal'),
        ('HIGH', 'High'),
        ('URGENT', 'Urgent'),
        ('CRITICAL', 'Critical'),
    ]
    
    request_number = models.CharField(max_length=50, unique=True)
    requesting_hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='outgoing_requests')
    supplying_hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='incoming_requests')
    requested_by = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name='requests_created')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='NORMAL')
    reason = models.TextField()
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(UserAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='requests_reviewed')
    approved_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'resource_request'
        
    def __str__(self):
        return f"{self.request_number} ({self.requesting_hospital.name} → {self.supplying_hospital.name})"


class ResourceRequestItem(models.Model):
    """Individual items in a resource request"""
    request = models.ForeignKey(ResourceRequest, on_delete=models.CASCADE, related_name='items')
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE)
    quantity_requested = models.DecimalField(max_digits=15, decimal_places=3, validators=[MinValueValidator(0)])
    quantity_approved = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True, validators=[MinValueValidator(0)])
    quantity_dispatched = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True, validators=[MinValueValidator(0)])
    quantity_received = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True, validators=[MinValueValidator(0)])
    unit_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    notes = models.TextField(blank=True)
    
    class Meta:
        db_table = 'resource_request_item'
        
    def __str__(self):
        return f"{self.request.request_number} - {self.resource.name}"


class AuditLog(models.Model):
    """Audit log for tracking all system changes"""
    user = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name='audit_logs')
    action = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=255)
    old_values = models.JSONField(null=True, blank=True)
    new_values = models.JSONField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    class Meta:
        db_table = 'audit_log'
        
    def __str__(self):
        return f"{self.user.username} {self.action} {self.entity_type} at {self.timestamp}"