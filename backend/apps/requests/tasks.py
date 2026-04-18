"""Celery tasks for request workflow maintenance."""
from celery import shared_task

from .services import expire_requests, trigger_payment_reconciliation


@shared_task
def expire_due_requests_task(limit: int = 500) -> dict:
    """Expire due pre-dispatch requests in an idempotent periodic sweep."""
    return expire_requests(limit=limit, actor=None)


@shared_task
def reconcile_pending_payments_task() -> dict:
    """Reconcile stale pending payments in an idempotent periodic sweep."""
    run = trigger_payment_reconciliation(actor=None)
    return {
        "run_id": str(run.id),
        "run_status": run.run_status,
        "checked_count": run.checked_count,
        "corrected_count": run.corrected_count,
        "failed_count": run.failed_count,
    }
