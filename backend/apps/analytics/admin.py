"""Analytics app admin."""
from django.contrib import admin

from .models import CreditLedger


@admin.register(CreditLedger)
class CreditLedgerAdmin(admin.ModelAdmin):
    list_display = ("hospital", "transaction_type", "amount", "balance_after", "created_at")
    list_filter = ("transaction_type", "hospital")
    readonly_fields = ("id", "hospital", "transaction_type", "amount", "balance_after", "reference_request", "notes", "created_by", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
