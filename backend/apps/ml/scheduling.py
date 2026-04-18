"""Runtime helpers for evaluating and scheduling MLSchedule rows."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone as dt_timezone
from math import ceil
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from celery.schedules import crontab
from django.conf import settings
from django.utils import timezone

from .models import MLSchedule

logger = logging.getLogger("hrsp.ml")

try:  # Optional dependency; we gracefully fall back when absent.
    from timezonefinder import TimezoneFinder
except Exception:  # noqa: BLE001
    TimezoneFinder = None

_TIMEZONE_FINDER = TimezoneFinder() if TimezoneFinder is not None else None

AUTO_TIMEZONE_VALUES = {"", "auto"}
UTC_ALIASES = {"utc", "etc/utc", "gmt", "etc/gmt", "z"}

COUNTRY_TIMEZONE_FALLBACKS = {
    "bangladesh": "Asia/Dhaka",
    "india": "Asia/Kolkata",
    "pakistan": "Asia/Karachi",
    "nepal": "Asia/Kathmandu",
    "sri lanka": "Asia/Colombo",
    "myanmar": "Asia/Yangon",
}

WEEKDAY_NAME_TO_INT = {
    "mon": 0,
    "monday": 0,
    "tue": 1,
    "tuesday": 1,
    "wed": 2,
    "wednesday": 2,
    "thu": 3,
    "thursday": 3,
    "fri": 4,
    "friday": 4,
    "sat": 5,
    "saturday": 5,
    "sun": 6,
    "sunday": 6,
}

OFFSET_TZ_PATTERN = re.compile(r"^(?:UTC)?([+-])(\d{1,2})(?::?(\d{2}))?$", re.IGNORECASE)


@dataclass(frozen=True)
class ScheduleEvaluation:
    due_at: datetime | None
    next_run_at: datetime | None
    timezone_name: str
    timezone_source: str


def _is_utc_like(value: str) -> bool:
    cleaned = (value or "").strip().lower()
    return cleaned in UTC_ALIASES


def _zoneinfo(value: str | None) -> ZoneInfo | None:
    name = (value or "").strip()
    if not name:
        return None
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return None


def _fixed_offset_timezone(value: str | None) -> tuple[dt_timezone, str] | None:
    raw = (value or "").strip()
    if not raw:
        return None

    match = OFFSET_TZ_PATTERN.match(raw)
    if not match:
        return None

    sign_token, hours_token, minutes_token = match.groups()
    hours = int(hours_token)
    minutes = int(minutes_token or "0")
    if hours > 14 or minutes > 59:
        return None

    sign = 1 if sign_token == "+" else -1
    delta = timedelta(hours=hours, minutes=minutes) * sign
    canonical = f"UTC{sign_token}{hours:02d}:{minutes:02d}"
    return dt_timezone(delta), canonical


def is_supported_timezone_value(value: str | None) -> bool:
    cleaned = (value or "").strip()
    if cleaned.lower() in AUTO_TIMEZONE_VALUES:
        return True
    if _zoneinfo(cleaned) is not None:
        return True
    return _fixed_offset_timezone(cleaned) is not None


def _fallback_timezone_from_country(country: str | None) -> str | None:
    if not country:
        return None
    return COUNTRY_TIMEZONE_FALLBACKS.get(country.strip().lower())


def _fallback_timezone_from_coordinates(latitude, longitude) -> str | None:
    if latitude is None or longitude is None:
        return None

    if _TIMEZONE_FINDER is not None:
        try:
            guessed_name = _TIMEZONE_FINDER.timezone_at(lat=float(latitude), lng=float(longitude))
        except Exception:  # noqa: BLE001
            guessed_name = None
        if guessed_name and _zoneinfo(guessed_name):
            return guessed_name

    return None


def _fallback_timezone_from_longitude(longitude) -> str | None:
    if longitude is None:
        return None

    # Final fallback when an IANA timezone cannot be inferred.
    offset_hours = int(round(float(longitude) / 15.0))
    offset_hours = max(-12, min(14, offset_hours))
    if offset_hours == 0:
        return "UTC"
    sign = "+" if offset_hours > 0 else "-"
    return f"UTC{sign}{abs(offset_hours):02d}:00"


def infer_facility_timezone_name(facility) -> str | None:
    if facility is None:
        return None

    from_coordinates = _fallback_timezone_from_coordinates(
        getattr(facility, "latitude", None),
        getattr(facility, "longitude", None),
    )
    if from_coordinates:
        return from_coordinates

    from_country = _fallback_timezone_from_country(getattr(facility, "country", None))
    if from_country:
        return from_country

    return _fallback_timezone_from_longitude(getattr(facility, "longitude", None))


def resolve_timezone_for_facility(
    requested_timezone: str | None,
    facility,
    *,
    prefer_facility_for_utc: bool,
) -> tuple[dt_timezone | ZoneInfo, str, str]:
    requested = (requested_timezone or "").strip()

    if requested.lower() not in AUTO_TIMEZONE_VALUES:
        explicit_zone = _zoneinfo(requested)
        if explicit_zone is not None:
            if prefer_facility_for_utc and _is_utc_like(requested):
                inferred_name = infer_facility_timezone_name(facility)
                inferred_zone = _zoneinfo(inferred_name)
                if inferred_name and inferred_zone and not _is_utc_like(inferred_name):
                    return inferred_zone, inferred_name, "facility_fallback"
                inferred_offset = _fixed_offset_timezone(inferred_name)
                if inferred_name and inferred_offset is not None and not _is_utc_like(inferred_name):
                    zone, canonical = inferred_offset
                    return zone, canonical, "facility_fallback"
            return explicit_zone, requested, "schedule"

        explicit_offset = _fixed_offset_timezone(requested)
        if explicit_offset is not None:
            zone, canonical = explicit_offset
            return zone, canonical, "schedule"

    inferred_name = infer_facility_timezone_name(facility)
    inferred_zone = _zoneinfo(inferred_name)
    if inferred_name and inferred_zone:
        return inferred_zone, inferred_name, "facility_fallback"

    inferred_offset = _fixed_offset_timezone(inferred_name)
    if inferred_offset is not None:
        zone, canonical = inferred_offset
        return zone, canonical, "facility_fallback"

    return dt_timezone.utc, "UTC", "fallback_utc"


def normalize_schedule_timezone(requested_timezone: str | None, facility) -> str:
    _, timezone_name, _ = resolve_timezone_for_facility(
        requested_timezone,
        facility,
        prefer_facility_for_utc=False,
    )
    return timezone_name


def _run_time_for(schedule: MLSchedule) -> time:
    return schedule.run_time or time(hour=0, minute=0)


def _pre_run_delta_for(schedule: MLSchedule) -> timedelta:
    return timedelta(minutes=max(0, int(schedule.pre_run_offset_minutes or 0)))


def _daily_slot_for(day, schedule: MLSchedule, local_tz) -> datetime:
    return datetime.combine(day, _run_time_for(schedule), tzinfo=local_tz) - _pre_run_delta_for(schedule)


def _daily_previous_or_current(local_now: datetime, schedule: MLSchedule, local_tz) -> datetime:
    current = _daily_slot_for(local_now.date(), schedule, local_tz)
    if current > local_now:
        current -= timedelta(days=1)
    return current


def _daily_next_after(local_after: datetime, schedule: MLSchedule, local_tz) -> datetime:
    candidate = _daily_slot_for(local_after.date(), schedule, local_tz)
    if candidate <= local_after:
        candidate += timedelta(days=1)
    return candidate


def _weekly_anchor_weekday(schedule: MLSchedule, local_tz) -> int:
    parameters = schedule.parameters if isinstance(schedule.parameters, dict) else {}
    raw_weekday = parameters.get("weekday")
    if isinstance(raw_weekday, int) and 0 <= raw_weekday <= 6:
        return raw_weekday

    if isinstance(raw_weekday, str):
        mapped = WEEKDAY_NAME_TO_INT.get(raw_weekday.strip().lower())
        if mapped is not None:
            return mapped

    created_local = (schedule.created_at or timezone.now()).astimezone(local_tz)
    return created_local.weekday()


def _weekly_slot_for(anchor_date, schedule: MLSchedule, local_tz) -> datetime:
    return datetime.combine(anchor_date, _run_time_for(schedule), tzinfo=local_tz) - _pre_run_delta_for(schedule)


def _weekly_previous_or_current(local_now: datetime, schedule: MLSchedule, local_tz) -> datetime:
    anchor_weekday = _weekly_anchor_weekday(schedule, local_tz)
    day_delta = (local_now.weekday() - anchor_weekday) % 7
    this_anchor_date = local_now.date() - timedelta(days=day_delta)
    current = _weekly_slot_for(this_anchor_date, schedule, local_tz)
    if current > local_now:
        current -= timedelta(days=7)
    return current


def _weekly_next_after(local_after: datetime, schedule: MLSchedule, local_tz) -> datetime:
    anchor_weekday = _weekly_anchor_weekday(schedule, local_tz)
    day_delta = (local_after.weekday() - anchor_weekday) % 7
    this_anchor_date = local_after.date() - timedelta(days=day_delta)
    candidate = _weekly_slot_for(this_anchor_date, schedule, local_tz)
    if candidate <= local_after:
        candidate += timedelta(days=7)
    return candidate


def _next_cron_after(cron_expression: str, local_after: datetime) -> datetime | None:
    parts = [part.strip() for part in str(cron_expression or "").split() if part.strip()]
    if len(parts) != 5:
        return None

    minute, hour, day_of_month, month_of_year, day_of_week = parts
    cursor = local_after
    for _ in range(4):
        try:
            schedule = crontab(
                minute=minute,
                hour=hour,
                day_of_month=day_of_month,
                month_of_year=month_of_year,
                day_of_week=day_of_week,
                nowfun=lambda: cursor,
            )
            remaining = schedule.remaining_estimate(cursor)
        except Exception:  # noqa: BLE001
            logger.warning("Invalid cron expression for schedule evaluation: %s", cron_expression)
            return None

        if remaining.total_seconds() < 0:
            cursor += timedelta(seconds=1)
            continue

        candidate = cursor + remaining
        if candidate <= local_after:
            cursor = local_after + timedelta(seconds=1)
            continue
        return candidate
    return None


def evaluate_schedule(
    schedule: MLSchedule,
    *,
    now_utc: datetime | None = None,
    allow_initial_catchup: bool,
    prefer_facility_timezone_for_utc: bool,
) -> ScheduleEvaluation:
    now_utc = now_utc or timezone.now()
    local_tz, timezone_name, timezone_source = resolve_timezone_for_facility(
        schedule.timezone,
        schedule.facility,
        prefer_facility_for_utc=prefer_facility_timezone_for_utc,
    )
    local_now = now_utc.astimezone(local_tz)

    due_at = None

    if schedule.frequency == MLSchedule.Frequency.DAILY:
        if schedule.run_time is None:
            return ScheduleEvaluation(due_at=None, next_run_at=None, timezone_name=timezone_name, timezone_source=timezone_source)

        if schedule.next_run_at and schedule.next_run_at <= now_utc:
            due_at = schedule.next_run_at
        elif allow_initial_catchup and schedule.next_run_at is None and schedule.last_run_at is None:
            previous_slot_utc = _daily_previous_or_current(local_now, schedule, local_tz).astimezone(dt_timezone.utc)
            if previous_slot_utc <= now_utc:
                due_at = previous_slot_utc

        if schedule.last_run_at and due_at and schedule.last_run_at >= due_at:
            due_at = None

        local_anchor = due_at.astimezone(local_tz) + timedelta(seconds=1) if due_at else local_now
        next_run_at = _daily_next_after(local_anchor, schedule, local_tz).astimezone(dt_timezone.utc)
        return ScheduleEvaluation(
            due_at=due_at,
            next_run_at=next_run_at,
            timezone_name=timezone_name,
            timezone_source=timezone_source,
        )

    if schedule.frequency == MLSchedule.Frequency.WEEKLY:
        if schedule.run_time is None:
            return ScheduleEvaluation(due_at=None, next_run_at=None, timezone_name=timezone_name, timezone_source=timezone_source)

        if schedule.next_run_at and schedule.next_run_at <= now_utc:
            due_at = schedule.next_run_at
        elif allow_initial_catchup and schedule.next_run_at is None and schedule.last_run_at is None:
            previous_slot_utc = _weekly_previous_or_current(local_now, schedule, local_tz).astimezone(dt_timezone.utc)
            if previous_slot_utc <= now_utc:
                due_at = previous_slot_utc

        if schedule.last_run_at and due_at and schedule.last_run_at >= due_at:
            due_at = None

        local_anchor = due_at.astimezone(local_tz) + timedelta(seconds=1) if due_at else local_now
        next_run_at = _weekly_next_after(local_anchor, schedule, local_tz).astimezone(dt_timezone.utc)
        return ScheduleEvaluation(
            due_at=due_at,
            next_run_at=next_run_at,
            timezone_name=timezone_name,
            timezone_source=timezone_source,
        )

    if schedule.frequency == MLSchedule.Frequency.CRON:
        if schedule.next_run_at and schedule.next_run_at <= now_utc:
            due_at = schedule.next_run_at

        if schedule.last_run_at and due_at and schedule.last_run_at >= due_at:
            due_at = None

        local_anchor = due_at.astimezone(local_tz) + timedelta(seconds=1) if due_at else local_now
        next_local = _next_cron_after(schedule.cron_expression, local_anchor)
        next_run_at = next_local.astimezone(dt_timezone.utc) if next_local else None
        return ScheduleEvaluation(
            due_at=due_at,
            next_run_at=next_run_at,
            timezone_name=timezone_name,
            timezone_source=timezone_source,
        )

    return ScheduleEvaluation(due_at=None, next_run_at=None, timezone_name=timezone_name, timezone_source=timezone_source)


def _same_day_grace_minutes() -> int:
    return max(0, int(getattr(settings, "ML_SCHEDULE_SAME_DAY_GRACE_MINUTES", 60)))


def _warning_window_minutes() -> int:
    return max(1, int(getattr(settings, "ML_SCHEDULE_WARNING_WINDOW_MINUTES", 60)))


def _daily_slot_today(local_now: datetime, schedule: MLSchedule, local_tz) -> datetime:
    return _daily_slot_for(local_now.date(), schedule, local_tz)


def _weekly_slot_today(local_now: datetime, schedule: MLSchedule, local_tz) -> datetime | None:
    anchor_weekday = _weekly_anchor_weekday(schedule, local_tz)
    if local_now.weekday() != anchor_weekday:
        return None
    return _weekly_slot_for(local_now.date(), schedule, local_tz)


def _same_day_grace_due_slot(schedule: MLSchedule, now_utc: datetime) -> datetime | None:
    if schedule.run_time is None:
        return None
    if schedule.frequency not in {MLSchedule.Frequency.DAILY, MLSchedule.Frequency.WEEKLY}:
        return None

    grace_minutes = _same_day_grace_minutes()
    if grace_minutes <= 0:
        return None

    local_tz, _, _ = resolve_timezone_for_facility(
        schedule.timezone,
        schedule.facility,
        prefer_facility_for_utc=True,
    )
    local_now = now_utc.astimezone(local_tz)
    grace_window = timedelta(minutes=grace_minutes)

    if schedule.frequency == MLSchedule.Frequency.DAILY:
        slot_local = _daily_slot_today(local_now, schedule, local_tz)
    else:
        slot_local = _weekly_slot_today(local_now, schedule, local_tz)

    if slot_local is None:
        return None

    if not (slot_local <= local_now <= (slot_local + grace_window)):
        return None

    slot_utc = slot_local.astimezone(dt_timezone.utc)
    if schedule.last_run_at and schedule.last_run_at >= slot_utc:
        return None
    return slot_utc


def compute_next_run_at(schedule: MLSchedule, *, now_utc: datetime | None = None) -> datetime | None:
    now_utc = now_utc or timezone.now()
    grace_due_slot = _same_day_grace_due_slot(schedule, now_utc)
    if grace_due_slot is not None:
        return grace_due_slot

    return evaluate_schedule(
        schedule,
        now_utc=now_utc,
        allow_initial_catchup=False,
        prefer_facility_timezone_for_utc=False,
    ).next_run_at


def build_schedule_frontend_hint(schedule: MLSchedule, *, now_utc: datetime | None = None) -> dict:
    now_utc = now_utc or timezone.now()
    local_tz, timezone_name, timezone_source = resolve_timezone_for_facility(
        schedule.timezone,
        schedule.facility,
        prefer_facility_for_utc=True,
    )

    next_run_at = schedule.next_run_at or compute_next_run_at(schedule, now_utc=now_utc)
    local_now = now_utc.astimezone(local_tz)
    local_next = next_run_at.astimezone(local_tz) if next_run_at else None

    minutes_until_next_run = None
    if next_run_at:
        seconds_until_next = (next_run_at - now_utc).total_seconds()
        if seconds_until_next >= 0:
            minutes_until_next_run = int(ceil(seconds_until_next / 60.0))
        else:
            minutes_until_next_run = int(seconds_until_next // 60)

    warning_window = _warning_window_minutes()
    is_imminent_window = (
        minutes_until_next_run is not None
        and 0 <= minutes_until_next_run <= warning_window
    )

    missed_today_cutoff = False
    minutes_past_today_cutoff = None

    if schedule.run_time is not None and local_next is not None:
        slot_local = None
        if schedule.frequency == MLSchedule.Frequency.DAILY:
            slot_local = _daily_slot_today(local_now, schedule, local_tz)
        elif schedule.frequency == MLSchedule.Frequency.WEEKLY:
            slot_local = _weekly_slot_today(local_now, schedule, local_tz)

        slot_utc = slot_local.astimezone(dt_timezone.utc) if slot_local is not None else None
        already_ran_today_slot = bool(slot_utc and schedule.last_run_at and schedule.last_run_at >= slot_utc)

        if (
            slot_local is not None
            and not already_ran_today_slot
            and local_now > slot_local
            and local_next.date() > local_now.date()
        ):
            missed_today_cutoff = True
            minutes_past_today_cutoff = int((local_now - slot_local).total_seconds() // 60)

    notice_code = None
    if missed_today_cutoff:
        notice_code = "missed_today_cutoff"
    elif is_imminent_window:
        notice_code = "imminent_window"

    return {
        "timezone": timezone_name,
        "timezone_source": timezone_source,
        "warning_window_minutes": warning_window,
        "now_local": local_now.isoformat(),
        "next_run_at_utc": next_run_at.isoformat() if next_run_at else None,
        "next_run_at_local": local_next.isoformat() if local_next else None,
        "minutes_until_next_run": minutes_until_next_run,
        "is_imminent_window": is_imminent_window,
        "missed_today_cutoff": missed_today_cutoff,
        "minutes_past_today_cutoff": minutes_past_today_cutoff,
        "show_timing_notice": bool(is_imminent_window or missed_today_cutoff),
        "notice_code": notice_code,
    }