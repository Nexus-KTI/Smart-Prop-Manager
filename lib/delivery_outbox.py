"""Durable, leased delivery outbox for external notification side effects."""

from __future__ import annotations

import logging
import os
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from lib.circuit import CircuitOpenError

logger = logging.getLogger(__name__)

# Worst case for one provider call (Twilio timeout 20s + slack).
PER_DELIVERY_BUDGET_SEC = 30
MAX_LEASE_SEC = 1800
PHONE_SENDS_PER_HOUR = 10
_EMPTY_STATS = {"claimed": 0, "sent": 0, "retried": 0, "dead": 0, "deferred": 0}


class DeferDelivery(Exception):
    """Not a failure: put the row back for later without spending an attempt."""

    def __init__(self, reason: str, retry_in: float):
        super().__init__(reason)
        self.retry_in = retry_in


def inline_flush_enabled() -> bool:
    """Off once a dedicated worker drains the outbox (OUTBOX_INLINE_FLUSH=0)."""
    raw = (os.getenv("OUTBOX_INLINE_FLUSH") or "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def lease_for(batch_size: int, lease_seconds: int) -> int:
    """A lease long enough for every row in the batch to hit its provider timeout."""
    return min(MAX_LEASE_SEC, max(int(lease_seconds), batch_size * PER_DELIVERY_BUDGET_SEC))


def _first(value: Any) -> dict[str, Any] | None:
    if isinstance(value, list):
        value = value[0] if value else None
    return dict(value) if isinstance(value, dict) else None


def enqueue_delivery(
    db: Any,
    *,
    idempotency_key: str,
    event_name: str,
    channel: str | None = None,
    contact: str | None = None,
    payload: dict[str, Any] | None = None,
    max_attempts: int = 5,
) -> dict[str, Any]:
    """Insert once by stable key and return the existing/new outbox row."""
    params = {
        "p_idempotency_key": idempotency_key,
        "p_event_name": event_name,
        "p_channel": channel,
        "p_contact": contact,
        "p_payload": payload or {},
        "p_max_attempts": max_attempts,
    }

    def invoke(client: Any) -> Any:
        return (
            client.rpc(
                "enqueue_delivery",
                params,
            )
            .execute()
            .data
        )

    try:
        data = invoke(db)
    except Exception:
        # User-scoped callers cannot execute this service-only RPC. Retrying the
        # stable idempotency key through the trusted client is mutation-safe.
        from lib.db import create_service_client

        service_db = create_service_client()
        if service_db is db:
            raise
        data = invoke(service_db)
    row = _first(data)
    if not row:
        raise RuntimeError("Could not enqueue delivery")
    return row


def enqueue_notification(
    db: Any,
    *,
    idempotency_key: str,
    channel: str | None,
    contact: str,
    message: str,
    email_subject: str,
    email_html: str | None = None,
    event: str | None = None,
    notification_prefs: Any = None,
    reminder_log: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate preferences/contact now, then durably queue provider delivery."""
    from lib.notification_prefs import event_channel_enabled
    from lib.notify import contact_matches_channel, resolve_channel

    resolved = resolve_channel(channel)
    if event and not event_channel_enabled(notification_prefs, event, resolved):
        raise RuntimeError(
            f"Notification '{event}' is turned off for {resolved} in account preferences"
        )
    normalized_contact = (contact or "").strip()
    if not normalized_contact:
        raise RuntimeError("contact is required")
    if not contact_matches_channel(resolved, normalized_contact):
        raise RuntimeError(f"Contact does not match {resolved} channel")

    payload: dict[str, Any] = {
        "message": message,
        "email_subject": email_subject,
        "email_html": email_html,
    }
    if reminder_log:
        payload["reminder_log"] = reminder_log
    return enqueue_delivery(
        db,
        idempotency_key=idempotency_key,
        event_name="notification",
        channel=resolved,
        contact=normalized_contact,
        payload=payload,
    )


def enqueue_payment_receipt(db: Any, transaction_id: str) -> dict[str, Any]:
    return enqueue_delivery(
        db,
        idempotency_key=f"payment-receipt:{transaction_id}",
        event_name="payment_receipt",
        payload={"transaction_id": transaction_id},
        max_attempts=8,
    )


def flush_delivery_outbox(
    *,
    db: Any | None = None,
    batch_size: int = 10,
    lease_seconds: int = 90,
) -> dict[str, int]:
    """Best-effort immediate claim for interactive enqueue paths.

    Signed-in clients cannot execute claim_delivery_outbox. Retry through the
    service client, the same way enqueue_delivery does.
    """
    if not inline_flush_enabled():
        return dict(_EMPTY_STATS)
    try:
        return process_delivery_outbox(
            db=db,
            batch_size=batch_size,
            lease_seconds=lease_seconds,
        )
    except Exception:
        from lib.db import create_service_client

        service_db = create_service_client()
        if service_db is db:
            logger.exception("Interactive delivery outbox flush failed")
            return dict(_EMPTY_STATS)
        try:
            return process_delivery_outbox(
                db=service_db,
                batch_size=batch_size,
                lease_seconds=lease_seconds,
            )
        except Exception:
            logger.exception("Interactive delivery outbox flush failed")
            return dict(_EMPTY_STATS)


def _retry_delay(attempt_count: int) -> timedelta:
    base_seconds = min(3600, 15 * (2 ** max(0, attempt_count - 1)))
    return timedelta(seconds=base_seconds + random.uniform(0, base_seconds * 0.2))


def _is_permanent_failure(exc: Exception) -> bool:
    from lib.notify import PermanentDeliveryError

    if isinstance(exc, PermanentDeliveryError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return 400 <= code < 500 and code not in {408, 409, 425, 429}
    text = str(exc).lower()
    return any(
        marker in text
        for marker in (
            "contact is required",
            "contact does not match",
            "notification contact unavailable",
            "not configured",
            "invalid email",
            "requires a valid email",
            "turned off",
        )
    )


def _log_reminder(
    db: Any,
    delivery: dict[str, Any],
    *,
    status: str,
    error: str | None = None,
) -> None:
    payload = delivery.get("payload") or {}
    log_row = payload.get("reminder_log") if isinstance(payload, dict) else None
    if not isinstance(log_row, dict):
        return
    row = dict(log_row)
    row["status"] = status
    row["outbox_id"] = str(delivery["id"])
    if error:
        row["error_detail"] = error[:180]
    try:
        # A row re-claimed after its lease expired must not log a second reminder.
        (
            db.table("reminders")
            .upsert(row, on_conflict="outbox_id", ignore_duplicates=True)
            .execute()
        )
    except Exception:
        logger.exception("Failed to log reminder outbox %s", delivery.get("id"))


def _throttle_phone(channel: Any, contact: str) -> None:
    """Cap texts per number so a bug or a bulk run can't spam one tenant."""
    from lib.notify import normalize_e164, resolve_channel
    from lib.rate_limit import consume_rate_limit

    if resolve_channel(channel) == "email":
        return
    phone = normalize_e164(contact)
    if not phone:
        return
    try:
        allowed, retry_after = consume_rate_limit(
            f"outbox-phone:{phone}",
            limit=PHONE_SENDS_PER_HOUR,
            window_seconds=3600,
        )
    except Exception:
        # The limiter is a safety net; an outage there must not stop rent notices.
        logger.warning("Phone throttle unavailable; sending without it", exc_info=True)
        return
    if not allowed:
        raise DeferDelivery("Per-phone send limit reached", retry_after)


def _deliver(db: Any, delivery: dict[str, Any]) -> str | None:
    event_name = str(delivery.get("event_name") or "")
    payload = delivery.get("payload") or {}
    if not isinstance(payload, dict):
        raise RuntimeError("Invalid delivery payload")

    if event_name == "notification":
        from lib.notify import send_notification

        _throttle_phone(delivery.get("channel"), str(delivery.get("contact") or ""))
        used = send_notification(
            delivery.get("channel"),
            str(delivery.get("contact") or ""),
            str(payload.get("message") or ""),
            email_subject=str(payload.get("email_subject") or "Nexora notice"),
            email_html=payload.get("email_html"),
        )
        _log_reminder(db, delivery, status="sent")
        return used

    if event_name == "payment_receipt":
        from routers.payments import deliver_payment_receipt, _post_paid_to_chat

        transaction_id = str(payload.get("transaction_id") or "")
        rows = (
            db.table("transactions")
            .select("*")
            .eq("id", transaction_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise RuntimeError("Payment transaction unavailable")
        transaction = dict(rows[0])
        if transaction.get("status") != "paid":
            raise RuntimeError("Payment transaction is not paid")
        # Require tenant notify (or an intentional skip) so partial success retries.
        receipt_url = deliver_payment_receipt(
            db,
            transaction,
            require_tenant_notify=True,
        )
        if not receipt_url:
            raise RuntimeError("Payment receipt delivery incomplete")
        # Chat post is already idempotent on transaction_id.
        _post_paid_to_chat(db, transaction, receipt_url)
        return receipt_url

    raise RuntimeError(f"Unsupported delivery event: {event_name}")


def process_delivery_outbox(
    *,
    db: Any | None = None,
    batch_size: int = 25,
    lease_seconds: int = 120,
) -> dict[str, int]:
    """Claim a batch, deliver each row, and atomically acknowledge its lease."""
    if db is None:
        from lib.db import create_service_client

        db = create_service_client()

    lease = lease_for(batch_size, lease_seconds)
    started = time.monotonic()
    claimed = (
        db.rpc(
            "claim_delivery_outbox",
            {
                "p_batch_size": batch_size,
                "p_lease_seconds": lease,
            },
        )
        .execute()
        .data
        or []
    )
    if isinstance(claimed, dict):
        claimed = [claimed]
    stats = {**_EMPTY_STATS, "claimed": len(claimed)}
    # Stop starting sends once one more could outlive the lease and double-send.
    release_after = started + lease - PER_DELIVERY_BUDGET_SEC

    for raw in claimed:
        delivery = dict(raw)
        delivery_id = str(delivery["id"])
        lease_token = str(delivery["lease_token"])
        if time.monotonic() >= release_after:
            _defer(db, delivery_id, lease_token, 0, "Released unsent before lease expiry")
            stats["deferred"] += 1
            continue
        try:
            provider_id = _deliver(db, delivery)
            result = (
                db.rpc(
                    "complete_delivery_outbox",
                    {
                        "p_id": delivery_id,
                        "p_lease_token": lease_token,
                        "p_provider_message_id": provider_id,
                    },
                )
                .execute()
                .data
            )
            if result is not True:
                raise RuntimeError("Delivery lease acknowledgement failed")
            stats["sent"] += 1
        except (DeferDelivery, CircuitOpenError) as exc:
            _defer(db, delivery_id, lease_token, exc.retry_in, str(exc))
            stats["deferred"] += 1
        except Exception as exc:  # noqa: BLE001 - worker must continue the batch
            permanent = _is_permanent_failure(exc)
            attempts = int(delivery.get("attempt_count") or 1)
            exhausted = attempts >= int(delivery.get("max_attempts") or 5)
            retry_at = datetime.now(timezone.utc) + _retry_delay(attempts)
            if not (permanent or exhausted):
                logger.warning("Outbox delivery %s failed; will retry", delivery_id, exc_info=True)
            (
                db.rpc(
                    "fail_delivery_outbox",
                    {
                        "p_id": delivery_id,
                        "p_lease_token": lease_token,
                        "p_error": str(exc)[:1000] or "delivery_failed",
                        "p_retry_at": retry_at.isoformat(),
                        "p_permanent": permanent,
                    },
                )
                .execute()
            )
            if permanent or exhausted:
                _log_reminder(db, delivery, status="failed", error=str(exc))
                _alert_dead_letter(delivery, attempts, permanent, exc)
                stats["dead"] += 1
            else:
                stats["retried"] += 1

    return stats


def _alert_dead_letter(
    delivery: dict[str, Any],
    attempts: int,
    permanent: bool,
    exc: Exception,
) -> None:
    """One ERROR per dead letter (Sentry alert); the fields carry no contact or message text."""
    logger.error(
        "Outbox delivery %s dead-lettered",
        delivery.get("id"),
        exc_info=exc,
        extra={
            "alert": "outbox",
            "outbox_id": str(delivery.get("id") or ""),
            "event_name": str(delivery.get("event_name") or ""),
            "channel": str(delivery.get("channel") or ""),
            "attempts": attempts,
            "permanent": permanent,
        },
    )


def _defer(db: Any, delivery_id: str, lease_token: str, retry_in: float, reason: str) -> None:
    retry_at = datetime.now(timezone.utc) + timedelta(seconds=max(0.0, float(retry_in)))
    try:
        result = (
            db.rpc(
                "defer_delivery_outbox",
                {
                    "p_id": delivery_id,
                    "p_lease_token": lease_token,
                    "p_retry_at": retry_at.isoformat(),
                    "p_reason": reason[:1000],
                },
            )
            .execute()
            .data
        )
    except Exception:
        # The lease still expires on its own and the row is re-claimed.
        logger.exception("Outbox defer %s failed", delivery_id)
        return
    if result is not True:
        logger.warning("Outbox defer %s lost its lease", delivery_id)
