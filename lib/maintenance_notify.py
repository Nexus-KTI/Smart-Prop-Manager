"""Best-effort notify for maintenance / work-order events."""

from __future__ import annotations

import logging
import hashlib
from typing import Any

logger = logging.getLogger(__name__)


def notify_artisan_assigned(
    db: Any,
    *,
    landlord_id: str,
    artisan_user_id: str,
    title: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Queue SMS/WhatsApp/email to roster invite_contact. Never raises."""
    result: dict[str, Any] = {
        "sent": False,
        "queued": False,
        "channel": None,
        "error": None,
    }
    try:
        from lib.delivery_outbox import enqueue_notification
        from lib.email_templates import artisan_job_assigned, frontend_base_url

        rows = (
            db.table("landlord_artisans")
            .select("invite_contact")
            .eq("landlord_id", landlord_id)
            .eq("artisan_user_id", artisan_user_id)
            .eq("status", "active")
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            result["error"] = "roster_not_found"
            return result
        contact = (rows[0].get("invite_contact") or "").strip()
        if not contact:
            result["error"] = "no_contact"
            return result

        link = f"{frontend_base_url()}/artisan/jobs"
        mail = artisan_job_assigned(title=title, jobs_url=link)
        fallback = hashlib.sha256(
            f"{landlord_id}:{artisan_user_id}:{title}".encode("utf-8")
        ).hexdigest()[:24]
        queued = enqueue_notification(
            db,
            idempotency_key=idempotency_key or f"artisan-assigned:{fallback}",
            channel=None,
            contact=contact,
            message=mail.text,
            email_subject=mail.subject,
            email_html=mail.html,
        )
        result["sent"] = True
        result["queued"] = True
        result["channel"] = queued.get("channel")
    except Exception as exc:  # noqa: BLE001 — notify must not fail assign
        logger.info("artisan assign notify skipped: %s", exc)
        result["error"] = str(exc) or "notify_failed"
    return result


def notify_landlord_tenant_request(
    db: Any,
    *,
    landlord_id: str,
    request_id: str,
    title: str,
    priority: str | None = None,
    property_name: str | None = None,
    unit_label: str | None = None,
    tenant_name: str | None = None,
) -> dict[str, Any]:
    """Queue notify to landlord when a tenant opens a repair. Never raises."""
    result: dict[str, Any] = {
        "sent": False,
        "queued": False,
        "channel": None,
        "error": None,
    }
    try:
        from lib.access_notify import _auth_contact
        from lib.delivery_outbox import enqueue_notification
        from lib.email_templates import frontend_base_url, tenant_maintenance_submitted
        from lib.notification_prefs import load_profile_notification_prefs
        from lib.notify import get_owner_notification_channel, looks_like_email

        channel = get_owner_notification_channel(db, landlord_id)
        prefs = load_profile_notification_prefs(db, landlord_id)
        contact = _auth_contact(landlord_id, channel)
        if not contact:
            alt = "email" if channel != "email" else "sms"
            contact = _auth_contact(landlord_id, alt)
            if contact:
                channel = "email" if looks_like_email(contact) else alt
        if not contact:
            result["error"] = "no_contact"
            return result

        link = f"{frontend_base_url()}/work-orders"
        mail = tenant_maintenance_submitted(
            title=title,
            work_orders_url=link,
            priority=priority,
            property_name=property_name,
            unit_label=unit_label,
            tenant_name=tenant_name,
        )
        queued = enqueue_notification(
            db,
            idempotency_key=f"tenant-maintenance:{request_id}",
            channel=channel,
            contact=contact,
            message=mail.text,
            email_subject=mail.subject,
            email_html=mail.html,
            event="maintenance_update",
            notification_prefs=prefs,
        )
        result["sent"] = True
        result["queued"] = True
        result["channel"] = queued.get("channel")
    except Exception as exc:  # noqa: BLE001 — notify must not fail create
        logger.info("tenant maintenance notify skipped: %s", exc)
        result["error"] = str(exc) or "notify_failed"
    return result
