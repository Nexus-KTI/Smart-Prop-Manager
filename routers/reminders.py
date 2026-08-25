import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from lib.auth import AuthedUser, get_current_user
from lib.notify import (
    contact_matches_channel,
    get_owner_notification_channel,
    landlord_payment_notice_detail,
    notify_landlord_payment_received,
    send_notification,
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
        used_channel = send_notification(
            channel,
            contact,
            message,
            email_subject=email_subject,
        )
        reminder_status = "sent"
        error_detail = None
    except Exception as exc:
        reminder_status = "failed"
        error_detail = str(exc).strip() or f"Failed to send {channel} reminder"
        _insert_reminder(
            db,
            unit_id=unit_id,
            channel=channel,
            kind="due",
            reminder_status=reminder_status,
            error_detail=error_detail,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=error_detail,
        )

    result = _insert_reminder(
        db,
        unit_id=unit_id,
        channel=used_channel,
        kind="due",
        reminder_status=reminder_status,
        error_detail=error_detail,
    )
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
            used = send_notification(
                channel,
                contact,
                message,
                email_subject=due_mail.subject,
                email_html=due_mail.html,
            )
            reminder_status = "sent"
            stats["sent"] += 1
        except Exception as exc:
            used = channel
            reminder_status = "failed"
            reason = getattr(exc, "msg", None) or str(exc)
            reason = str(reason).strip()
            if len(reason) > 180:
                reason = reason[:177] + "…"
            error_detail = reason or "Send failed"
            _note_failure(error_detail)

        _insert_reminder(
            db,
            unit_id=unit_id,
            channel=used,
            kind="due",
            reminder_status=reminder_status,
            error_detail=error_detail,
        )

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
        notify_result = notify_landlord_payment_received(
            owner_id,
            amount=amount,
            unit_label=unit_label,
            property_name=property_name,
            tenant_name=(unit.get("tenant_name") or None),
            unit_id=str(unit_id),
        )
        if isinstance(notify_result, str):
            notify_status = notify_result
            detail = landlord_payment_notice_detail(notify_status)
        else:
            notify_status = notify_result.status
            detail = notify_result.detail or landlord_payment_notice_detail(notify_status)
        inserted = _insert_reminder(
            db,
            unit_id=unit_id,
            channel="email",
            kind="landlord_payment",
            reminder_status=notify_status,
            error_detail=detail,
        )
        if notify_status != "sent":
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail or "Could not send landlord notice",
            )
        return inserted

    if kind == "receipt":
        from routers.payments import deliver_payment_receipt

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
                used = send_notification(
                    channel,
                    contact,
                    receipt_mail.text,
                    email_subject=receipt_mail.subject,
                    email_html=receipt_mail.html,
                )
                return _insert_reminder(
                    db,
                    unit_id=unit_id,
                    channel=used,
                    kind="receipt",
                    reminder_status="sent",
                )
            except Exception as exc:
                detail = str(exc).strip() or f"Failed to send {channel} receipt"
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

        # No public receipt yet — run full delivery (logs its own reminder rows).
        receipt_url = deliver_payment_receipt(db, txn)
        if not receipt_url:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not regenerate receipt",
            )
        # deliver_payment_receipt already logged; return latest receipt row
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
        return latest

    # kind == due (default) — fall through below after renewal branch
    if kind == "renewal":
        from lib.email_templates import landlord_renewal
        from lib.notify import get_owner_email, send_email

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
            send_email(
                email,
                content.text,
                subject=content.subject,
                html=content.html,
            )
            return _insert_reminder(
                db,
                unit_id=unit_id,
                channel="email",
                kind="renewal",
                reminder_status="sent",
            )
        except Exception as exc:
            detail = str(exc).strip() or "Failed to send renewal email"
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
        used = send_notification(
            channel,
            contact,
            due_mail.text,
            email_subject=due_mail.subject,
            email_html=due_mail.html,
        )
        return _insert_reminder(
            db,
            unit_id=unit_id,
            channel=used,
            kind="due",
            reminder_status="sent",
        )
    except Exception as exc:
        detail = str(exc).strip() or f"Failed to send {channel} reminder"
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
