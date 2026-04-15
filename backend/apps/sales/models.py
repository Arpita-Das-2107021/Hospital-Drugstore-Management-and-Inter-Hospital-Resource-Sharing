"""Internal operational sales domain models."""

import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone


class InternalSale(models.Model):
    class Channel(models.TextChoices):
        WALK_IN = "walk_in", "Walk In"
        PRESCRIPTION = "prescription", "Prescription"
        ONLINE = "online", "Online"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="internal_sales",
    )
    resource_catalog = models.ForeignKey(
        "resources.ResourceCatalog",
        on_delete=models.PROTECT,
        related_name="internal_sales",
    )
    sold_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="internal_sales",
    )
    event_date = models.DateField(db_index=True)
    quantity_sold = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=10, default="BDT")
    channel = models.CharField(max_length=20, choices=Channel.choices, default=Channel.WALK_IN)
    client_reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sales_internal_sale"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "client_reference"],
                condition=~models.Q(client_reference=""),
                name="uniq_internal_sale_client_reference",
            )
        ]
        indexes = [
            models.Index(fields=["facility", "event_date"]),
            models.Index(fields=["resource_catalog", "event_date"]),
            models.Index(fields=["channel", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"InternalSale({self.facility_id}, {self.resource_catalog_id}, {self.event_date})"


class RetailSale(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inventory = models.ForeignKey(
        "resources.ResourceInventory",
        on_delete=models.PROTECT,
        related_name="retail_sales",
    )
    batch = models.ForeignKey(
        "resources.ResourceInventoryBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="retail_sales",
    )
    quantity = models.PositiveIntegerField()
    unit_selling_price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    final_total = models.DecimalField(max_digits=14, decimal_places=2)
    sold_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="retail_sales",
    )
    sold_at = models.DateTimeField(default=timezone.now, db_index=True)
    customer_reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "sales_retail_sale"
        constraints = [
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="retail_sale_quantity_gt_zero"),
            models.CheckConstraint(
                check=models.Q(discount_amount__gte=Decimal("0.00")),
                name="retail_sale_discount_non_negative",
            ),
            models.CheckConstraint(
                check=models.Q(final_total__gte=Decimal("0.00")),
                name="retail_sale_final_total_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["inventory", "-sold_at"]),
            models.Index(fields=["sold_by", "-sold_at"]),
        ]

    def __str__(self) -> str:
        return f"RetailSale({self.inventory_id}, qty={self.quantity}, sold_at={self.sold_at})"
