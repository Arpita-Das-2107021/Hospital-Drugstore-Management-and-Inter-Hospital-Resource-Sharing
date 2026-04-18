"""Hospital domain models."""
import uuid

from django.db import models
from django.core.validators import MaxValueValidator, MinValueValidator


class HospitalRegistrationRequest(models.Model):
    """
    Step 1 of two-step hospital onboarding.
    Submitted by a hospital representative without auth.
    A Hospital record is only created after SUPER_ADMIN approval.
    """

    class Status(models.TextChoices):
        PENDING_APPROVAL = "pending_approval", "Pending Approval"
        ACTIVE = "active", "Active"
        REJECTED = "rejected", "Rejected"

    class HospitalType(models.TextChoices):
        GENERAL = "general", "General"
        TEACHING = "teaching", "Teaching"
        SPECIALTY = "specialty", "Specialty"
        CLINIC = "clinic", "Clinic"
        REHABILITATION = "rehabilitation", "Rehabilitation"
        PSYCHIATRIC = "psychiatric", "Psychiatric"

    class FacilityClassification(models.TextChoices):
        GOVT = "GOVT", "Government"
        PRIVATE = "PRIVATE", "Private"
        PHARMACY = "PHARMACY", "Pharmacy"
        CLINIC = "CLINIC", "Clinic"

    class FacilityType(models.TextChoices):
        HOSPITAL = "hospital", "Hospital"
        PHARMACY = "pharmacy", "Pharmacy"
        CLINIC = "clinic", "Clinic"
        WAREHOUSE = "warehouse", "Warehouse"

    class DataSubmissionType(models.TextChoices):
        API = "api", "API"
        CSV_UPLOAD = "csv_upload", "CSV Upload"
        MANUAL = "manual", "Manual"

    class InventorySourceType(models.TextChoices):
        API = "API", "API"
        DASHBOARD = "DASHBOARD", "Dashboard"
        CSV = "CSV", "CSV"
        HYBRID = "HYBRID", "Hybrid"

    class SyncStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        SYNCING = "syncing", "Syncing"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    class SchemaContractStatus(models.TextChoices):
        UNCHECKED = "unchecked", "Unchecked"
        PASSED = "passed", "Passed"
        FAILED = "failed", "Failed"

    class ApiAuthType(models.TextChoices):
        BEARER = "bearer", "Bearer Token"
        BASIC = "basic", "Basic Auth"
        API_KEY = "api_key", "API Key"
        NONE = "none", "None"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Core hospital info
    name = models.CharField(max_length=255)
    registration_number = models.CharField(max_length=100)
    email = models.EmailField()
    admin_name = models.CharField(max_length=255)
    admin_email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    website = models.URLField(max_length=200, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    hospital_type = models.CharField(
        max_length=30,
        choices=HospitalType.choices,
        default=HospitalType.GENERAL,
    )
    facility_classification = models.CharField(
        max_length=20,
        choices=FacilityClassification.choices,
        default=FacilityClassification.GOVT,
    )
    facility_type = models.CharField(
        max_length=20,
        choices=FacilityType.choices,
        default=FacilityType.HOSPITAL,
    )
    data_submission_type = models.CharField(
        max_length=20,
        choices=DataSubmissionType.choices,
        default=DataSubmissionType.API,
    )
    needs_inventory_dashboard = models.BooleanField(default=False)
    inventory_source_type = models.CharField(
        max_length=20,
        choices=InventorySourceType.choices,
        default=InventorySourceType.API,
        db_index=True,
    )
    inventory_last_sync_source = models.CharField(max_length=50, blank=True)
    region_level_1 = models.CharField(max_length=100, blank=True)
    region_level_2 = models.CharField(max_length=100, blank=True)
    region_level_3 = models.CharField(max_length=100, blank=True)
    logo = models.ImageField(upload_to="hospitals/registration-logos/", null=True, blank=True)
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    # Onboarding workflow
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING_APPROVAL,
        db_index=True,
    )
    rejection_reason = models.TextField(blank=True)

    # API integration fields (optional; credentials encrypted at application layer)
    api_base_url = models.CharField(max_length=500, blank=True)
    api_auth_type = models.CharField(
        max_length=20,
        choices=ApiAuthType.choices,
        default=ApiAuthType.NONE,
    )
    # Fernet-encrypted at application layer; never stored in plaintext
    api_key = models.TextField(blank=True)
    api_username = models.CharField(max_length=200, blank=True)
    api_password = models.TextField(blank=True)  # Fernet-encrypted

    # Sync tracking
    last_sync_time = models.DateTimeField(null=True, blank=True)
    sync_status = models.CharField(
        max_length=20,
        choices=SyncStatus.choices,
        default=SyncStatus.PENDING,
    )
    api_check_results = models.JSONField(default=dict, blank=True)
    api_check_last_checked_at = models.DateTimeField(null=True, blank=True)
    schema_contract_status = models.CharField(
        max_length=20,
        choices=SchemaContractStatus.choices,
        default=SchemaContractStatus.UNCHECKED,
        db_index=True,
    )
    schema_contract_failed_apis = models.JSONField(default=list, blank=True)
    schema_contract_checked_at = models.DateTimeField(null=True, blank=True)

    # Review audit
    reviewed_by = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_registrations",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital_registration_request"
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["registration_number"]),
            models.Index(fields=["email"]),
            models.Index(fields=["admin_email"]),
            models.Index(fields=["submitted_at"]),
        ]

    def __str__(self):
        return f"RegistrationRequest({self.name} / {self.status})"


class Hospital(models.Model):
    class VerifiedStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        SUSPENDED = "suspended", "Suspended"
        OFFBOARDED = "offboarded", "Offboarded"
        REJECTED = "rejected", "Rejected"

    class HospitalType(models.TextChoices):
        GENERAL = "general", "General"
        TEACHING = "teaching", "Teaching"
        SPECIALTY = "specialty", "Specialty"
        CLINIC = "clinic", "Clinic"
        REHABILITATION = "rehabilitation", "Rehabilitation"
        PSYCHIATRIC = "psychiatric", "Psychiatric"

    class FacilityClassification(models.TextChoices):
        GOVT = "GOVT", "Government"
        PRIVATE = "PRIVATE", "Private"
        PHARMACY = "PHARMACY", "Pharmacy"
        CLINIC = "CLINIC", "Clinic"

    class FacilityType(models.TextChoices):
        HOSPITAL = "hospital", "Hospital"
        PHARMACY = "pharmacy", "Pharmacy"
        CLINIC = "clinic", "Clinic"
        WAREHOUSE = "warehouse", "Warehouse"

    class DataSubmissionType(models.TextChoices):
        API = "api", "API"
        CSV_UPLOAD = "csv_upload", "CSV Upload"
        MANUAL = "manual", "Manual"

    class InventorySourceType(models.TextChoices):
        API = "API", "API"
        DASHBOARD = "DASHBOARD", "Dashboard"
        CSV = "CSV", "CSV"
        HYBRID = "HYBRID", "Hybrid"

    class SchemaContractStatus(models.TextChoices):
        UNCHECKED = "unchecked", "Unchecked"
        PASSED = "passed", "Passed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    registration_number = models.CharField(max_length=100, unique=True)
    hospital_type = models.CharField(
        max_length=30,
        choices=HospitalType.choices,
        default=HospitalType.GENERAL,
        db_index=True,
    )
    facility_classification = models.CharField(
        max_length=20,
        choices=FacilityClassification.choices,
        default=FacilityClassification.GOVT,
    )
    facility_type = models.CharField(
        max_length=20,
        choices=FacilityType.choices,
        default=FacilityType.HOSPITAL,
        db_index=True,
    )
    data_submission_type = models.CharField(
        max_length=20,
        choices=DataSubmissionType.choices,
        default=DataSubmissionType.API,
        db_index=True,
    )
    needs_inventory_dashboard = models.BooleanField(default=False)
    inventory_source_type = models.CharField(
        max_length=20,
        choices=InventorySourceType.choices,
        default=InventorySourceType.API,
        db_index=True,
    )
    inventory_last_sync_source = models.CharField(max_length=50, blank=True)
    region_level_1 = models.CharField(max_length=100, blank=True)
    region_level_2 = models.CharField(max_length=100, blank=True)
    region_level_3 = models.CharField(max_length=100, blank=True)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=30, blank=True)
    website = models.URLField(max_length=200, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True, db_index=True)
    state = models.CharField(max_length=100, blank=True, db_index=True)
    country = models.CharField(max_length=100, blank=True, db_index=True)
    logo = models.ImageField(upload_to="hospitals/logos/", null=True, blank=True)
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )
    verified_status = models.CharField(
        max_length=20,
        choices=VerifiedStatus.choices,
        default=VerifiedStatus.PENDING,
        db_index=True,
    )
    advanced_integration_eligible = models.BooleanField(default=False, db_index=True)
    schema_contract_status = models.CharField(
        max_length=20,
        choices=SchemaContractStatus.choices,
        default=SchemaContractStatus.UNCHECKED,
        db_index=True,
    )
    schema_contract_failed_apis = models.JSONField(default=list, blank=True)
    schema_contract_checked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.registration_number})"


class HospitalCapacity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.OneToOneField(Hospital, on_delete=models.CASCADE, related_name="capacity")
    bed_total = models.PositiveIntegerField(default=0)
    bed_available = models.PositiveIntegerField(default=0)
    icu_total = models.PositiveIntegerField(default=0)
    icu_available = models.PositiveIntegerField(default=0)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital_capacity"
        verbose_name_plural = "Hospital Capacities"

    def __str__(self):
        return f"Capacity({self.hospital.name})"


class HospitalOffboardingRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT, related_name="offboarding_requests")
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    requested_by = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_offboarding_records",
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_offboarding_records",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital_offboarding_request"
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["hospital", "status"]),
            models.Index(fields=["requested_at"]),
        ]

    def __str__(self):
        return f"OffboardingRequest({self.hospital.name} / {self.status})"


class HospitalUpdateRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT, related_name="update_requests")
    requested_by = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hospital_update_requests",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    reason = models.TextField(blank=True)
    requested_changes = models.JSONField(default=dict, blank=True)
    sensitive_changes = models.JSONField(default=dict, blank=True)
    rejection_reason = models.TextField(blank=True)
    review_comment = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_hospital_update_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital_update_request"
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["hospital", "status"]),
            models.Index(fields=["requested_at"]),
        ]

    def __str__(self):
        return f"HospitalUpdateRequest({self.hospital.name} / {self.status})"

    @property
    def change_payload_json(self) -> dict:
        return self.requested_changes or {}


class HospitalAPIConfig(models.Model):
    class IntegrationType(models.TextChoices):
        API = "api", "API"
        MANUAL = "manual", "Manual"
        CSV_UPLOAD = "csv_upload", "CSV Upload"

    class HttpMethod(models.TextChoices):
        GET = "GET", "GET"
        POST = "POST", "POST"
        PUT = "PUT", "PUT"

    class AuthType(models.TextChoices):
        BEARER = "bearer", "Bearer Token"
        BASIC = "basic", "Basic Auth"
        API_KEY = "api_key", "API Key"
        NONE = "none", "None"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name="api_configs")
    resource_type = models.ForeignKey(
        "resources.ResourceType", on_delete=models.PROTECT, related_name="api_configs"
    )
    integration_type = models.CharField(max_length=20, choices=IntegrationType.choices)
    api_endpoint = models.CharField(max_length=500, blank=True)
    http_method = models.CharField(max_length=10, choices=HttpMethod.choices, default=HttpMethod.GET)
    auth_type = models.CharField(max_length=20, choices=AuthType.choices, default=AuthType.NONE)
    # Stored Fernet-encrypted at application layer
    encrypted_token = models.TextField(blank=True)
    headers = models.JSONField(default=dict, blank=True)
    sync_frequency = models.PositiveIntegerField(default=3600, help_text="Sync interval in seconds")
    last_sync = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital_api_config"

    def __str__(self):
        return f"APIConfig({self.hospital.name} / {self.resource_type.name})"


class HospitalPartnership(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        BLOCKED = "blocked", "Blocked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # hospital_a_id < hospital_b_id enforced in service layer to prevent duplicates
    hospital_a = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name="partnerships_as_a")
    hospital_b = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name="partnerships_as_b")
    relationship_type = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    initiated_by = models.ForeignKey(
        "staff.Staff", on_delete=models.SET_NULL, null=True, related_name="initiated_partnerships"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hospital_partnership"
        unique_together = [("hospital_a", "hospital_b")]

    def __str__(self):
        return f"Partnership({self.hospital_a.name} <-> {self.hospital_b.name})"
