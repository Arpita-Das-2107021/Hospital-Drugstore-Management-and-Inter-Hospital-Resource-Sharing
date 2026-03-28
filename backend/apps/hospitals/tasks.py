"""Celery tasks for the hospitals app."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_hospital_api_task(self, hospital_id: str) -> dict:
    """
    Sync hospital data via its configured external API (HospitalAPIConfig-based).
    Retries up to 3 times with a 60-second delay on transient errors.
    """
    try:
        from .models import HospitalAPIConfig
        from .services import sync_hospital_api

        config = HospitalAPIConfig.objects.select_related("hospital").get(
            hospital_id=hospital_id, is_active=True
        )
        result = sync_hospital_api(config)
        logger.info("Hospital API sync completed", extra={"hospital_id": hospital_id, "result": result})
        return result
    except HospitalAPIConfig.DoesNotExist:
        logger.warning("No active API config found for hospital", extra={"hospital_id": hospital_id})
        return {"status": "skipped", "reason": "no_active_config"}
    except Exception as exc:
        logger.error(
            "Hospital API sync failed, retrying",
            extra={"hospital_id": hospital_id, "error": str(exc)},
        )
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_registration_request_api_task(self, registration_id: str) -> dict:
    """
    Sync external API data for a single ACTIVE HospitalRegistrationRequest.
    Delegates to hospital-level sync for inventory/capacity/blood/staff.
    Updates last_sync_time and sync_status on the registration.
    Retries up to 3 times on transient errors.
    """
    try:
        from .models import Hospital, HospitalRegistrationRequest
        from .services import sync_hospital_data

        registration = HospitalRegistrationRequest.objects.get(
            id=registration_id,
            status=HospitalRegistrationRequest.Status.ACTIVE,
        )

        hospital = Hospital.objects.get(registration_number=registration.registration_number)
        result = sync_hospital_data(str(hospital.id))
        logger.info(
            "Registration API sync completed",
            extra={"registration_id": registration_id, "result": result},
        )
        return result
    except (HospitalRegistrationRequest.DoesNotExist, Hospital.DoesNotExist):
        logger.warning(
            "No active registration found for sync",
            extra={"registration_id": registration_id},
        )
        return {"status": "skipped", "reason": "not_found_or_not_active"}
    except Exception as exc:
        from .models import HospitalRegistrationRequest
        # Mark sync as failed before retrying
        try:
            HospitalRegistrationRequest.objects.filter(id=registration_id).update(
                sync_status=HospitalRegistrationRequest.SyncStatus.FAILED
            )
        except Exception:
            pass
        logger.error(
            "Registration API sync failed, retrying",
            extra={"registration_id": registration_id, "error": str(exc)},
        )
        # In eager mode (tests), bubble the original error so task.apply(..., throw=False)
        # records a FAILURE state instead of surfacing Celery Retry exceptions.
        if getattr(self.request, "is_eager", False):
            raise
        raise self.retry(exc=exc)


@shared_task
def sync_all_active_hospitals_task() -> dict:
    """
    Periodic Celery task: syncs API data for all ACTIVE hospital registration requests
    that have an api_base_url configured and a corresponding Hospital record.

    Schedule is controlled by HOSPITAL_SYNC_INTERVAL_SECONDS setting (default: 3600).
    Dispatches individual sync_hospital_data_task tasks per hospital.
    """
    from .models import Hospital, HospitalRegistrationRequest

    active_registration_numbers = HospitalRegistrationRequest.objects.filter(
        status=HospitalRegistrationRequest.Status.ACTIVE,
    ).exclude(api_base_url="").values_list("registration_number", flat=True)

    hospital_ids = Hospital.objects.filter(
        registration_number__in=active_registration_numbers,
    ).values_list("id", flat=True)

    count = 0
    for hospital_id in hospital_ids:
        sync_hospital_data_task.delay(str(hospital_id))
        count += 1

    logger.info("Dispatched %d hospital registration sync tasks", count)
    return {"dispatched": count}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_hospital_data_task(self, hospital_id: str) -> dict:
    """Sync one hospital by calling external APIs and persisting data locally."""
    try:
        from .services import sync_hospital_data

        result = sync_hospital_data(hospital_id)
        logger.info("Hospital data sync completed", extra={"hospital_id": hospital_id, "result": result})
        return result
    except Exception as exc:
        logger.error(
            "Hospital data sync failed, retrying",
            extra={"hospital_id": hospital_id, "error": str(exc)},
        )
        raise self.retry(exc=exc)
