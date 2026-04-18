"""Inventory module persistence models."""
import uuid

from django.db import models


class InventoryImportJob(models.Model):
    """Tracks lifecycle of CSV inventory imports for a facility."""

    class SourceType(models.TextChoices):
        CSV = "CSV", "CSV"

    class Mode(models.TextChoices):
        MERGE = "MERGE", "Merge"
        REPLACE_UPLOADED_SCOPE = "REPLACE_UPLOADED_SCOPE", "Replace Uploaded Scope"
        FULL_REPLACE = "FULL_REPLACE", "Full Replace"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VALIDATED = "VALIDATED", "Validated"
        APPLYING = "APPLYING", "Applying"
        APPLIED = "APPLIED", "Applied"
        PARTIALLY_APPLIED = "PARTIALLY_APPLIED", "Partially Applied"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="inventory_import_jobs",
    )
    source_type = models.CharField(max_length=20, choices=SourceType.choices, default=SourceType.CSV)
    mode = models.CharField(max_length=30, choices=Mode.choices)
    file_hash = models.CharField(max_length=64, db_index=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    confirm_full_replace = models.BooleanField(default=False)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING, db_index=True)
    total_rows = models.PositiveIntegerField(default=0)
    applied_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    summary = models.JSONField(default=dict, blank=True)
    requested_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_import_jobs_requested",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_module_import_job"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "file_hash"],
                name="uniq_inventory_import_job_facility_file_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["facility", "-created_at"]),
            models.Index(fields=["status", "-updated_at"]),
        ]

    def __str__(self) -> str:
        return f"InventoryImportJob({self.facility_id}, {self.status})"


class InventoryImportError(models.Model):
    """Row-level validation or apply error for a CSV import job."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_job = models.ForeignKey(
        InventoryImportJob,
        on_delete=models.CASCADE,
        related_name="errors",
    )
    row_number = models.PositiveIntegerField()
    field_name = models.CharField(max_length=80, blank=True)
    error_code = models.CharField(max_length=80)
    error_message = models.TextField()
    raw_row = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inventory_module_import_error"
        indexes = [
            models.Index(fields=["import_job", "row_number"]),
        ]

    def __str__(self) -> str:
        return f"InventoryImportError({self.import_job_id}, row={self.row_number})"


class InventoryCSVValidationContext(models.Model):
    """Stores lightweight CSV validation context used by the AI chat assistant."""

    file_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="inventory_csv_validation_contexts",
    )
    file_hash = models.CharField(max_length=64, db_index=True)
    language = models.CharField(max_length=10, default="en")
    expected_schema = models.JSONField(default=list, blank=True)
    errors = models.JSONField(default=list, blank=True)
    sample_rows = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_csv_validation_contexts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_module_validation_context"
        indexes = [
            models.Index(fields=["facility", "-created_at"]),
            models.Index(fields=["file_hash"]),
        ]

    def __str__(self) -> str:
        return f"InventoryCSVValidationContext({self.file_id}, facility={self.facility_id})"


class InventoryCSVChatSession(models.Model):
    """Session-bound chat thread for one validated inventory CSV file."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CLOSED = "CLOSED", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="inventory_csv_chat_sessions",
    )
    validation_context = models.ForeignKey(
        InventoryCSVValidationContext,
        on_delete=models.CASCADE,
        related_name="chat_sessions",
    )
    language = models.CharField(max_length=10, default="en")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_csv_chat_sessions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_module_chat_session"
        indexes = [
            models.Index(fields=["facility", "-created_at"]),
            models.Index(fields=["validation_context", "-created_at"]),
            models.Index(fields=["status", "-updated_at"]),
        ]


class InventoryCSVChatMessage(models.Model):
    """Messages exchanged within an inventory CSV chat session."""

    class Role(models.TextChoices):
        USER = "USER", "User"
        ASSISTANT = "ASSISTANT", "Assistant"
        SYSTEM = "SYSTEM", "System"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        InventoryCSVChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    out_of_scope = models.BooleanField(default=False)
    message_meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inventory_module_chat_message"
        indexes = [
            models.Index(fields=["session", "created_at"]),
            models.Index(fields=["role", "-created_at"]),
        ]
