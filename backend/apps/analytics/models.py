"""Analytics models: CreditLedger for tracking hospital credit balance."""
import uuid

from django.db import models


class CreditLedger(models.Model):
    """
    Immutable ledger entry tracking hospital credit changes.
    Credits are earned by sharing resources, spent when receiving them.

    This is an append-only table — never update or delete rows.
    """

    class TransactionType(models.TextChoices):
        CREDIT_EARNED = "credit_earned", "Credit Earned"
        CREDIT_SPENT = "credit_spent", "Credit Spent"
        CREDIT_ADJUSTMENT = "credit_adjustment", "Manual Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.CASCADE,
        related_name="credit_ledger_entries",
    )
    transaction_type = models.CharField(max_length=30, choices=TransactionType.choices)
    amount = models.IntegerField(help_text="Positive=earned, negative=spent")
    balance_after = models.IntegerField()
    reference_request = models.ForeignKey(
        "resource_requests.ResourceRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_entries",
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "authentication.UserAccount",
        on_delete=models.SET_NULL,
        null=True,
        related_name="credit_entries_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "analytics_creditled"
        indexes = [
            models.Index(fields=["hospital", "-created_at"]),
        ]
        # Prevent updates — use signals or overriding save() for stricter enforcement
        get_latest_by = "created_at"

    def __str__(self) -> str:
        return f"Credit({self.hospital}, {self.transaction_type}, {self.amount})"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("CreditLedger entries are immutable.")
        super().save(*args, **kwargs)
