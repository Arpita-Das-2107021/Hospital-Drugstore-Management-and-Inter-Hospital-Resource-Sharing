"""Analytics service layer."""
import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.db import transaction
from django.utils import timezone

from .models import CreditLedger

logger = logging.getLogger("hrsp.analytics")

SYSTEM_ADMIN_ROLE_NAMES = ("SUPER_ADMIN", "PLATFORM_ADMIN", "SYSTEM_ADMIN")
ML_ROLE_NAMES = ("ML_ADMIN", "ML_ENGINEER")
HEALTHCARE_ADMIN_ROLE_NAMES = ("HEALTHCARE_ADMIN", "HOSPITAL_ADMIN")


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


def get_platform_analytics_summary() -> dict:
    """Return aggregate platform-level analytics counters for dashboard usage."""
    from apps.hospitals.models import Hospital, HospitalRegistrationRequest
    from apps.staff.models import Invitation

    UserAccount = get_user_model()

    active_users = UserAccount.objects.filter(is_active=True)
    inactive_users_count = UserAccount.objects.filter(is_active=False).count()

    system_staff_filter = (
        Q(
            platform_role_assignments__platform_role__name__in=SYSTEM_ADMIN_ROLE_NAMES,
            platform_role_assignments__platform_role__is_active=True,
        )
        | Q(user_roles__role__name__in=SYSTEM_ADMIN_ROLE_NAMES)
    )
    ml_filter = (
        Q(
            platform_role_assignments__platform_role__name__in=ML_ROLE_NAMES,
            platform_role_assignments__platform_role__is_active=True,
        )
        | Q(user_roles__role__name__in=ML_ROLE_NAMES)
    )
    healthcare_admin_filter = (
        Q(
            hospital_role_assignment__hospital_role__name__in=HEALTHCARE_ADMIN_ROLE_NAMES,
            hospital_role_assignment__hospital_role__is_active=True,
        )
        | Q(user_roles__role__name__in=HEALTHCARE_ADMIN_ROLE_NAMES)
    )

    system_staff_count = active_users.filter(system_staff_filter).distinct().count()
    ml_count = active_users.filter(ml_filter).distinct().count()
    healthcare_admin_count = active_users.filter(healthcare_admin_filter).distinct().count()

    categorized_user_ids = active_users.filter(
        system_staff_filter | ml_filter | healthcare_admin_filter
    ).values_list("id", flat=True).distinct()

    healthcare_registered_count = Hospital.objects.count()
    pending_healthcare_verification_count = Hospital.objects.filter(
        verified_status=Hospital.VerifiedStatus.PENDING
    ).count()
    pending_registration_requests_count = HospitalRegistrationRequest.objects.filter(
        status=HospitalRegistrationRequest.Status.PENDING_APPROVAL
    ).count()

    return {
        "healthcare_registered_count": healthcare_registered_count,
        "healthcare_verified_count": Hospital.objects.filter(
            verified_status=Hospital.VerifiedStatus.VERIFIED
        ).count(),
        "healthcare_pending_verification_count": pending_healthcare_verification_count,
        "pending_registration_requests_count": pending_registration_requests_count,
        "healthcare_pending_count": (
            pending_healthcare_verification_count + pending_registration_requests_count
        ),
        "staff_system_count": system_staff_count,
        "ml_count": ml_count,
        "healthcare_admin_count": healthcare_admin_count,
        "others_count": active_users.exclude(id__in=categorized_user_ids).count(),
        "total_users_count": UserAccount.objects.count(),
        "active_users_count": active_users.count(),
        "inactive_users_count": inactive_users_count,
        "pending_staff_invitations_count": Invitation.objects.filter(
            status=Invitation.Status.PENDING
        ).count(),
        "generated_at": timezone.now().isoformat(),
    }
