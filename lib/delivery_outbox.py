"""Durable, leased delivery outbox for external notification side effects."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)


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
    """Best-effort immediate claim for interactive enqueue paths."""
    try:
        return process_delivery_outbox(
            db=db,
            batch_size=batch_size,
            lease_seconds=lease_seconds,
        )
    except Exception:
        logger.exception("Interactive delivery outbox flush failed")
        return {"claimed": 0, "sent": 0, "retried": 0, "dead": 0}


def _retry_delay(attempt_count: int) -> timedelta:
    base_seconds = min(3600, 15 * (2 ** max(0, attempt_count - 1)))
    return timedelta(seconds=base_seconds + random.uniform(0, base_seconds * 0.2))


def _is_permanent_failure(exc: Exception) -> bool:
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
    if error:
        row["error_detail"] = error[:180]
    try:
        db.table("reminders").insert(row).execute()
    except Exception:
        logger.exception("Failed to log reminder outbox %s", delivery.get("id"))


def _deliver(db: Any, delivery: dict[str, Any]) -> str | None:
    event_name = str(delivery.get("event_name") or "")
    payload = delivery.get("payload") or {}
    if not isinstance(payload, dict):
        raise RuntimeError("Invalid delivery payload")

    if event_name == "notification":
        from lib.notify import send_notification

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

    claimed = (
        db.rpc(
            "claim_delivery_outbox",
            {
                "p_batch_size": batch_size,
                "p_lease_seconds": lease_seconds,
            },
        )
        .execute()
        .data
        or []
    )
    if isinstance(claimed, dict):
        claimed = [claimed]
    stats = {"claimed": len(claimed), "sent": 0, "retried": 0, "dead": 0}

    for raw in claimed:
        delivery = dict(raw)
        delivery_id = str(delivery["id"])
        lease_token = str(delivery["lease_token"])
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
        except Exception as exc:  # noqa: BLE001 - worker must continue the batch
            permanent = _is_permanent_failure(exc)
            attempts = int(delivery.get("attempt_count") or 1)
            exhausted = attempts >= int(delivery.get("max_attempts") or 5)
            retry_at = datetime.now(timezone.utc) + _retry_delay(attempts)
            logger.exception("Outbox delivery %s failed", delivery_id)
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
                stats["dead"] += 1
            else:
                stats["retried"] += 1

    return stats
