"""Best-effort agreement/reference workflow notifications."""

from __future__ import annotations

import logging
import hashlib
from typing import Any, Literal

logger = logging.getLogger(__name__)


def notify_tenancy_document_event(
    db: Any,
    *,
    tenancy_id: str,
    recipient: Literal["landlord", "tenant"],
    message: str,
    email_subject: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "sent": False,
        "queued": False,
        "channel": None,
        "error": None,
    }
    try:
        from lib.delivery_outbox import enqueue_notification
        from lib.notification_prefs import load_profile_notification_prefs
        from lib.notify import (
            get_owner_email,
            get_owner_notification_channel,
            normalize_e164,
        )

        rows = (
            db.table("tenancies")
            .select("landlord_id, tenant_user_id, tenant_contact")
            .eq("id", tenancy_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise RuntimeError("Tenancy not found for notification")
        tenancy = dict(rows[0])

        if recipient == "landlord":
            user_id = tenancy.get("landlord_id")
            contact = get_owner_email(user_id)
            channel = "email"
        else:
            user_id = tenancy.get("tenant_user_id")
            contact = (tenancy.get("tenant_contact") or "").strip()
            channel = get_owner_notification_channel(db, user_id)
            if channel == "email":
                contact = get_owner_email(user_id)
            else:
                contact = normalize_e164(contact)

        if not user_id or not contact:
            raise RuntimeError(f"{recipient.title()} notification contact unavailable")
        prefs = load_profile_notification_prefs(db, user_id)
        fallback = hashlib.sha256(
            f"{tenancy_id}:{recipient}:{email_subject}:{message}".encode("utf-8")
        ).hexdigest()[:24]
        queued = enqueue_notification(
            db,
            idempotency_key=idempotency_key or f"tenancy-doc:{fallback}",
            channel=channel,
            contact=contact,
            message=message,
            email_subject=email_subject,
            event="lease_docs",
            notification_prefs=prefs,
        )
        result["sent"] = True
        result["queued"] = True
        result["channel"] = queued.get("channel")
    except Exception as exc:  # noqa: BLE001 — workflow must survive notify failure
        result["error"] = str(exc)[:240] or "notification_failed"
        logger.info("tenancy document notification skipped: %s", exc)
    return result
