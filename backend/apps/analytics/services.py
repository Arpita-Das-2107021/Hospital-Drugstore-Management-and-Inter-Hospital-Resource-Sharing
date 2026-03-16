"""Analytics service layer."""
import logging

from django.db import transaction

from .models import CreditLedger

logger = logging.getLogger("hrsp.analytics")


def add_credit_entry(hospital, transaction_type: str, amount: int, reference_request=None, notes: str = "", actor=None) -> CreditLedger:
    """Append a new immutable credit ledger entry."""
    with transaction.atomic():
        # Calculate current balance
        last_entry = CreditLedger.objects.filter(hospital=hospital).order_by("-created_at").first()
        balance_before = last_entry.balance_after if last_entry else 0
        balance_after = balance_before + amount

        entry = CreditLedger(
            hospital=hospital,
            transaction_type=transaction_type,
            amount=amount,
            balance_after=balance_after,
            reference_request=reference_request,
            notes=notes,
            created_by=actor,
        )
        entry.save()

    logger.info("Credit entry: hospital=%s type=%s amount=%d balance=%d", hospital.id, transaction_type, amount, balance_after)
    return entry


def get_hospital_balance(hospital) -> int:
    last_entry = CreditLedger.objects.filter(hospital=hospital).order_by("-created_at").first()
    return last_entry.balance_after if last_entry else 0
