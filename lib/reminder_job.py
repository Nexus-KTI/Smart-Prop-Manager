"""Due-rent and landlord renewal reminder jobs — Africa/Lagos calendar."""

from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

LAGOS = ZoneInfo("Africa/Lagos")
# Fire landlord renewal notice on these lead days (and on term_end itself).
RENEWAL_LEAD_DAYS = frozenset({30, 14, 7, 0})


def _today_lagos(today: date | None = None) -> date:
    if today is not None:
        return today
    return datetime.now(LAGOS).date()


def _js_weekday(day: date) -> int:
    """Match JavaScript Date#getDay (Sunday=0 … Saturday=6)."""
    return (day.weekday() + 1) % 7


def _parse_term_end(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def unit_is_due_today(unit: dict[str, Any], day: date) -> bool:
    """
    Mirror web/lib/dashboard.ts dueDateForUnit for the Lagos calendar day.
    - daily: every day
    - weekly: due_day 1–7 → Sun…Sat
    - monthly: due_day 1–31 (clamped to month length)
    - annual: due_month 1–12 + due_day 1–31 (defaults month to January)
    """
    freq = str(unit.get("frequency") or "monthly").strip().lower()
    raw = unit.get("due_day")

    if freq == "daily":
        return True

    if raw is None:
        return False
    try:
        due_day = int(raw)
    except (TypeError, ValueError):
        return False

    if freq == "weekly":
        if due_day < 1 or due_day > 7:
            return False
        target = (due_day - 1) % 7
        return _js_weekday(day) == target

    if freq == "annual":
        if due_day < 1 or due_day > 31:
            return False
        try:
            due_month = int(unit.get("due_month") or 1)
        except (TypeError, ValueError):
            due_month = 1
        if due_month < 1 or due_month > 12:
            return False
        if day.month != due_month:
            return False
        last = calendar.monthrange(day.year, due_month)[1]
        return day.day == min(due_day, last)

    # monthly (default)
    if due_day < 1 or due_day > 31:
        return False
    last = calendar.monthrange(day.year, day.month)[1]
    return day.day == min(due_day, last)


def unit_renewal_due_today(unit: dict[str, Any], day: date) -> bool:
    """True when term_end is today or a configured lead day away."""
    term_end = _parse_term_end(unit.get("term_end"))
    if term_end is None:
        return False
    days_left = (term_end - day).days
    return days_left in RENEWAL_LEAD_DAYS


def _already_reminded_today(
    db: Any, unit_id: str, day: date, *, kind: str
) -> bool:
    """Idempotency: one successful reminder of this kind per unit per Lagos day."""
    start = datetime(day.year, day.month, day.day, tzinfo=LAGOS).astimezone(
        timezone.utc
    )
    end = start + timedelta(days=1)
    rows = (
        db.table("reminders")
        .select("id")
        .eq("unit_id", unit_id)
        .eq("kind", kind)
        .eq("status", "sent")
        .gte("sent_at", start.isoformat())
        .lt("sent_at", end.isoformat())
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def _business_name(db: Any, owner_id: str | None) -> str | None:
    if not owner_id:
        return None
    rows = (
        db.table("profiles")
        .select("business_name")
        .eq("id", owner_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    name = (rows[0].get("business_name") or "").strip()
    return name or None


def run_due_reminders(*, today: date | None = None) -> dict[str, int]:
    """
    Send due reminders for units due today (Africa/Lagos), using frequency + due_day.
    Channel comes from the property owner's profile (SMS if unset).
    Skips units already reminded successfully today.
    """
    from lib.db import create_service_client
    from lib.notify import (
        DEFAULT_CHANNEL,
        contact_matches_channel,
        get_owner_notification_channel,
        send_notification,
    )

    day = _today_lagos(today)
    db = create_service_client()

    rows = (
        db.table("units")
        .select(
            "id, label, rent_amount, tenant_contact, due_day, frequency, "
            "properties(id, name, owner_id)"
        )
        .or_("frequency.eq.daily,due_day.not.is.null")
        .execute()
        .data
        or []
    )

    due_rows = [unit for unit in rows if unit_is_due_today(unit, day)]

    stats = {
        "checked": len(due_rows),
        "candidates": len(rows),
        "sent": 0,
        "failed": 0,
        "skipped": 0,
    }

    for unit in due_rows:
        unit_id = unit.get("id")
        contact = (unit.get("tenant_contact") or "").strip()
        property_row = unit.get("properties") or {}
        if isinstance(property_row, list):
            property_row = property_row[0] if property_row else {}

        owner_id = property_row.get("owner_id")
        property_name = property_row.get("name") or "your property"
        unit_label = unit.get("label") or "unit"

        if not unit_id or not contact:
            stats["skipped"] += 1
            continue

        if _already_reminded_today(db, unit_id, day, kind="due"):
            stats["skipped"] += 1
            continue

        channel = get_owner_notification_channel(db, owner_id) or DEFAULT_CHANNEL
        if not contact_matches_channel(channel, contact):
            logger.warning(
                "Skipping unit %s: contact incompatible with channel %s",
                unit_id,
                channel,
            )
            try:
                db.table("reminders").insert(
                    {
                        "unit_id": unit_id,
                        "channel": channel,
                        "kind": "due",
                        "status": "failed",
                        "error_detail": (
                            f"Tenant contact does not match {channel} channel"
                        ),
                    }
                ).execute()
            except Exception:
                logger.exception("Failed to log skip for unit %s", unit_id)
            stats["failed"] += 1
            continue

        business = _business_name(db, owner_id)
        from lib.email_templates import tenant_due

        due_mail = tenant_due(
            amount=unit.get("rent_amount") or 0,
            property_name=property_name,
            unit_label=unit_label,
            business_name=business,
        )
        message = due_mail.text

        error_detail = None
        try:
            used = send_notification(
                channel,
                contact,
                message,
                email_subject=due_mail.subject,
                email_html=due_mail.html,
            )
            status = "sent"
            stats["sent"] += 1
        except Exception as exc:
            logger.exception("Due reminder failed for unit %s", unit_id)
            used = channel
            status = "failed"
            stats["failed"] += 1
            reason = str(getattr(exc, "msg", None) or exc).strip()
            if len(reason) > 180:
                reason = reason[:179] + "…"
            error_detail = reason or f"Failed to send {channel} reminder"

        try:
            row = {
                "unit_id": unit_id,
                "channel": used,
                "kind": "due",
                "status": status,
            }
            if error_detail:
                row["error_detail"] = error_detail
            db.table("reminders").insert(row).execute()
        except Exception:
            logger.exception("Failed to log due reminder for unit %s", unit_id)

    return stats


def run_renewal_reminders(*, today: date | None = None) -> dict[str, int]:
    """
    Email landlords when a unit term_end is approaching (lead days) or due.
    Reuses the same cron entrypoint as due reminders; logs kind=renewal.
    """
    from lib.db import create_service_client
    from lib.email_templates import landlord_renewal
    from lib.notify import get_owner_email, send_email

    day = _today_lagos(today)
    db = create_service_client()

    rows = (
        db.table("units")
        .select(
            "id, label, tenant_name, term_end, "
            "properties(id, name, owner_id)"
        )
        .not_.is_("term_end", "null")
        .execute()
        .data
        or []
    )

    due_rows = [unit for unit in rows if unit_renewal_due_today(unit, day)]

    stats = {
        "checked": len(due_rows),
        "candidates": len(rows),
        "sent": 0,
        "failed": 0,
        "skipped": 0,
    }

    for unit in due_rows:
        unit_id = unit.get("id")
        property_row = unit.get("properties") or {}
        if isinstance(property_row, list):
            property_row = property_row[0] if property_row else {}
        owner_id = property_row.get("owner_id")
        property_name = property_row.get("name") or "your property"
        unit_label = unit.get("label") or "unit"
        term_end = _parse_term_end(unit.get("term_end"))

        if not unit_id or term_end is None:
            stats["skipped"] += 1
            continue

        if _already_reminded_today(db, unit_id, day, kind="renewal"):
            stats["skipped"] += 1
            continue

        email = get_owner_email(owner_id)
        days_left = (term_end - day).days
        content = landlord_renewal(
            property_name=property_name,
            unit_label=unit_label,
            term_end=term_end,
            days_left=days_left,
            tenant_name=unit.get("tenant_name"),
            unit_id=str(unit_id),
        )

        if not email:
            try:
                db.table("reminders").insert(
                    {
                        "unit_id": unit_id,
                        "channel": "email",
                        "kind": "renewal",
                        "status": "skipped",
                        "error_detail": "No email on landlord profile",
                    }
                ).execute()
            except Exception:
                logger.exception(
                    "Failed to log skipped renewal for unit %s", unit_id
                )
            stats["skipped"] += 1
            continue

        error_detail = None
        try:
            send_email(
                email,
                content.text,
                subject=content.subject,
                html=content.html,
            )
            status = "sent"
            stats["sent"] += 1
        except Exception as exc:
            logger.exception("Renewal reminder failed for unit %s", unit_id)
            status = "failed"
            stats["failed"] += 1
            reason = str(exc).strip()
            if len(reason) > 180:
                reason = reason[:179] + "…"
            error_detail = reason or "Failed to send renewal email"

        try:
            row = {
                "unit_id": unit_id,
                "channel": "email",
                "kind": "renewal",
                "status": status,
            }
            if error_detail:
                row["error_detail"] = error_detail
            db.table("reminders").insert(row).execute()
        except Exception:
            logger.exception("Failed to log renewal reminder for unit %s", unit_id)

    return stats


def run_reminder_jobs(*, today: date | None = None) -> dict[str, Any]:
    """Run due + renewal jobs (same Render cron / HTTP job route)."""
    return {
        "due": run_due_reminders(today=today),
        "renewal": run_renewal_reminders(today=today),
    }


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    logging.basicConfig(level=logging.INFO)
    result = run_reminder_jobs()
    print(result)
