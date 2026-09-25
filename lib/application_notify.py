"""Best-effort notify for rental application submit and decide."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def notify_application_submitted(
    db: Any,
    *,
    landlord_id: str,
    application_id: str,
    applicant_name: str,
    property_name: str | None = None,
    unit_label: str | None = None,
) -> dict[str, Any]:
    """Queue landlord notify. Never raises."""
    result: dict[str, Any] = {
        "sent": False,
        "queued": False,
        "channel": None,
        "error": None,
    }
    try:
        from lib.access_notify import _auth_contact
        from lib.delivery_outbox import enqueue_notification
        from lib.email_templates import application_submitted, frontend_base_url
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

        mail = application_submitted(
            applicant_name=applicant_name,
            applications_url=f"{frontend_base_url()}/applications",
            property_name=property_name,
            unit_label=unit_label,
        )
        queued = enqueue_notification(
            db,
            idempotency_key=f"application-submit:{application_id}",
            channel=channel,
            contact=contact,
            message=mail.text,
            email_subject=mail.subject,
            email_html=mail.html,
            event="messages",
            notification_prefs=prefs,
        )
        result["sent"] = True
        result["queued"] = True
        result["channel"] = queued.get("channel")
    except Exception as exc:  # noqa: BLE001
        logger.info("application submit notify skipped: %s", exc)
        result["error"] = str(exc) or "notify_failed"
    return result


def notify_application_decided(
    db: Any,
    *,
    application_id: str,
    status: str,
    applicant_email: str | None,
    applicant_phone: str | None,
    property_name: str | None = None,
    unit_label: str | None = None,
    next_url: str | None = None,
) -> dict[str, Any]:
    """Queue applicant notify on approve/reject. Never raises."""
    result: dict[str, Any] = {
        "sent": False,
        "queued": False,
        "channel": None,
        "error": None,
    }
    try:
        from lib.delivery_outbox import enqueue_notification
        from lib.email_templates import application_decided, frontend_base_url, _place
        from lib.notify import looks_like_email, normalize_e164

        email = (applicant_email or "").strip()
        phone = (applicant_phone or "").strip()
        if looks_like_email(email):
            channel = "email"
            contact = email
        elif phone:
            channel = "sms"
            contact = normalize_e164(phone)
        else:
            result["error"] = "no_contact"
            return result

        place = _place(property_name, unit_label) if (property_name or unit_label) else "the unit"
        approved = (status or "").strip().lower() == "approved"
        if not (next_url or "").strip():
            next_url = (
                f"{frontend_base_url()}/tenant"
                if approved
                else f"{frontend_base_url()}/apply"
            )
        mail = application_decided(status=status, place=place, next_url=next_url)
        queued = enqueue_notification(
            db,
            idempotency_key=f"application-decide:{application_id}:{status}",
            channel=channel,
            contact=contact,
            message=mail.text,
            email_subject=mail.subject,
            email_html=mail.html,
            event="messages",
        )
        result["sent"] = True
        result["queued"] = True
        result["channel"] = queued.get("channel")
    except Exception as exc:  # noqa: BLE001
        logger.info("application decide notify skipped: %s", exc)
        result["error"] = str(exc) or "notify_failed"
    return result
