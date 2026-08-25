import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status

from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.notify import (
    get_owner_notification_channel,
    landlord_payment_notice_detail,
    notify_landlord_payment_received,
    send_notification,
)
from lib.pagination import apply_desc_cursor, page_size, paginate_desc
from lib.paystack import verify_transaction, verify_webhook_signature
from lib.receipts import generate_receipt, upload_receipt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])

VALID_CHARGE_TYPES = frozenset({"rent", "service_charge", "other"})


def _normalize_charge_fields(payload: dict) -> tuple[str, str | None]:
    """Parse charge_type / charge_label from a payment payload."""
    raw = (payload.get("charge_type") or "rent").strip().lower()
    if raw not in VALID_CHARGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="charge_type must be rent, service_charge, or other",
        )
    label = (payload.get("charge_label") or "").strip() or None
    if raw == "other" and not label:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="charge_label is required when charge_type is other",
        )
    if raw != "other":
        label = None
    return raw, label


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _post_paid_to_chat(db, transaction: dict, receipt_url: str | None = None) -> None:
    """Best-effort: surface paid status in existing landlord↔tenant chat."""
    try:
        from routers.messages import post_payment_to_chat

        payload = dict(transaction)
        if receipt_url:
            payload["receipt_url"] = receipt_url
        post_payment_to_chat(db, payload)
    except Exception:
        logger.exception(
            "Failed to post payment to chat for txn %s",
            transaction.get("id"),
        )


def _load_unit_context(db, unit_id: str) -> tuple[dict, str, str | None] | None:
    rows = (
        db.table("units")
        .select(
            "id, label, tenant_name, tenant_contact, property_id, "
            "properties(name, owner_id)"
        )
        .eq("id", unit_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    unit = dict(rows[0])
    property_row = unit.pop("properties", None) or {}
    if isinstance(property_row, list):
        property_row = property_row[0] if property_row else {}
    property_name = property_row.get("name") or ""
    owner_id = property_row.get("owner_id")
    return unit, property_name, str(owner_id) if owner_id else None


def _business_name_for_owner(db, owner_id: str | None) -> str | None:
    if not owner_id:
        return None
    rows = (
        db.table("profiles")
        .select("business_name")
        .eq("id", owner_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    name = (rows[0].get("business_name") or "").strip()
    return name or None


def _clip_detail(detail: str | None, limit: int = 180) -> str | None:
    text = (detail or "").strip()
    if not text:
        return None
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def _log_reminder(
    db,
    unit_id: str,
    *,
    kind: str,
    channel: str,
    reminder_status: str,
    error_detail: str | None = None,
) -> None:
    row: dict = {
        "unit_id": unit_id,
        "channel": channel,
        "kind": kind,
        "status": reminder_status,
    }
    detail = _clip_detail(error_detail)
    if detail:
        row["error_detail"] = detail
    db.table("reminders").insert(row).execute()


def _log_receipt_reminder(
    db,
    unit_id: str,
    reminder_status: str,
    channel: str,
    error_detail: str | None = None,
) -> None:
    _log_reminder(
        db,
        unit_id,
        kind="receipt",
        channel=channel,
        reminder_status=reminder_status,
        error_detail=error_detail,
    )


def _log_landlord_payment_notice(
    db, unit_id: str, notify_status: str, error_detail: str | None = None
) -> None:
    """Persist landlord payment email outcome for the unit reminders UI."""
    status = (
        notify_status if notify_status in {"sent", "skipped", "failed"} else "failed"
    )
    detail = error_detail
    if status == "skipped" and not detail:
        detail = "No email on landlord profile"
    elif status == "failed" and not detail:
        detail = "Could not send landlord email"
    _log_reminder(
        db,
        unit_id,
        kind="landlord_payment",
        channel="email",
        reminder_status=status,
        error_detail=detail,
    )


def _landlord_payment_notice_already_sent(
    db, unit_id: str, paid_at: Any = None
) -> bool:
    """True if we already emailed the landlord for this payment window."""
    table = getattr(db, "table", None)
    if not callable(table):
        return False
    try:
        q = (
            db.table("reminders")
            .select("id")
            .eq("unit_id", unit_id)
            .eq("kind", "landlord_payment")
            .eq("status", "sent")
            .order("sent_at", desc=True)
            .limit(1)
        )
        if paid_at:
            q = q.gte("sent_at", paid_at)
        rows = q.execute().data or []
        return bool(rows)
    except Exception:
        logger.exception(
            "Could not check prior landlord_payment notice for unit %s", unit_id
        )
        return False


def _owner_id_for_unit(db, unit_id: str) -> str | None:
    rows = (
        db.table("units")
        .select("properties(owner_id)")
        .eq("id", unit_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    property_row = rows[0].get("properties") or {}
    if isinstance(property_row, list):
        property_row = property_row[0] if property_row else {}
    owner_id = property_row.get("owner_id")
    return str(owner_id) if owner_id else None


def _require_owned_unit(user: AuthedUser, unit_id: str) -> None:
    """404/403 unless the user may log money on this unit (owner or staff grant)."""
    from lib.access import (
        PERM_MONEY,
        PERM_MONEY_LOG_CASH,
        require_unit_access,
    )

    ctx = require_unit_access(user.id, str(unit_id))
    if not (ctx.has(PERM_MONEY) or ctx.has(PERM_MONEY_LOG_CASH)):
        raise HTTPException(status_code=403, detail="Missing permission: money")


def _unit_access_role(user: AuthedUser, unit_id: str) -> str:
    """
    Return 'landlord' or 'tenant' if the user may act on this unit's payments.
    Staff with money grants count as landlord (acting for the owner);
    audit_events records the staff actor separately.
    """
    owned = (
        user.db.table("units")
        .select("id, properties!inner(owner_id)")
        .eq("id", unit_id)
        .eq("properties.owner_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if owned:
        return "landlord"

    from lib.access import PERM_MONEY, PERM_MONEY_LOG_CASH, require_unit_access
    from lib.db import create_service_client

    try:
        ctx = require_unit_access(user.id, str(unit_id))
        if ctx.has(PERM_MONEY) or ctx.has(PERM_MONEY_LOG_CASH):
            return "landlord"
    except HTTPException:
        pass

    svc = create_service_client()
    linked = (
        svc.table("tenancies")
        .select("id")
        .eq("unit_id", unit_id)
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
        or []
    )
    if linked:
        return "tenant"
    raise HTTPException(status_code=404, detail="Unit not found")


def deliver_payment_receipt(db, transaction: dict) -> str | None:
    """
    Generate + upload a PDF receipt, notify the tenant on the landlord's
    preferred channel, email the landlord a payment notice, and log a
    receipt reminder.
    Returns the public receipt URL, or None if delivery could not complete.
    Payment success must not fail because of receipt/notify errors.
    """
    txn_id = transaction.get("id")
    unit_id = transaction.get("unit_id")
    if not txn_id or not unit_id:
        return None

    channel = "sms"

    try:
        context = _load_unit_context(db, unit_id)
        if not context:
            logger.warning("Receipt skipped: unit %s not found", unit_id)
            return None
        unit, property_name, owner_id = context
        business_name = _business_name_for_owner(db, owner_id)
        unit_label = unit.get("label")
        channel = get_owner_notification_channel(db, owner_id)

        # Landlord notice is independent of PDF/tenant delivery; never blocks paid.
        # Skip re-send if a successful landlord_payment notice already logged
        # for this payment (Paystack confirm/webhook can re-enter after PDF fail).
        if _landlord_payment_notice_already_sent(
            db, str(unit_id), transaction.get("paid_at")
        ):
            landlord_result_status = "sent"
            landlord_detail = None
        else:
            landlord_result = notify_landlord_payment_received(
                owner_id,
                amount=transaction.get("amount"),
                unit_label=unit_label,
                property_name=property_name,
                tenant_name=unit.get("tenant_name"),
                unit_id=str(unit_id),
            )
            # Tests may monkeypatch a plain status string.
            if isinstance(landlord_result, str):
                landlord_result_status = landlord_result
                landlord_detail = landlord_payment_notice_detail(landlord_result_status)
            else:
                landlord_result_status = landlord_result.status
                landlord_detail = (
                    landlord_result.detail
                    or landlord_payment_notice_detail(landlord_result.status)
                )
            try:
                _log_landlord_payment_notice(
                    db,
                    unit_id,
                    landlord_result_status,
                    error_detail=landlord_detail,
                )
            except Exception:
                logger.exception(
                    "Failed to log landlord payment notice for unit %s", unit_id
                )

        receipt_payload = {
            **transaction,
            "tenant_name": unit.get("tenant_name"),
            "unit_label": unit_label,
            "property_name": property_name,
            "business_name": business_name,
        }
        pdf_bytes = generate_receipt(receipt_payload)
        receipt_url = upload_receipt(str(txn_id), pdf_bytes)

        contact = (unit.get("tenant_contact") or "").strip()
        reminder_status = "sent"
        receipt_error: str | None = None
        if not contact:
            reminder_status = "failed"
            receipt_error = "Unit has no tenant contact"
            logger.warning(
                "Receipt uploaded for %s but unit has no tenant_contact", txn_id
            )
        else:
            try:
                from lib.email_templates import tenant_receipt

                receipt_mail = tenant_receipt(
                    amount=transaction.get("amount"),
                    property_name=property_name,
                    unit_label=unit_label,
                    receipt_url=receipt_url,
                    business_name=business_name,
                )
                channel = send_notification(
                    channel,
                    contact,
                    receipt_mail.text,
                    email_subject=receipt_mail.subject,
                    email_html=receipt_mail.html,
                )
            except Exception as exc:
                reminder_status = "failed"
                receipt_error = str(exc).strip() or f"Failed to send {channel} receipt"
                logger.exception("%s receipt send failed for %s", channel, txn_id)

        try:
            _log_receipt_reminder(
                db, unit_id, reminder_status, channel, error_detail=receipt_error
            )
        except Exception:
            logger.exception("Failed to log receipt reminder for %s", txn_id)

        return receipt_url
    except Exception as exc:
        logger.exception("Receipt delivery failed for transaction %s", txn_id)
        try:
            _log_receipt_reminder(
                db,
                unit_id,
                "failed",
                channel,
                error_detail=str(exc).strip() or "Receipt delivery failed",
            )
        except Exception:
            logger.exception("Failed to log failed receipt reminder for %s", txn_id)
        return None


def _flatten_portfolio_payment(row: dict) -> dict:
    """Shape a joined transaction row for the portfolio money-in feed."""
    unit = row.get("units") or {}
    if isinstance(unit, list):
        unit = unit[0] if unit else {}
    property_row = unit.get("properties") or {}
    if isinstance(property_row, list):
        property_row = property_row[0] if property_row else {}
    return {
        "id": row.get("id"),
        "unit_id": row.get("unit_id"),
        "amount": row.get("amount"),
        "status": row.get("status"),
        "method": row.get("method"),
        "paid_at": row.get("paid_at"),
        "receipt_url": row.get("receipt_url"),
        "payment_reference": row.get("payment_reference"),
        "charge_type": row.get("charge_type") or "rent",
        "charge_label": row.get("charge_label"),
        "created_at": row.get("created_at"),
        "property_name": property_row.get("name") or "",
        "unit_label": unit.get("label") or "",
        "tenant_name": (unit.get("tenant_name") or "").strip(),
    }


@router.get("/")
def portfolio_money_in(
    user: AuthedUser = Depends(get_current_user),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=50),
    x_portfolio_owner_id: str | None = Header(
        default=None, alias="X-Portfolio-Owner-Id"
    ),
):
    """
    Lightweight portfolio money-in feed: paid transactions across the active
    portfolio (owner self or staff with X-Portfolio-Owner-Id).
    """
    from lib.access import (
        accessible_property_ids_for_portfolio,
        resolve_portfolio,
    )
    from lib.db import create_service_client

    portfolio_owner_id = (x_portfolio_owner_id or "").strip() or None
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    db = user.db if ctx.role == "owner" else create_service_client()
    property_ids = accessible_property_ids_for_portfolio(ctx)
    if not property_ids:
        return {"items": [], "next_cursor": None}

    unit_rows = (
        db.table("units")
        .select("id, properties!inner(owner_id)")
        .in_("property_id", property_ids)
        .eq("properties.owner_id", ctx.owner_id)
        .limit(2000)
        .execute()
        .data
        or []
    )
    unit_ids = [str(r["id"]) for r in unit_rows if r.get("id")]
    if not unit_ids:
        return {"items": [], "next_cursor": None}

    size = page_size(limit)
    query = (
        db.table("transactions")
        .select(
            "id, unit_id, amount, status, method, paid_at, receipt_url, "
            "payment_reference, charge_type, charge_label, created_at, "
            "units!inner(id, label, tenant_name, "
            "properties!inner(id, name, owner_id))"
        )
        .eq("status", "paid")
        .in_("unit_id", unit_ids)
        .order("created_at", desc=True)
        .order("id", desc=True)
    )
    query = apply_desc_cursor(query, cursor, column="created_at")
    rows = query.limit(size + 1).execute().data or []
    page, next_cursor = paginate_desc(rows, size, column="created_at")
    items = [_flatten_portfolio_payment(dict(row)) for row in page]
    return {"items": items, "next_cursor": next_cursor}


@router.get("/unit/{unit_id}")
def payment_history(
    unit_id: str,
    user: AuthedUser = Depends(get_current_user),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=50),
):
    role = _unit_access_role(user, unit_id)
    size = page_size(limit)
    if role == "tenant":
        from lib.db import create_service_client

        svc = create_service_client()
        query = (
            svc.table("transactions")
            .select("*")
            .eq("unit_id", unit_id)
            .order("created_at", desc=True)
            .order("id", desc=True)
        )
    else:
        query = (
            user.db.table("transactions")
            .select("*")
            .eq("unit_id", unit_id)
            .order("created_at", desc=True)
            .order("id", desc=True)
        )
    query = apply_desc_cursor(query, cursor, column="created_at")
    rows = query.limit(size + 1).execute().data or []
    items, next_cursor = paginate_desc(rows, size, column="created_at")
    return {"items": items, "next_cursor": next_cursor}


@router.post("/manual")
def record_manual_payment(payload: dict, user: AuthedUser = Depends(get_current_user)):
    unit_id = payload.get("unit_id")
    amount = payload.get("amount")
    if not unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_id is required",
        )
    if amount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="amount is required",
        )

    from lib.access import PERM_MONEY, require_unit_access
    from lib.audit import record_audit
    from lib.db import create_service_client

    ctx = require_unit_access(user.id, str(unit_id))
    # Caretakers: log cash only (manual). Full money required for non-cash paths elsewhere.
    if not (ctx.has(PERM_MONEY) or ctx.has("money_log_cash")):
        raise HTTPException(status_code=403, detail="Missing permission: money")

    charge_type, charge_label = _normalize_charge_fields(payload)

    reference = (payload.get("payment_reference") or payload.get("reference") or "").strip()
    row = {
        "unit_id": unit_id,
        "amount": amount,
        "method": "manual",
        "status": "paid",
        "paid_at": payload.get("paid_at")
        or datetime.now(timezone.utc).isoformat(),
        "charge_type": charge_type,
        "initiated_by": "landlord",
        "initiator_user_id": user.id,
    }
    if charge_label:
        row["charge_label"] = charge_label
    if reference:
        row["payment_reference"] = reference

    db = user.db if ctx.role == "owner" else create_service_client()
    inserted = db.table("transactions").insert(row).execute().data
    txn = _first_row(inserted)
    if txn and txn.get("status") == "paid":
        receipt_url = deliver_payment_receipt(db, txn)
        if receipt_url and isinstance(inserted, list) and inserted:
            inserted[0]["receipt_url"] = receipt_url
        _post_paid_to_chat(db, txn, receipt_url)
    record_audit(
        ctx,
        action="payment.manual",
        target_type="unit",
        target_id=str(unit_id),
        metadata={"amount": amount, "charge_type": charge_type},
    )
    return inserted


@router.post("/paystack/pending")
def create_pending_paystack_payment(
    payload: dict, user: AuthedUser = Depends(get_current_user)
):
    """Create a pending transaction before opening Paystack checkout."""
    unit_id = payload.get("unit_id")
    amount = payload.get("amount")
    if not unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_id is required",
        )
    if amount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="amount is required",
        )

    role = _unit_access_role(user, str(unit_id))
    charge_type, charge_label = _normalize_charge_fields(payload)

    insert_row = {
        "unit_id": unit_id,
        "amount": amount,
        "method": "paystack",
        "status": "pending",
        "charge_type": charge_type,
        "initiated_by": role,
        "initiator_user_id": user.id,
    }
    if charge_label:
        insert_row["charge_label"] = charge_label

    from lib.access import PERM_MONEY, require_unit_access
    from lib.db import create_service_client

    # Owner uses RLS client; tenant/staff use service role after ACL.
    use_service = role == "tenant"
    if role == "landlord":
        try:
            ctx = require_unit_access(user.id, str(unit_id))
            if ctx.role != "owner":
                ctx.require(PERM_MONEY)
                use_service = True
        except HTTPException:
            use_service = False

    if use_service:
        inserted = (
            create_service_client()
            .table("transactions")
            .insert(insert_row)
            .execute()
            .data
        )
    else:
        inserted = (
            user.db.table("transactions")
            .insert(insert_row)
            .execute()
            .data
        )
    txn = _first_row(inserted)
    if not txn:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create pending payment",
        )
    return inserted


@router.post("/paystack/confirm")
def confirm_paystack_payment(
    payload: dict, user: AuthedUser = Depends(get_current_user)
):
    """Verify a Paystack reference and mark the pending transaction paid."""
    reference = (payload.get("reference") or "").strip()
    unit_id = payload.get("unit_id")
    transaction_id = (payload.get("transaction_id") or "").strip() or None
    if not unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_id is required",
        )

    role = _unit_access_role(user, str(unit_id))
    from lib.db import create_service_client

    db = create_service_client() if role == "tenant" else user.db

    data = verify_transaction(reference)
    amount = (data.get("amount") or 0) / 100  # kobo -> naira
    metadata = data.get("metadata") or {}
    transaction_id = transaction_id or metadata.get("transaction_id")

    update = {
        "status": "paid",
        "paid_at": data.get("paid_at") or datetime.now(timezone.utc).isoformat(),
        "method": "paystack",
        "amount": amount,
    }
    if reference:
        update["payment_reference"] = reference

    txn: dict | None = None
    result = None

    if transaction_id:
        result = (
            db.table("transactions")
            .update(update)
            .eq("id", transaction_id)
            .eq("unit_id", unit_id)
            .execute()
            .data
        )
        txn = _first_row(result)

    if not txn:
        row = {
            "unit_id": unit_id,
            **update,
            "initiated_by": role,
            "initiator_user_id": user.id,
        }
        result = db.table("transactions").insert(row).execute().data
        txn = _first_row(result)

    if txn and txn.get("status") == "paid":
        existing_url = (txn.get("receipt_url") or "").strip()
        receipt_url = existing_url if existing_url.startswith("http") else None
        if not receipt_url:
            receipt_url = deliver_payment_receipt(db, txn)
            if receipt_url and isinstance(result, list) and result:
                result[0]["receipt_url"] = receipt_url
        _post_paid_to_chat(db, txn, receipt_url)

    return result


@router.post("/webhook/paystack")
async def paystack_webhook(request: Request):
    body = await request.body()
    verify_webhook_signature(request.headers, body)
    event = json.loads(body)
    if event.get("event") == "charge.success":
        data = event.get("data") or {}
        metadata = data.get("metadata") or {}
        transaction_id = metadata.get("transaction_id")
        if transaction_id:
            db = create_service_client()
            paystack_ref = (data.get("reference") or "").strip()
            update_row = {
                "status": "paid",
                "paid_at": data.get("paid_at")
                or datetime.now(timezone.utc).isoformat(),
                "method": "paystack",
            }
            if paystack_ref:
                update_row["payment_reference"] = paystack_ref
            updated = (
                db.table("transactions")
                .update(update_row)
                .eq("id", transaction_id)
                .execute()
                .data
            )
            txn = _first_row(updated)
            if not txn:
                fetched = (
                    db.table("transactions")
                    .select("*")
                    .eq("id", transaction_id)
                    .limit(1)
                    .execute()
                    .data
                )
                txn = _first_row(fetched)
            if txn and txn.get("status") == "paid":
                # Avoid duplicate receipt WhatsApps if confirm already delivered
                existing_url = (txn.get("receipt_url") or "").strip()
                receipt_url = existing_url if existing_url.startswith("http") else None
                if not receipt_url:
                    receipt_url = deliver_payment_receipt(db, txn)
                _post_paid_to_chat(db, txn, receipt_url)
    return {"status": "ok"}
