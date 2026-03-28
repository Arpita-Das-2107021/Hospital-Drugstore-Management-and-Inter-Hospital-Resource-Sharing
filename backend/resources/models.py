"""
Models for Hospital Resource Sharing System

This module contains the database models for managing inter-hospital resource sharing,
including hospitals, resources, sync logs, and transactions.
"""

import uuid
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator


class ResourceHospital(models.Model):
    """Model representing a hospital in the resource sharing network."""
    
    TRUST_LEVELS = [
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    external_hospital_id = models.UUIDField(unique=True, help_text="ID from dummy hospital system")
    name = models.CharField(max_length=255)
    region = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    coordinates_lat = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    coordinates_lng = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    trust_level = models.CharField(max_length=10, choices=TRUST_LEVELS, default='medium')
    specialties = models.JSONField(default=list, blank=True)
    total_beds = models.PositiveIntegerField(default=0)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    api_endpoint = models.URLField(blank=True, help_text="API endpoint for data synchronization")
    last_sync = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Resource Hospital"
        verbose_name_plural = "Resource Hospitals"
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.city})"


class ResourceCategory(models.Model):
    """Model representing categories of shareable resources."""
    
    RESOURCE_TYPES = [
        ('medication', 'Medication'),
        ('blood', 'Blood Products'),
        ('organ', 'Organs'),
        ('equipment', 'Medical Equipment'),
        ('bed', 'Hospital Beds'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    type = models.CharField(max_length=20, choices=RESOURCE_TYPES)
    description = models.TextField(blank=True)
    unit_of_measure = models.CharField(max_length=50)
    requires_cold_chain = models.BooleanField(default=False)
    max_transport_hours = models.PositiveIntegerField(null=True, blank=True)
    regulatory_category = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Resource Category"
        verbose_name_plural = "Resource Categories"
        ordering = ['type', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


class SharedResource(models.Model):
    """Model representing a resource available for sharing between hospitals."""
    
    VISIBILITY_LEVELS = [
        ('public', 'Public'),
        ('network', 'Network'),
        ('emergency_only', 'Emergency Only'),
        ('private', 'Private'),
    ]
    
    QUALITY_GRADES = [
        ('A', 'Grade A - Excellent'),
        ('B', 'Grade B - Good'),
        ('C', 'Grade C - Fair'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='resources')
    category = models.ForeignKey(ResourceCategory, on_delete=models.CASCADE, related_name='resources')
    external_resource_id = models.UUIDField(help_text="ID from dummy hospital system", null=True, blank=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    current_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    available_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reserved_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    batch_number = models.CharField(max_length=100, blank=True)
    quality_grade = models.CharField(max_length=1, choices=QUALITY_GRADES, default='A')
    storage_requirements = models.TextField(blank=True)
    visibility_level = models.CharField(max_length=15, choices=VISIBILITY_LEVELS, default='public')
    is_emergency_stock = models.BooleanField(default=False)
    minimum_reserve = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    last_updated = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Shared Resource"
        verbose_name_plural = "Shared Resources"
        ordering = ['-last_updated']
        indexes = [
            models.Index(fields=['hospital', 'category']),
            models.Index(fields=['visibility_level', 'available_quantity']),
            models.Index(fields=['expiry_date']),
        ]
    
    def __str__(self):
        return f"{self.name} at {self.hospital.name} ({self.available_quantity} available)"
    
    @property
    def is_available(self):
        """Check if resource has available quantity."""
        return self.available_quantity > 0
    
    @property
    def days_until_expiry(self):
        """Calculate days until expiry."""
        if not self.expiry_date:
            return None
        delta = self.expiry_date - timezone.now().date()
        return delta.days


class InventorySyncLog(models.Model):
    """Model for tracking inventory synchronization operations."""
    
    SYNC_TYPES = [
        ('full', 'Full Sync'),
        ('incremental', 'Incremental Sync'),
        ('emergency', 'Emergency Sync'),
    ]
    
    SYNC_STATUSES = [
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('partial', 'Partially Completed'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='sync_logs')
    sync_type = models.CharField(max_length=15, choices=SYNC_TYPES, default='incremental')
    external_system_type = models.CharField(max_length=100, default='dummy_hospital_system')
    records_processed = models.PositiveIntegerField(default=0)
    records_updated = models.PositiveIntegerField(default=0)
    records_failed = models.PositiveIntegerField(default=0)
    sync_status = models.CharField(max_length=15, choices=SYNC_STATUSES, default='in_progress')
    error_details = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    next_sync_scheduled = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = "Inventory Sync Log"
        verbose_name_plural = "Inventory Sync Logs"
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['hospital', 'sync_status']),
            models.Index(fields=['started_at']),
        ]
    
    def __str__(self):
        return f"{self.get_sync_type_display()} for {self.hospital.name} - {self.get_sync_status_display()}"
    
    @property
    def success_rate(self):
        """Calculate sync success rate."""
        if self.records_processed == 0:
            return 0
        return (self.records_updated / self.records_processed) * 100


class BedOccupancy(models.Model):
    """Model for tracking hospital bed occupancy data."""
    
    BED_TYPES = [
        ('general', 'General Ward'),
        ('icu', 'ICU'),
        ('emergency', 'Emergency'),
        ('pediatric', 'Pediatric'),
        ('maternity', 'Maternity'),
        ('surgery', 'Surgery'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='bed_occupancy')
    bed_type = models.CharField(max_length=20, choices=BED_TYPES)
    total_beds = models.PositiveIntegerField()
    occupied_beds = models.PositiveIntegerField()
    available_beds = models.PositiveIntegerField()
    reserved_beds = models.PositiveIntegerField(default=0)
    last_updated = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Bed Occupancy"
        verbose_name_plural = "Bed Occupancy Records"
        unique_together = ['hospital', 'bed_type']
        ordering = ['hospital', 'bed_type']
    
    def __str__(self):
        return f"{self.hospital.name} - {self.get_bed_type_display()}: {self.available_beds}/{self.total_beds}"
    
    @property
    def occupancy_rate(self):
        """Calculate occupancy rate percentage."""
        if self.total_beds == 0:
            return 0
        return (self.occupied_beds / self.total_beds) * 100


class UserProfile(models.Model):
    """Model for user profiles and authentication."""
    
    ROLE_CHOICES = [
        ('admin', 'Administrator'),
        ('doctor', 'Doctor'),
        ('pharmacist', 'Pharmacist'),
        ('nurse', 'Nurse'),
        ('coordinator', 'Coordinator'),
        ('technician', 'Technician'),
        ('regulator', 'Regulator'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    external_staff_id = models.UUIDField(null=True, blank=True, help_text="ID from dummy hospital system")
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='users')
    department = models.CharField(max_length=100, blank=True)
    specialization = models.CharField(max_length=255, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"
        ordering = ['full_name']
    
    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"


class ResourceRequest(models.Model):
    """Model for resource requests between hospitals."""
    
    URGENCY_LEVELS = [
        ('critical', 'Critical'),
        ('urgent', 'Urgent'),
        ('routine', 'Routine'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('in_transit', 'In Transit'),
        ('delivered', 'Delivered'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    resource = models.ForeignKey(SharedResource, on_delete=models.CASCADE, related_name='requests')
    requesting_hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='outgoing_requests')
    providing_hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='incoming_requests')
    requested_by = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, related_name='created_requests')
    approved_by = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_requests')
    quantity = models.PositiveIntegerField()
    urgency = models.CharField(max_length=10, choices=URGENCY_LEVELS)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    justification = models.TextField()
    response_notes = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expected_delivery = models.DateTimeField(null=True, blank=True)
    actual_delivery = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = "Resource Request"
        verbose_name_plural = "Resource Requests"
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status', 'urgency']),
            models.Index(fields=['requesting_hospital', 'status']),
            models.Index(fields=['providing_hospital', 'status']),
        ]
    
    def __str__(self):
        return f"Request for {self.resource.name} from {self.requesting_hospital.name}"
    
    @property
    def days_since_request(self):
        """Calculate days since request was made."""
        delta = timezone.now() - self.requested_at
        return delta.days


class Alert(models.Model):
    """Model for system alerts and notifications."""
    
    ALERT_TYPES = [
        ('shortage', 'Stock Shortage'),
        ('expiry', 'Expiring Soon'),
        ('emergency', 'Emergency Request'),
        ('substitution', 'Substitution Available'),
        ('system', 'System Alert'),
    ]
    
    SEVERITY_LEVELS = [
        ('critical', 'Critical'),
        ('warning', 'Warning'),
        ('info', 'Information'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES)
    severity = models.CharField(max_length=10, choices=SEVERITY_LEVELS)
    title = models.CharField(max_length=255)
    message = models.TextField()
    hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='alerts')
    resource = models.ForeignKey(SharedResource, on_delete=models.CASCADE, null=True, blank=True, related_name='alerts')
    is_read = models.BooleanField(default=False)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = "Alert"
        verbose_name_plural = "Alerts"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['hospital', 'is_read']),
            models.Index(fields=['severity', 'is_resolved']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.get_severity_display()}"


class AuditLog(models.Model):
    """Model for audit trail of all system actions."""
    
    ACTION_TYPES = [
        ('create', 'Created'),
        ('update', 'Updated'),
        ('delete', 'Deleted'),
        ('approve', 'Approved'),
        ('reject', 'Rejected'),
        ('transfer', 'Transferred'),
        ('import', 'Imported'),
        ('export', 'Exported'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='audit_logs')
    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)
    action = models.CharField(max_length=255)
    resource_name = models.CharField(max_length=255, blank=True)
    details = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['hospital', 'timestamp']),
            models.Index(fields=['user', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.action} by {self.user.full_name if self.user else 'System'} at {self.timestamp}"


class RolePermission(models.Model):
    """Model for role-based access control permissions."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, unique=True)
    permissions = models.JSONField(default=dict)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Role Permission"
        verbose_name_plural = "Role Permissions"
        ordering = ['role']
    
    def __str__(self):
        return f"Permissions for {self.role}"


class Message(models.Model):
    """Model for inter-user messaging."""
    
    MESSAGE_TYPES = [
        ('direct', 'Direct Message'),
        ('group', 'Group Message'),
        ('system', 'System Message'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPES, default='direct')
    sender = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='sent_messages')
    recipient = models.ForeignKey(UserProfile, on_delete=models.CASCADE, null=True, blank=True, related_name='received_messages')
    subject = models.CharField(max_length=255, blank=True)
    content = models.TextField()
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Message"
        verbose_name_plural = "Messages"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
        ]
    
    def __str__(self):
        return f"Message from {self.sender.full_name} to {self.recipient.full_name if self.recipient else 'Group'}"


class InventoryItem(models.Model):
    """Model for hospital inventory items (medications, supplies, etc.)."""
    
    ABC_CLASSIFICATION = [
        ('A', 'Class A - High Value'),
        ('B', 'Class B - Medium Value'),
        ('C', 'Class C - Low Value'),
    ]
    
    VED_CLASSIFICATION = [
        ('V', 'Vital'),
        ('E', 'Essential'),
        ('D', 'Desirable'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    external_medication_id = models.UUIDField(null=True, blank=True, help_text="ID from dummy hospital system")
    hospital = models.ForeignKey(ResourceHospital, on_delete=models.CASCADE, related_name='inventory_items')
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100)
    abc_classification = models.CharField(max_length=1, choices=ABC_CLASSIFICATION)
    ved_classification = models.CharField(max_length=1, choices=VED_CLASSIFICATION)
    current_stock = models.PositiveIntegerField()
    reorder_level = models.PositiveIntegerField()
    max_stock = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    expiry_date = models.DateField(null=True, blank=True)
    supplier = models.CharField(max_length=255, blank=True)
    last_updated = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Inventory Item"
        verbose_name_plural = "Inventory Items"
        ordering = ['-last_updated']
        indexes = [
            models.Index(fields=['hospital', 'category']),
            models.Index(fields=['current_stock', 'reorder_level']),
        ]
    
    def __str__(self):
        return f"{self.name} at {self.hospital.name} ({self.current_stock} units)"
    
    @property
    def days_until_expiry(self):
        """Calculate days until expiry."""
        if not self.expiry_date:
            return None
        delta = self.expiry_date - timezone.now().date()
        return delta.days
    
    @property
    def is_critical_stock(self):
        """Check if stock is below reorder level."""
        return self.current_stock <= self.reorder_level
