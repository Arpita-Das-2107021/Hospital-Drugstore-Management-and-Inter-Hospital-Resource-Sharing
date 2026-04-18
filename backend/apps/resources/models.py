"""Resources domain models: ResourceType, ResourceCatalog, ResourceInventory, ResourceShare, ResourceTransaction."""
import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class ResourceType(models.Model):
    """
    High-level category (e.g. 'Medication', 'Equipment', 'Blood').
    Seeded via management command seed_resource_types.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    unit_of_measure = models.CharField(max_length=50, blank=True, help_text="e.g. 'units', 'ml', 'kg'")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "resources_resourcetype"

    def __str__(self) -> str:
        return self.name


class ResourceCatalog(models.Model):
    """
    A specific resource definition within a hospital's catalog
    (e.g. 'Amoxicillin 500mg' typed as 'Medication').
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="catalog_items",
    )
    resource_type = models.ForeignKey(
        ResourceType,
        on_delete=models.PROTECT,
        related_name="catalog_items",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    unit_of_measure = models.CharField(max_length=50, blank=True)
    is_shareable = models.BooleanField(default=True)
    minimum_stock_level = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "resources_resourcecatalog"
        unique_together = [("hospital", "name", "resource_type")]

    def __str__(self) -> str:
        return f"{self.name} ({self.hospital})"


class DiscountPolicy(models.Model):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentage"
        FIXED = "fixed", "Fixed"

    class AppliesToScope(models.TextChoices):
        INVENTORY = "inventory", "Inventory"
        BATCH = "batch", "Batch"
        SALE = "sale", "Sale"
        SHARE_REQUEST = "share_request", "Share Request"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    discount_type = models.CharField(max_length=20, choices=DiscountType.choices)
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    is_active = models.BooleanField(default=True)
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    applies_to_scope = models.CharField(
        max_length=20,
        choices=AppliesToScope.choices,
        default=AppliesToScope.INVENTORY,
    )
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="discount_policies_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "resources_discountpolicy"
        indexes = [
            models.Index(fields=["applies_to_scope", "is_active"]),
            models.Index(fields=["start_at", "end_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(end_at__isnull=True)
                | models.Q(start_at__isnull=True)
                | models.Q(end_at__gte=models.F("start_at")),
                name="discount_policy_start_before_end",
            ),
        ]

    def __str__(self) -> str:
        return f"DiscountPolicy({self.name}, {self.discount_type})"


class ResourceInventory(models.Model):
    """
    Current stock level for a catalog item at a hospital.
    One inventory record per catalog item.
    """

    class VerificationStatus(models.TextChoices):
        VERIFIED = "verified", "Verified"
        PENDING_SYNC = "pending_sync", "Pending Sync"
        STALE = "stale", "Stale"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    catalog_item = models.OneToOneField(
        ResourceCatalog,
        on_delete=models.CASCADE,
        related_name="inventory",
    )
    quantity_available = models.PositiveIntegerField(default=0)
    # Transitional dual-write: reserved_quantity is treated as source-of-truth.
    # quantity_reserved is kept synchronized for backward compatibility until cleanup.
    quantity_reserved = models.PositiveIntegerField(default=0)
    reserved_quantity = models.PositiveIntegerField(default=0)
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    active_discount_policy = models.ForeignKey(
        "DiscountPolicy",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="active_inventories",
    )
    currency = models.CharField(max_length=10, default="BDT")
    expiry_date = models.DateField(null=True, blank=True)
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.VERIFIED,
        db_index=True,
    )
    verification_note = models.CharField(max_length=255, blank=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)
    last_restocked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "resources_resourceinventory"

    def __str__(self) -> str:
        return f"Inventory({self.catalog_item}, qty={self.quantity_available})"

    @property
    def quantity_free(self) -> int:
        return max(0, self.quantity_available - self.reserved_quantity)


class ResourceInventoryBatch(models.Model):
    """
    Immutable-acquisition pricing and batch-level stock tracking.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inventory = models.ForeignKey(
        ResourceInventory,
        on_delete=models.CASCADE,
        related_name="batches",
    )
    batch_number = models.CharField(max_length=120)
    quantity_acquired = models.PositiveIntegerField(default=0)
    quantity_available_in_batch = models.PositiveIntegerField(default=0)
    quantity_reserved_in_batch = models.PositiveIntegerField(default=0)
    unit_price_at_acquisition = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default="BDT")
    manufacturer = models.CharField(max_length=200, blank=True)
    acquired_at = models.DateTimeField()
    expires_at = models.DateTimeField(null=True, blank=True)
    source_reference = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "resources_resourceinventorybatch"
        constraints = [
            models.UniqueConstraint(fields=["inventory", "batch_number"], name="uniq_inventory_batch_number"),
        ]
        indexes = [
            models.Index(fields=["inventory", "-acquired_at"]),
            models.Index(fields=["inventory", "expires_at"]),
        ]

    def __str__(self) -> str:
        return f"InventoryBatch({self.inventory_id}, {self.batch_number})"


class ResourceShare(models.Model):
    """
    A hospital's public offer to share a resource with partner hospitals.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="resource_shares",
    )
    catalog_item = models.ForeignKey(
        ResourceCatalog,
        on_delete=models.CASCADE,
        related_name="shares",
    )
    quantity_offered = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    notes = models.TextField(blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="resource_shares_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "resources_resourceshare"

    def __str__(self) -> str:
        return f"Share({self.catalog_item.name}, qty={self.quantity_offered}, {self.status})"


class ResourceTransaction(models.Model):
    """
    Ledger of all inventory movements (in/out) for audit trail.
    """

    class TransactionType(models.TextChoices):
        RESTOCK = "restock", "Restock"
        ADJUSTMENT = "adjustment", "Adjustment"
        TRANSFER_OUT = "transfer_out", "Transfer Out"
        TRANSFER_IN = "transfer_in", "Transfer In"
        RESERVED = "reserved", "Reserved"
        RELEASED = "released", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inventory = models.ForeignKey(
        ResourceInventory,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    transaction_type = models.CharField(max_length=20, choices=TransactionType.choices)
    quantity_delta = models.IntegerField(help_text="Positive=increase, negative=decrease")
    balance_after = models.PositiveIntegerField()
    reference_id = models.UUIDField(null=True, blank=True, help_text="e.g. ResourceRequest.id")
    notes = models.TextField(blank=True)
    performed_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="resource_transactions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "resources_resourcetransaction"
        indexes = [
            models.Index(fields=["inventory", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Txn({self.transaction_type}, delta={self.quantity_delta})"
