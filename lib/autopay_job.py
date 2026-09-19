"""Charge rent via saved Paystack authorizations on due day."""

from __future__ import annotations

import logging
import hashlib
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from lib.reminder_job import _today_lagos, unit_is_due_today

logger = logging.getLogger(__name__)

LAGOS = ZoneInfo("Africa/Lagos")


def _already_paid_rent_today(db: Any, unit_id: str, day: date) -> bool:
    start = datetime(day.year, day.month, day.day, tzinfo=LAGOS).astimezone(
        timezone.utc
    )
    end = start + timedelta(days=1)
    rows = (
        db.table("transactions")
        .select("id")
        .eq("unit_id", unit_id)
        .eq("status", "paid")
        .eq("charge_type", "rent")
        .gte("paid_at", start.isoformat())
        .lt("paid_at", end.isoformat())
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def _tenant_email(user_id: str) -> str | None:
    try:
        from lib.db import create_service_client

        result = create_service_client().auth.admin.get_user_by_id(user_id)
        user = getattr(result, "user", None) or result
        email = (getattr(user, "email", None) or "").strip()
        return email or None
    except Exception:
        logger.exception("Failed to load email for tenant %s", user_id)
        return None


def _stable_autopay_keys(tenancy_id: str, due_date: date) -> tuple[str, str]:
    idempotency_key = f"autopay:{tenancy_id}:{due_date.isoformat()}"
    digest = hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest()[:24]
    return idempotency_key, f"nexora_ap_{digest}"


def _claim_autopay_transaction(
    db: Any,
    *,
    tenancy: dict[str, Any],
    unit: dict[str, Any],
    amount: float,
    due_date: date,
) -> tuple[dict[str, Any] | None, str | None]:
    idempotency_key, reference = _stable_autopay_keys(
        str(tenancy["id"]), due_date
    )
    data = (
        db.rpc(
            "claim_autopay_transaction",
            {
                "p_idempotency_key": idempotency_key,
                "p_unit_id": str(unit["id"]),
                "p_amount": amount,
                "p_tenant_user_id": str(tenancy["tenant_user_id"]),
                "p_payment_reference": reference,
                "p_lease_seconds": 300,
            },
        )
        .execute()
        .data
    )
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict) or not data.get("claimed"):
        return None, None
    transaction = data.get("transaction")
    lease_token = data.get("lease_token")
    if not isinstance(transaction, dict) or not lease_token:
        return None, None
    return dict(transaction), str(lease_token)


def _mark_autopay_failed(db: Any, txn_id: str, lease_token: str) -> None:
    (
        db.table("transactions")
        .update(
            {
                "status": "failed",
                "processing_lease_token": None,
                "processing_lease_expires_at": None,
            }
        )
        .eq("id", txn_id)
        .eq("processing_lease_token", lease_token)
        .execute()
    )


def _mark_autopay_paid(
    db: Any,
    *,
    transaction: dict[str, Any],
    lease_token: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    paid_at = data.get("paid_at") or datetime.now(timezone.utc).isoformat()
    reference = (
        data.get("reference") or transaction.get("payment_reference") or ""
    ).strip()
    updated = (
        db.table("transactions")
        .update(
            {
                "status": "paid",
                "paid_at": paid_at,
                "method": "paystack",
                "payment_reference": reference,
                "processing_lease_token": None,
                "processing_lease_expires_at": None,
            }
        )
        .eq("id", transaction["id"])
        .eq("processing_lease_token", lease_token)
        .execute()
        .data
        or []
    )
    if updated:
        return dict(updated[0])
    rows = (
        db.table("transactions")
        .select("*")
        .eq("id", transaction["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    return dict(rows[0]) if rows else transaction


def _charge_one(
    db: Any,
    *,
    tenancy: dict[str, Any],
    unit: dict[str, Any],
    method: dict[str, Any],
    due_date: date,
) -> str:
    """Claim one due cycle, charge once, and converge ambiguous outcomes."""
    from lib.paystack import charge_authorization, verify_transaction
    from lib.delivery_outbox import enqueue_payment_receipt

    unit_id = str(unit["id"])
    tenant_user_id = str(tenancy["tenant_user_id"])
    email = _tenant_email(tenant_user_id)
    if not email:
        return "failed_no_email"

    rent = float(unit.get("rent_amount") or 0)
    sc = float(unit.get("service_charge_amount") or 0)
    amount = rent + sc
    if amount <= 0:
        return "skipped_zero"

    amount_kobo = int(round(amount * 100))
    txn, lease_token = _claim_autopay_transaction(
        db,
        tenancy=tenancy,
        unit=unit,
        amount=amount,
        due_date=due_date,
    )
    if not txn or not lease_token:
        return "skipped_claimed"
    txn_id = str(txn["id"])
    reference = str(txn["payment_reference"])

    try:
        data = charge_authorization(
            email=email,
            amount_kobo=amount_kobo,
            authorization_code=str(method["authorization_code"]),
            reference=reference,
            metadata={
                "transaction_id": txn_id,
                "unit_id": unit_id,
                "purpose": "autopay_rent",
                "tenancy_id": tenancy["id"],
            },
        )
    except Exception as charge_exc:
        # The provider may have accepted the charge before our connection failed.
        # Verify the same stable reference before releasing it for a later retry.
        try:
            data = verify_transaction(reference)
        except Exception:
            logger.exception(
                "Autopay charge/verification failed for unit %s", unit_id
            )
            _mark_autopay_failed(db, txn_id, lease_token)
            return "failed_charge"
        logger.warning(
            "Autopay recovered ambiguous charge for unit %s: %s",
            unit_id,
            charge_exc,
        )

    paid_txn = _mark_autopay_paid(
        db,
        transaction=txn,
        lease_token=lease_token,
        data=data,
    )
    try:
        enqueue_payment_receipt(db, str(txn_id))
    except Exception:
        logger.exception("Autopay receipt enqueue failed for txn %s", txn_id)
    return "charged"


def run_autopay_charges(*, today: date | None = None) -> dict[str, int]:
    """
    Charge active tenancies with autopay enabled when the unit is due
    (Africa/Lagos), respecting autopay_days_before (0–7).
    """
    from lib.db import create_service_client

    day = _today_lagos(today)
    db = create_service_client()

    rows = (
        db.table("tenancies")
        .select(
            "id, unit_id, tenant_user_id, autopay_enabled, "
            "autopay_payment_method_id, autopay_days_before, "
            "units(id, label, rent_amount, service_charge_amount, "
            "due_day, frequency, due_month)"
        )
        .eq("status", "active")
        .eq("autopay_enabled", True)
        .execute()
        .data
        or []
    )
    rows = [
        r
        for r in rows
        if r.get("autopay_payment_method_id") and r.get("tenant_user_id")
    ]

    stats = {
        "checked": len(rows),
        "charged": 0,
        "skipped": 0,
        "failed": 0,
    }

    for row in rows:
        tenancy = dict(row)
        unit = tenancy.get("units") or {}
        if isinstance(unit, list):
            unit = unit[0] if unit else {}
        if not unit or not unit.get("id"):
            stats["skipped"] += 1
            continue

        try:
            days_before = int(tenancy.get("autopay_days_before") or 0)
        except (TypeError, ValueError):
            days_before = 0
        days_before = max(0, min(7, days_before))

        # Fire when the unit's due calendar day is today + days_before.
        target_due = day + timedelta(days=days_before)
        if not unit_is_due_today(unit, target_due):
            stats["skipped"] += 1
            continue

        unit_id = str(unit["id"])
        if _already_paid_rent_today(db, unit_id, day):
            stats["skipped"] += 1
            continue

        method_id = tenancy.get("autopay_payment_method_id")
        methods = (
            db.table("payment_methods")
            .select("*")
            .eq("id", method_id)
            .eq("user_id", tenancy["tenant_user_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if not methods:
            stats["failed"] += 1
            continue

        result = _charge_one(
            db,
            tenancy=tenancy,
            unit=unit,
            method=dict(methods[0]),
            due_date=target_due,
        )
        if result == "charged":
            stats["charged"] += 1
        elif result.startswith("failed"):
            stats["failed"] += 1
        else:
            stats["skipped"] += 1

    return stats
