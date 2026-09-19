"""Notification event × channel preference helpers."""

from __future__ import annotations

from typing import Any

# Events shown in settings matrix (TC-style).
NOTIFY_EVENTS = (
    "rent_due",
    "payment_receipt",
    "maintenance_update",
    "messages",
    "lease_docs",
)

NOTIFY_MATRIX_CHANNELS = ("email", "sms", "whatsapp", "feed")

DEFAULT_EVENT_PREFS = {
    "email": True,
    "sms": True,
    "whatsapp": True,
    "feed": True,
}


def default_notification_prefs() -> dict[str, dict[str, bool]]:
    return {event: dict(DEFAULT_EVENT_PREFS) for event in NOTIFY_EVENTS}


def normalize_notification_prefs(raw: Any) -> dict[str, dict[str, bool]]:
    """Merge stored JSON with defaults; coerce to bools."""
    base = default_notification_prefs()
    if not isinstance(raw, dict):
        return base
    for event in NOTIFY_EVENTS:
        row = raw.get(event)
        if not isinstance(row, dict):
            continue
        for channel in NOTIFY_MATRIX_CHANNELS:
            if channel in row:
                base[event][channel] = bool(row[channel])
    return base


def event_channel_enabled(
    prefs: Any,
    event: str,
    channel: str,
) -> bool:
    """Return whether an event may go out on a channel. Unknown event = allow."""
    normalized = normalize_notification_prefs(prefs)
    if event not in normalized:
        return True
    ch = (channel or "").strip().lower()
    if ch not in NOTIFY_MATRIX_CHANNELS:
        return True
    return bool(normalized[event].get(ch, True))


def load_profile_notification_prefs(db: Any, user_id: str | None) -> dict[str, dict[str, bool]]:
    if not user_id:
        return default_notification_prefs()
    try:
        rows = (
            db.table("profiles")
            .select("notification_prefs")
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        return default_notification_prefs()
    if not rows:
        return default_notification_prefs()
    return normalize_notification_prefs(rows[0].get("notification_prefs"))


def tenant_user_id_for_unit(
    db: Any, *, unit_id: str, landlord_id: str
) -> str | None:
    """Latest non-ended tenancy’s linked tenant on this unit, if any."""
    try:
        rows = (
            db.table("tenancies")
            .select("tenant_user_id")
            .eq("unit_id", unit_id)
            .eq("landlord_id", landlord_id)
            .neq("status", "ended")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        return None
    if not rows:
        return None
    uid = rows[0].get("tenant_user_id")
    return str(uid) if uid else None


def load_tenant_prefs_for_unit(
    db: Any, *, unit_id: str, landlord_id: str
) -> dict[str, dict[str, bool]] | None:
    """
    Tenant notification_prefs for chase/receipt sends.
    None when no linked tenant_user_id (allow send; unclaimed contact).
    """
    tenant_uid = tenant_user_id_for_unit(
        db, unit_id=unit_id, landlord_id=landlord_id
    )
    if not tenant_uid:
        return None
    return load_profile_notification_prefs(db, tenant_uid)


def is_prefs_opt_out_error(exc: BaseException) -> bool:
    msg = str(exc or "").lower()
    return "turned off" in msg and "preferences" in msg
