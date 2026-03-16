"""Resources domain models: ResourceType, ResourceCatalog, ResourceInventory, ResourceShare, ResourceTransaction."""
import uuid
from decimal import Decimal

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


class ResourceInventory(models.Model):
    """
    Current stock level for a catalog item at a hospital.
    One inventory record per catalog item.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    catalog_item = models.OneToOneField(
        ResourceCatalog,
        on_delete=models.CASCADE,
        related_name="inventory",
    )
    quantity_available = models.PositiveIntegerField(default=0)
    quantity_reserved = models.PositiveIntegerField(default=0)
    reserved_quantity = models.PositiveIntegerField(default=0)
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=10, default="BDT")
    expiry_date = models.DateField(null=True, blank=True)
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
