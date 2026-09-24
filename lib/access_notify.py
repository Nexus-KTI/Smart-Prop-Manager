"""Best-effort notify when a guest pass is admitted at the gate."""

from __future__ import annotations

import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

Audience = Literal["landlord", "issuer"]


def _place_label(db: Any, *, property_id: str, unit_id: str | None) -> str:
    prop_name = ""
    unit_label = ""
    try:
        props = (
            db.table("properties")
            .select("id, name")
            .eq("id", property_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if props:
            prop_name = (props[0].get("name") or "").strip()
    except Exception:
        pass
    if unit_id:
        try:
            units = (
                db.table("units")
                .select("id, label")
                .eq("id", unit_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if units:
                unit_label = (units[0].get("label") or "").strip()
        except Exception:
            pass
    if prop_name and unit_label:
        return f"{prop_name} · {unit_label}"
    return prop_name or unit_label or "your property"


def _auth_contact(user_id: str, channel: str) -> str | None:
    """Resolve email or phone from auth.users for the preferred channel."""
    from lib.notify import looks_like_email, normalize_e164

    try:
        from lib.db import create_service_client

        result = create_service_client().auth.admin.get_user_by_id(user_id)
        user = getattr(result, "user", None) or result
    except Exception:
        logger.info("access notify: auth lookup failed for %s", user_id)
        return None

    if channel == "email":
        email = (getattr(user, "email", None) or "").strip()
        return email if email and looks_like_email(email) else None

    phone = (getattr(user, "phone", None) or "").strip()
    if not phone:
        return None
    return normalize_e164(phone)


def _enqueue_one(
    db: Any,
    *,
    audience: Audience,
    user_id: str,
    landlord_id: str,
    idempotency_key: str,
    mail: Any,
) -> dict[str, Any]:
    from lib.delivery_outbox import enqueue_notification
    from lib.notification_prefs import load_profile_notification_prefs
    from lib.notify import get_owner_notification_channel, looks_like_email

    if audience == "landlord":
        channel = get_owner_notification_channel(db, landlord_id)
        prefs = load_profile_notification_prefs(db, landlord_id)
    else:
        channel = get_owner_notification_channel(db, user_id)
        prefs = load_profile_notification_prefs(db, user_id)

    contact = _auth_contact(user_id, channel)
    if not contact:
        alt = "email" if channel != "email" else "sms"
        contact = _auth_contact(user_id, alt)
        if contact:
            channel = "email" if looks_like_email(contact) else alt

    if not contact:
        return {"sent": False, "error": "no_contact", "audience": audience}

    queued = enqueue_notification(
        db,
        idempotency_key=idempotency_key,
        channel=channel,
        contact=contact,
        message=mail.text,
        email_subject=mail.subject,
        email_html=mail.html,
        event="gate_admit",
        notification_prefs=prefs,
    )
    return {
        "sent": True,
        "queued": True,
        "channel": queued.get("channel"),
        "audience": audience,
    }


def notify_guest_admitted(
    db: Any,
    *,
    landlord_id: str,
    property_id: str,
    unit_id: str | None,
    pass_id: str,
    event_id: str | None,
    code: str,
    subject_label: str | None,
    admitter_user_id: str,
    admitter_label: str,
    issuer_user_id: str | None,
    issuer_label: str | None,
    admitted_at: str | None,
    uses_count: int,
) -> dict[str, Any]:
    """Queue landlord + issuer notifies. Never raises.

    Skip landlord when they are the admitter (they already know).
    Skip issuer when they are the admitter or the landlord (covered above).
    """
    result: dict[str, Any] = {"landlord": None, "issuer": None}
    try:
        from lib.email_templates import frontend_base_url, guest_admitted

        place = _place_label(db, property_id=property_id, unit_id=unit_id)
        base_key = (
            f"gate-admit:{event_id}"
            if event_id
            else f"gate-admit:{pass_id}:{uses_count}"
        )

        if admitter_user_id != landlord_id:
            mail_ll = guest_admitted(
                audience="landlord",
                code=code,
                place=place,
                admitter_label=admitter_label,
                issuer_label=issuer_label,
                subject_label=subject_label,
                when_label=admitted_at,
                access_url=f"{frontend_base_url()}/access",
            )
            result["landlord"] = _enqueue_one(
                db,
                audience="landlord",
                user_id=landlord_id,
                landlord_id=landlord_id,
                idempotency_key=f"{base_key}:landlord",
                mail=mail_ll,
            )

        if (
            issuer_user_id
            and issuer_user_id != admitter_user_id
            and issuer_user_id != landlord_id
        ):
            mail_iss = guest_admitted(
                audience="issuer",
                code=code,
                place=place,
                admitter_label=admitter_label,
                issuer_label=issuer_label,
                subject_label=subject_label,
                when_label=admitted_at,
                access_url=f"{frontend_base_url()}/tenant/access",
            )
            result["issuer"] = _enqueue_one(
                db,
                audience="issuer",
                user_id=issuer_user_id,
                landlord_id=landlord_id,
                idempotency_key=f"{base_key}:issuer",
                mail=mail_iss,
            )
    except Exception as exc:  # noqa: BLE001 — notify must not fail admit
        logger.info("gate admit notify skipped: %s", exc)
        result["error"] = str(exc) or "notify_failed"
    return result
