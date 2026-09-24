"""Best-effort notify when a landlord assigns an artisan to a work order."""

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
