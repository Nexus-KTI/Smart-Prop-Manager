import os
import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from lib.auth import AuthedUser, get_current_user
from lib.notification_prefs import (
    is_prefs_opt_out_error,
    load_tenant_prefs_for_unit,
)
from lib.notify import (
    contact_matches_channel,
    get_owner_notification_channel,
)
from lib.pagination import apply_desc_cursor, page_size, paginate_desc
from lib.reminder_job import run_reminder_jobs

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _clip_detail(detail: str | None, limit: int = 180) -> str | None:
    text = (detail or "").strip()
    if not text:
        return None
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def _tenant_prefs_kwargs(db, *, unit_id: str, owner_id: str, event: str) -> dict:
    prefs = load_tenant_prefs_for_unit(
        db, unit_id=str(unit_id), landlord_id=str(owner_id)
    )
    if prefs is None:
        return {}
    return {"event": event, "notification_prefs": prefs}


def _queue_tenant_notice(
    db,
    *,
    idempotency_key: str,
    channel: str | None,
    contact: str,
    message: str,
    email_subject: str,
    email_html: str | None = None,
    event: str | None = None,
    notification_prefs: Any = None,
    reminder_log: dict | None = None,
    flush: bool = True,
) -> dict:
    """Enqueue durable delivery and best-effort flush for interactive chase."""
    from lib.delivery_outbox import enqueue_notification, flush_delivery_outbox

    queued = enqueue_notification(
        db,
        idempotency_key=idempotency_key,
        channel=channel,
        contact=contact,
        message=message,
        email_subject=email_subject,
        email_html=email_html,
        event=event,
        notification_prefs=notification_prefs,
        reminder_log=reminder_log,
    )
    if flush:
        flush_delivery_outbox(db=db, batch_size=10)
    return queued


def _insert_reminder(
    db,
    *,
    unit_id: str,
    channel: str,
    kind: str,
    reminder_status: str,
    error_detail: str | None = None,
):
    row = {
        "unit_id": unit_id,
        "channel": channel,
        "kind": kind,
        "status": reminder_status,
    }
    detail = _clip_detail(error_detail)
    if detail:
        row["error_detail"] = detail
    return db.table("reminders").insert(row).execute().data


def _default_message(
    property_name: str,
    unit_label: str,
    rent_amount,
    business_name: str | None,
) -> str:
    from lib.email_templates import tenant_due

    return tenant_due(
        amount=rent_amount,
        property_name=property_name,
        unit_label=unit_label,
        business_name=business_name,
    ).text


def _business_name_for_owner(db, owner_id: str) -> str | None:
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


def _business_name(user: AuthedUser) -> str | None:
    return _business_name_for_owner(user.db, user.id)


@router.get("/unit/{unit_id}")
def reminder_log(
    unit_id: str,
    user: AuthedUser = Depends(get_current_user),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=50),
):
    from lib.access import PERM_CHASE, require_unit_access
    from lib.db import create_service_client

    ctx = require_unit_access(user.id, str(unit_id), permission=PERM_CHASE)
    db = user.db if ctx.role == "owner" else create_service_client()
    size = page_size(limit)
    query = (
        db.table("reminders")
        .select("*")
        .eq("unit_id", unit_id)
        .order("sent_at", desc=True)
        .order("id", desc=True)
    )
    query = apply_desc_cursor(query, cursor, column="sent_at")
    rows = query.limit(size + 1).execute().data or []
    items, next_cursor = paginate_desc(rows, size, column="sent_at")
    return {"items": items, "next_cursor": next_cursor}


@router.post("/send")
def send_reminder(payload: dict, user: AuthedUser = Depends(get_current_user)):
    unit_id = payload.get("unit_id")
    contact = (payload.get("contact") or "").strip()
    message = (payload.get("message") or "").strip()

    if not unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_id is required",
        )
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="contact is required",
        )
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="message is required",
        )

    from lib.access import PERM_CHASE, require_unit_access
    from lib.audit import record_audit
    from lib.db import create_service_client

    ctx = require_unit_access(user.id, str(unit_id), permission=PERM_CHASE)
    db = user.db if ctx.role == "owner" else create_service_client()

    # Notify using the portfolio owner's channel preference.
    channel = get_owner_notification_channel(db, ctx.owner_id)

    from lib.email_templates import tenant_due_subject

    unit_rows = (
        db.table("units")
        .select("label, properties!inner(name, owner_id)")
        .eq("id", unit_id)
        .eq("properties.owner_id", ctx.owner_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    email_subject = "Rent reminder"
    if unit_rows:
        unit_row = unit_rows[0]
        prop = unit_row.get("properties") or {}
        if isinstance(prop, list):
            prop = prop[0] if prop else {}
        email_subject = tenant_due_subject(
            prop.get("name"), unit_row.get("label")
        )

    try:
        prefs_kwargs = _tenant_prefs_kwargs(
            db, unit_id=str(unit_id), owner_id=str(ctx.owner_id), event="rent_due"
        )
        queued = _queue_tenant_notice(
            db,
            idempotency_key=f"manual-due:{unit_id}:{uuid.uuid4()}",
            channel=channel,
            contact=contact,
            message=message,
            email_subject=email_subject,
            reminder_log={
                "unit_id": unit_id,
                "channel": channel,
                "kind": "due",
            },
            **prefs_kwargs,
        )
        used_channel = queued.get("channel") or channel
        latest = (
            db.table("reminders")
            .select("*")
            .eq("unit_id", unit_id)
            .eq("kind", "due")
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if latest and latest[0].get("status") in {"sent", "failed", "skipped"}:
            if latest[0].get("status") == "failed":
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=latest[0].get("error_detail")
                    or f"Failed to send {used_channel} reminder",
                )
            if latest[0].get("status") == "skipped":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=latest[0].get("error_detail")
                    or "Tenant turned off rent reminders for this channel",
                )
            result = latest
            used_channel = latest[0].get("channel") or used_channel
        else:
            result = _insert_reminder(
                db,
                unit_id=unit_id,
                channel=used_channel,
                kind="due",
                reminder_status="queued",
            )
    except HTTPException:
        raise
    except Exception as exc:
        if is_prefs_opt_out_error(exc):
            error_detail = (
                "Tenant turned off rent reminders for this channel"
            )
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel=channel,
                kind="due",
                reminder_status="skipped",
                error_detail=error_detail,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_detail,
            ) from exc
        error_detail = str(exc).strip() or f"Failed to queue {channel} reminder"
        _insert_reminder(
            db,
            unit_id=unit_id,
            channel=channel,
            kind="due",
            reminder_status="failed",
            error_detail=error_detail,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=error_detail,
        ) from exc

    record_audit(
        ctx,
        action="reminder.send",
        target_type="unit",
        target_id=str(unit_id),
        metadata={"channel": used_channel},
    )
    return result


@router.post("/bulk")
def send_bulk_reminders(
    payload: dict, user: AuthedUser = Depends(get_current_user)
):
    from lib.access import PERM_CHASE, require_unit_access
    from lib.db import create_service_client

    unit_ids = payload.get("unit_ids") or []
    if not isinstance(unit_ids, list) or not unit_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_ids is required",
        )
    unit_ids = [str(u) for u in unit_ids if u][:50]
    svc = create_service_client()

    stats: dict = {
        "sent": 0,
        "failed": 0,
        "skipped": 0,
        "channel": None,
        "errors": [],
        "failed_unit_ids": [],
    }

    for unit_id in unit_ids:
        try:
            ctx = require_unit_access(user.id, unit_id, permission=PERM_CHASE)
        except HTTPException:
            stats["skipped"] += 1
            continue

        db = user.db if ctx.role == "owner" else svc
        channel = get_owner_notification_channel(db, ctx.owner_id)
        if not stats["channel"]:
            stats["channel"] = channel
        business = _business_name_for_owner(db, ctx.owner_id)

        rows = (
            db.table("units")
            .select(
                "id, label, rent_amount, tenant_contact, "
                "properties!inner(name, owner_id)"
            )
            .eq("id", unit_id)
            .eq("properties.owner_id", ctx.owner_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            stats["skipped"] += 1
            continue

        unit = rows[0]
        contact = (unit.get("tenant_contact") or "").strip()
        property_row = unit.get("properties") or {}
        if isinstance(property_row, list):
            property_row = property_row[0] if property_row else {}
        property_name = property_row.get("name") or "your property"
        unit_label = unit.get("label") or "unit"
        unit_key = f"{property_name} · {unit_label}"

        def _note_failure(detail: str) -> None:
            stats["failed"] += 1
            stats["failed_unit_ids"].append(unit_id)
            if len(stats["errors"]) < 20:
                stats["errors"].append(
                    {
                        "unit_id": unit_id,
                        "label": unit_key,
                        "detail": detail,
                    }
                )

        if not contact or not contact_matches_channel(channel, contact):
            # Mirror cron: persist failed row so landlord can Retry from unit log.
            if not contact:
                error_detail = "Unit has no tenant contact"
            else:
                error_detail = f"Tenant contact does not match {channel} channel"
            _note_failure(error_detail)
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel=channel,
                kind="due",
                reminder_status="failed",
                error_detail=error_detail,
            )
            continue

        from lib.email_templates import tenant_due

        due_mail = tenant_due(
            amount=unit.get("rent_amount") or 0,
            property_name=property_name,
            unit_label=unit_label,
            business_name=business,
        )
        message = due_mail.text
        error_detail = None
        try:
            prefs_kwargs = _tenant_prefs_kwargs(
                db,
                unit_id=unit_id,
                owner_id=str(ctx.owner_id),
                event="rent_due",
            )
            day_key = date.today().isoformat()
            queued = _queue_tenant_notice(
                db,
                idempotency_key=f"bulk-due:{unit_id}:{day_key}",
                channel=channel,
                contact=contact,
                message=message,
                email_subject=due_mail.subject,
                email_html=due_mail.html,
                reminder_log={
                    "unit_id": unit_id,
                    "channel": channel,
                    "kind": "due",
                },
                flush=False,
                **prefs_kwargs,
            )
            used = queued.get("channel") or channel
            reminder_status = "queued"
            stats["sent"] += 1
            # Outbox reminder_log writes the sent/failed row after flush.
            continue
        except Exception as exc:
            used = channel
            if is_prefs_opt_out_error(exc):
                reminder_status = "skipped"
                error_detail = "Tenant turned off rent reminders for this channel"
                stats["skipped"] += 1
                if len(stats["errors"]) < 20:
                    stats["errors"].append(
                        {
                            "unit_id": unit_id,
                            "label": unit_key,
                            "detail": error_detail,
                        }
                    )
            else:
                reminder_status = "failed"
                reason = getattr(exc, "msg", None) or str(exc)
                reason = str(reason).strip()
                if len(reason) > 180:
                    reason = reason[:177] + "…"
                error_detail = reason or "Queue failed"
                _note_failure(error_detail)

        _insert_reminder(
            db,
            unit_id=unit_id,
            channel=used,
            kind="due",
            reminder_status=reminder_status,
            error_detail=error_detail,
        )

    from lib.delivery_outbox import flush_delivery_outbox

    flush_delivery_outbox(db=svc, batch_size=min(50, max(10, len(unit_ids))))
    return stats


@router.post("/retry/{reminder_id}")
def retry_reminder(reminder_id: str, user: AuthedUser = Depends(get_current_user)):
    """
    Retry a failed reminder/receipt/landlord-notice row.
    Inserts a new log entry; never blocks on prior row state beyond ownership checks.
    """
    from lib.access import PERM_CHASE, require_unit_access
    from lib.db import create_service_client

    svc = create_service_client()
    rows = (
        svc.table("reminders")
        .select(
            "*, units!inner(id, label, rent_amount, tenant_contact, tenant_name, "
            "property_id, properties!inner(id, name, owner_id))"
        )
        .eq("id", reminder_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Reminder not found")

    reminder = rows[0]
    if reminder.get("status") not in {"failed", "skipped"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only failed or skipped notices can be retried",
        )

    unit = reminder.get("units") or {}
    if isinstance(unit, list):
        unit = unit[0] if unit else {}
    property_row = unit.get("properties") or {}
    if isinstance(property_row, list):
        property_row = property_row[0] if property_row else {}

    unit_id = reminder.get("unit_id") or unit.get("id")
    if not unit_id:
        raise HTTPException(status_code=404, detail="Reminder not found")

    ctx = require_unit_access(user.id, str(unit_id), permission=PERM_CHASE)
    db = user.db if ctx.role == "owner" else svc
    owner_id = ctx.owner_id
    kind = reminder.get("kind") or "due"
    channel = get_owner_notification_channel(db, owner_id)
    property_name = property_row.get("name") or "your property"
    unit_label = unit.get("label") or "unit"
    business = _business_name_for_owner(db, owner_id)

    if kind == "landlord_payment":
        from lib.email_templates import landlord_money_in
        from lib.notify import email_transport_configured, get_owner_email

        amount = 0
        paid_rows = (
            db.table("transactions")
            .select("amount")
            .eq("unit_id", unit_id)
            .eq("status", "paid")
            .order("paid_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if paid_rows:
            amount = paid_rows[0].get("amount") or 0
        email = get_owner_email(owner_id)
        if not email:
            detail = "No email on landlord profile"
            inserted = _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="landlord_payment",
                reminder_status="skipped",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )
        content = landlord_money_in(
            amount=amount,
            tenant_name=(unit.get("tenant_name") or None),
            property_name=property_name,
            unit_label=unit_label,
            unit_id=str(unit_id),
        )
        try:
            _queue_tenant_notice(
                db,
                idempotency_key=f"retry-landlord-payment:{reminder_id}:{uuid.uuid4()}",
                channel="email",
                contact=email,
                message=content.text,
                email_subject=content.subject,
                email_html=content.html,
                reminder_log={
                    "unit_id": unit_id,
                    "channel": "email",
                    "kind": "landlord_payment",
                },
            )
            latest = (
                db.table("reminders")
                .select("*")
                .eq("unit_id", unit_id)
                .eq("kind", "landlord_payment")
                .order("sent_at", desc=True)
                .limit(1)
                .execute()
                .data
                or []
            )
            if latest and latest[0].get("status") in {"sent", "failed", "skipped"}:
                if latest[0].get("status") != "sent":
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=latest[0].get("error_detail")
                        or "Could not send landlord notice",
                    )
                return latest
            return _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="landlord_payment",
                reminder_status="queued",
            )
        except HTTPException:
            raise
        except Exception as exc:
            detail = str(exc).strip() or "Could not queue landlord notice"
            if not email_transport_configured():
                detail = "Email not configured (set MAILGUN_* or SMTP_HOST/SMTP_FROM)"
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="landlord_payment",
                reminder_status="failed",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from exc

    if kind == "receipt":
        paid = (
            db.table("transactions")
            .select("*")
            .eq("unit_id", unit_id)
            .eq("status", "paid")
            .order("paid_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not paid:
            detail = "No paid transaction to resend a receipt for"
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel=channel,
                kind="receipt",
                reminder_status="failed",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )

        txn = paid[0]
        existing_url = (txn.get("receipt_url") or "").strip()
        if existing_url.startswith("http"):
            contact = (unit.get("tenant_contact") or "").strip()
            if not contact:
                detail = "Unit has no tenant contact"
                _insert_reminder(
                    db,
                    unit_id=unit_id,
                    channel=channel,
                    kind="receipt",
                    reminder_status="failed",
                    error_detail=detail,
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=detail,
                )
            try:
                from lib.email_templates import tenant_receipt

                receipt_mail = tenant_receipt(
                    amount=txn.get("amount"),
                    property_name=property_name,
                    unit_label=unit_label,
                    receipt_url=existing_url,
                    business_name=business,
                )
                prefs_kwargs = _tenant_prefs_kwargs(
                    db,
                    unit_id=unit_id,
                    owner_id=str(ctx.owner_id),
                    event="payment_receipt",
                )
                queued = _queue_tenant_notice(
                    db,
                    idempotency_key=f"retry-receipt:{reminder_id}:{uuid.uuid4()}",
                    channel=channel,
                    contact=contact,
                    message=receipt_mail.text,
                    email_subject=receipt_mail.subject,
                    email_html=receipt_mail.html,
                    reminder_log={
                        "unit_id": unit_id,
                        "channel": channel,
                        "kind": "receipt",
                    },
                    **prefs_kwargs,
                )
                used = queued.get("channel") or channel
                latest = (
                    db.table("reminders")
                    .select("*")
                    .eq("unit_id", unit_id)
                    .eq("kind", "receipt")
                    .order("sent_at", desc=True)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if latest and latest[0].get("status") in {"sent", "failed", "skipped"}:
                    if latest[0].get("status") != "sent":
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=latest[0].get("error_detail")
                            or f"Failed to send {used} receipt",
                        )
                    return latest
                return _insert_reminder(
                    db,
                    unit_id=unit_id,
                    channel=used,
                    kind="receipt",
                    reminder_status="queued",
                )
            except HTTPException:
                raise
            except Exception as exc:
                detail = str(exc).strip() or f"Failed to queue {channel} receipt"
                _insert_reminder(
                    db,
                    unit_id=unit_id,
                    channel=channel,
                    kind="receipt",
                    reminder_status="failed",
                    error_detail=detail,
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=detail,
                ) from exc

        # No public receipt yet — queue full delivery (outbox logs reminder rows).
        from lib.delivery_outbox import enqueue_payment_receipt, flush_delivery_outbox

        try:
            enqueue_payment_receipt(db, str(txn["id"]))
            flush_delivery_outbox(db=db, batch_size=5)
        except Exception as exc:
            detail = str(exc).strip() or "Could not queue receipt regeneration"
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel=channel,
                kind="receipt",
                reminder_status="failed",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from exc
        latest = (
            db.table("reminders")
            .select("*")
            .eq("unit_id", unit_id)
            .eq("kind", "receipt")
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not latest:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Receipt queued; delivery still pending",
            )
        return latest

    # kind == due (default) — fall through below after renewal branch
    if kind == "renewal":
        from lib.email_templates import landlord_renewal
        from lib.notify import get_owner_email

        term_rows = (
            db.table("units")
            .select("term_end, tenant_name")
            .eq("id", unit_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        term_end_raw = term_rows[0].get("term_end") if term_rows else None
        tenant_name = (
            (term_rows[0].get("tenant_name") if term_rows else None)
            or unit.get("tenant_name")
        )
        from lib.reminder_job import _parse_term_end, _today_lagos

        term_end = _parse_term_end(term_end_raw)
        if term_end is None:
            detail = "Unit has no term end date"
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="renewal",
                reminder_status="failed",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )
        email = get_owner_email(owner_id)
        if not email:
            detail = "No email on landlord profile"
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="renewal",
                reminder_status="skipped",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )
        days_left = (term_end - _today_lagos()).days
        content = landlord_renewal(
            property_name=property_name,
            unit_label=unit_label,
            term_end=term_end,
            days_left=days_left,
            tenant_name=tenant_name,
            unit_id=str(unit_id),
        )
        try:
            _queue_tenant_notice(
                db,
                idempotency_key=f"retry-renewal:{reminder_id}:{uuid.uuid4()}",
                channel="email",
                contact=email,
                message=content.text,
                email_subject=content.subject,
                email_html=content.html,
                reminder_log={
                    "unit_id": unit_id,
                    "channel": "email",
                    "kind": "renewal",
                },
            )
            latest = (
                db.table("reminders")
                .select("*")
                .eq("unit_id", unit_id)
                .eq("kind", "renewal")
                .order("sent_at", desc=True)
                .limit(1)
                .execute()
                .data
                or []
            )
            if latest and latest[0].get("status") in {"sent", "failed", "skipped"}:
                if latest[0].get("status") != "sent":
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=latest[0].get("error_detail")
                        or "Failed to send renewal email",
                    )
                return latest
            return _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="renewal",
                reminder_status="queued",
            )
        except HTTPException:
            raise
        except Exception as exc:
            detail = str(exc).strip() or "Failed to queue renewal email"
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="renewal",
                reminder_status="failed",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from exc

    # kind == due (default)
    contact = (unit.get("tenant_contact") or "").strip()
    if not contact:
        detail = "Unit has no tenant contact"
        _insert_reminder(
            db,
            unit_id=unit_id,
            channel=channel,
            kind="due",
            reminder_status="failed",
            error_detail=detail,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )
    if not contact_matches_channel(channel, contact):
        detail = f"Tenant contact does not match {channel} channel"
        _insert_reminder(
            db,
            unit_id=unit_id,
            channel=channel,
            kind="due",
            reminder_status="failed",
            error_detail=detail,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    from lib.email_templates import tenant_due

    due_mail = tenant_due(
        amount=unit.get("rent_amount") or 0,
        property_name=property_name,
        unit_label=unit_label,
        business_name=business,
    )
    try:
        prefs_kwargs = _tenant_prefs_kwargs(
            db, unit_id=unit_id, owner_id=str(ctx.owner_id), event="rent_due"
        )
        queued = _queue_tenant_notice(
            db,
            idempotency_key=f"retry-due:{reminder_id}:{uuid.uuid4()}",
            channel=channel,
            contact=contact,
            message=due_mail.text,
            email_subject=due_mail.subject,
            email_html=due_mail.html,
            reminder_log={
                "unit_id": unit_id,
                "channel": channel,
                "kind": "due",
            },
            **prefs_kwargs,
        )
        used = queued.get("channel") or channel
        latest = (
            db.table("reminders")
            .select("*")
            .eq("unit_id", unit_id)
            .eq("kind", "due")
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if latest and latest[0].get("status") in {"sent", "failed", "skipped"}:
            if latest[0].get("status") == "skipped":
                detail = latest[0].get("error_detail") or (
                    "Tenant turned off rent reminders for this channel"
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=detail,
                )
            if latest[0].get("status") == "failed":
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=latest[0].get("error_detail")
                    or f"Failed to send {used} reminder",
                )
            return latest
        return _insert_reminder(
            db,
            unit_id=unit_id,
            channel=used,
            kind="due",
            reminder_status="queued",
        )
    except HTTPException:
        raise
    except Exception as exc:
        if is_prefs_opt_out_error(exc):
            detail = "Tenant turned off rent reminders for this channel"
            _insert_reminder(
                db,
                unit_id=unit_id,
                channel=channel,
                kind="due",
                reminder_status="skipped",
                error_detail=detail,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            ) from exc
        detail = str(exc).strip() or f"Failed to queue {channel} reminder"
        _insert_reminder(
            db,
            unit_id=unit_id,
            channel=channel,
            kind="due",
            reminder_status="failed",
            error_detail=detail,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc


@router.get("/actions")
def urgent_actions_queue(
    user: AuthedUser = Depends(get_current_user),
    x_portfolio_owner_id: str | None = Header(
        default=None, alias="X-Portfolio-Owner-Id"
    ),
):
    """Action Needed queue: overdue chase, lease ending, failed sends."""
    from lib.access import (
        PERM_CHASE,
        accessible_property_ids_for_portfolio,
        resolve_portfolio,
    )
    from lib.db import create_service_client
    from lib.urgent_actions import collect_urgent_actions_for_owner

    portfolio_owner_id = (x_portfolio_owner_id or "").strip() or None
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    ctx.require(PERM_CHASE)

    empty_summary = {
        "urgent": 0,
        "overdue": 0,
        "lease_ending": 0,
        "failed": 0,
        "due_soon": 0,
    }
    property_ids = accessible_property_ids_for_portfolio(ctx)
    if not property_ids:
        return {"items": [], "summary": empty_summary}

    db = user.db if ctx.role == "owner" else create_service_client()
    items, summary = collect_urgent_actions_for_owner(
        db,
        owner_id=str(ctx.owner_id),
        property_ids=property_ids,
    )
    return {"items": items, "summary": summary}


@router.post("/jobs/due")
def run_due_reminder_job(
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
):
    """
    Cron entrypoint for scheduled due reminders.
    Auth with CRON_SECRET via Authorization: Bearer <secret> or X-Cron-Secret.
    """
    secret = (os.getenv("CRON_SECRET") or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRON_SECRET is not configured",
        )

    provided = (x_cron_secret or "").strip()
    if not provided and authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()

    if not provided or provided != secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid cron secret",
        )

    return run_reminder_jobs()
