"""Best-effort notify when a landlord assigns a tenant to-do."""

from __future__ import annotations

import logging
import hashlib
from typing import Any

logger = logging.getLogger(__name__)


def notify_tenant_task_assigned(
    db: Any,
    *,
    landlord_id: str,
    tenancy_id: str | None,
    title: str,
    due_on: str | None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Queue SMS/WhatsApp/email to tenancy.tenant_contact. Never raises."""
    result: dict[str, Any] = {
        "sent": False,
        "queued": False,
        "channel": None,
        "error": None,
    }
    if not tenancy_id:
        result["error"] = "no_tenancy"
        return result
    try:
        from lib.delivery_outbox import enqueue_notification
        from lib.email_templates import frontend_base_url, tenant_task_assigned
        from lib.notification_prefs import load_profile_notification_prefs
        from lib.notify import (
            get_owner_notification_channel,
            normalize_e164,
        )

        rows = (
            db.table("tenancies")
            .select("id, tenant_contact, tenant_user_id, tenant_name")
            .eq("id", tenancy_id)
            .eq("landlord_id", landlord_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            result["error"] = "tenancy_not_found"
            return result
        contact = (rows[0].get("tenant_contact") or "").strip()
        if not contact:
            result["error"] = "no_contact"
            return result

        channel = get_owner_notification_channel(db, landlord_id)
        tenant_uid = rows[0].get("tenant_user_id")
        prefs = load_profile_notification_prefs(db, tenant_uid) if tenant_uid else None
        link = f"{frontend_base_url()}/tenant/tasks"
        mail = tenant_task_assigned(
            title=title,
            tasks_url=link,
            due_on=due_on,
        )
        notify_to = contact if channel == "email" else normalize_e164(contact)
        fallback = hashlib.sha256(
            f"{landlord_id}:{tenancy_id}:{title}:{due_on}".encode("utf-8")
        ).hexdigest()[:24]
        queued = enqueue_notification(
            db,
            idempotency_key=idempotency_key or f"task-assigned:{fallback}",
            channel=channel,
            contact=notify_to,
            message=mail.text,
            email_subject=mail.subject,
            email_html=mail.html,
            event="messages",
            notification_prefs=prefs,
        )
        result["sent"] = True
        result["queued"] = True
        result["channel"] = queued.get("channel")
    except Exception as exc:  # noqa: BLE001 — notify must not fail create
        logger.info("tenant task notify skipped: %s", exc)
        result["error"] = str(exc) or "notify_failed"
    return result
