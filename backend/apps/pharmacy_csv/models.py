"""CSV ingestion models for pharmacy historical datasets."""
import uuid

from django.db import models
from django.db.models import Q


class PharmacyCSVImportJob(models.Model):
    """Tracks lifecycle of sales/staff/movement CSV imports."""

    class DatasetType(models.TextChoices):
        SALES = "SALES", "Sales"
        STAFF = "STAFF", "Staff"
        MOVEMENT = "MOVEMENT", "Movement"

    class ConflictPolicy(models.TextChoices):
        REJECT = "REJECT", "Reject"
        OVERWRITE = "OVERWRITE", "Overwrite"

    class LockedPeriodPolicy(models.TextChoices):
        REJECT = "REJECT", "Reject"
        SKIP = "SKIP", "Skip"

    class Status(models.TextChoices):
        APPLYING = "APPLYING", "Applying"
        APPLIED = "APPLIED", "Applied"
        PARTIALLY_APPLIED = "PARTIALLY_APPLIED", "Partially Applied"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="pharmacy_csv_import_jobs",
    )
    dataset_type = models.CharField(max_length=20, choices=DatasetType.choices, db_index=True)
    file_hash = models.CharField(max_length=64, db_index=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    conflict_policy = models.CharField(max_length=20, choices=ConflictPolicy.choices, default=ConflictPolicy.REJECT)
    locked_period_policy = models.CharField(
        max_length=20,
        choices=LockedPeriodPolicy.choices,
        default=LockedPeriodPolicy.REJECT,
    )
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.APPLYING, db_index=True)
    total_rows = models.PositiveIntegerField(default=0)
    applied_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    conflict_rows = models.PositiveIntegerField(default=0)
    summary = models.JSONField(default=dict, blank=True)
    requested_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_csv_import_jobs_requested",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pharmacy_csv_import_job"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "dataset_type", "idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="uniq_pharmacy_csv_import_job_idempotency",
            ),
        ]
        indexes = [
            models.Index(fields=["facility", "dataset_type", "-created_at"]),
            models.Index(fields=["status", "-updated_at"]),
        ]


class PharmacyCSVImportError(models.Model):
    """Row-level validation or apply errors for a CSV import job."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_job = models.ForeignKey(
        PharmacyCSVImportJob,
        on_delete=models.CASCADE,
        related_name="errors",
    )
    row_number = models.PositiveIntegerField(default=0)
    field_name = models.CharField(max_length=80, blank=True)
    error_code = models.CharField(max_length=80)
    error_message = models.TextField()
    raw_row = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pharmacy_csv_import_error"
        indexes = [
            models.Index(fields=["import_job", "row_number"]),
        ]


class PharmacyCSVImportConflict(models.Model):
    """Conflict records for duplicate business keys with changed values."""

    class Resolution(models.TextChoices):
        PENDING = "PENDING", "Pending"
        OVERWRITTEN = "OVERWRITTEN", "Overwritten"
        SKIPPED = "SKIPPED", "Skipped"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_job = models.ForeignKey(
        PharmacyCSVImportJob,
        on_delete=models.CASCADE,
        related_name="conflicts",
    )
    row_number = models.PositiveIntegerField(default=0)
    conflict_key = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    existing_record = models.JSONField(default=dict, blank=True)
    incoming_record = models.JSONField(default=dict, blank=True)
    resolution = models.CharField(max_length=20, choices=Resolution.choices, default=Resolution.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pharmacy_csv_import_conflict"
        indexes = [
            models.Index(fields=["import_job", "row_number"]),
            models.Index(fields=["conflict_key"]),
        ]


class PharmacyCSVValidationContext(models.Model):
    """Stored validation snapshot for pharmacy CSV uploads."""

    file_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="pharmacy_csv_validation_contexts",
    )
    dataset_type = models.CharField(max_length=20, choices=PharmacyCSVImportJob.DatasetType.choices, db_index=True)
    file_hash = models.CharField(max_length=64, db_index=True)
    expected_schema = models.JSONField(default=list, blank=True)
    errors = models.JSONField(default=list, blank=True)
    conflicts = models.JSONField(default=list, blank=True)
    sample_rows = models.JSONField(default=list, blank=True)
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_csv_validation_contexts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pharmacy_csv_validation_context"
        indexes = [
            models.Index(fields=["facility", "dataset_type", "-created_at"]),
            models.Index(fields=["file_hash"]),
        ]


class PharmacyCSVRowVersion(models.Model):
    """Latest applied payload per conflict key to support conflict/version checks."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="pharmacy_csv_row_versions",
    )
    dataset_type = models.CharField(max_length=20, choices=PharmacyCSVImportJob.DatasetType.choices)
    conflict_key = models.CharField(max_length=255)
    payload_hash = models.CharField(max_length=64)
    payload = models.JSONField(default=dict, blank=True)
    last_import_job = models.ForeignKey(
        PharmacyCSVImportJob,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="row_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pharmacy_csv_row_version"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "dataset_type", "conflict_key"],
                name="uniq_pharmacy_csv_row_version_key",
            ),
        ]
        indexes = [
            models.Index(fields=["facility", "dataset_type"]),
        ]


class PharmacyCSVChatSession(models.Model):
    """Session-bound AI discussion thread for one validated CSV upload."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CLOSED = "CLOSED", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="pharmacy_csv_chat_sessions",
    )
    validation_context = models.ForeignKey(
        PharmacyCSVValidationContext,
        on_delete=models.CASCADE,
        related_name="chat_sessions",
    )
    dataset_type = models.CharField(max_length=20, choices=PharmacyCSVImportJob.DatasetType.choices, db_index=True)
    language = models.CharField(max_length=10, default="en")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_csv_chat_sessions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pharmacy_csv_chat_session"
        indexes = [
            models.Index(fields=["facility", "dataset_type", "-created_at"]),
            models.Index(fields=["validation_context", "-created_at"]),
            models.Index(fields=["status", "-updated_at"]),
        ]


class PharmacyCSVChatMessage(models.Model):
    """Messages exchanged between user and assistant inside one CSV chat session."""

    class Role(models.TextChoices):
        USER = "USER", "User"
        ASSISTANT = "ASSISTANT", "Assistant"
        SYSTEM = "SYSTEM", "System"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        PharmacyCSVChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    out_of_scope = models.BooleanField(default=False)
    message_meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pharmacy_csv_chat_message"
        indexes = [
            models.Index(fields=["session", "created_at"]),
            models.Index(fields=["role", "-created_at"]),
        ]
