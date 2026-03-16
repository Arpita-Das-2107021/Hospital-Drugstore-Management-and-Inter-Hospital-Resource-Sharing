"""Analytics serializers."""
from rest_framework import serializers

from .models import CreditLedger


class CreditLedgerSerializer(serializers.ModelSerializer):
    hospital_name = serializers.ReadOnlyField(source="hospital.name")

    class Meta:
        model = CreditLedger
        fields = (
            "id",
            "hospital",
            "hospital_name",
            "transaction_type",
            "amount",
            "balance_after",
            "reference_request",
            "notes",
            "created_by",
            "created_at",
        )
        read_only_fields = ("id", "hospital_name", "created_at")
