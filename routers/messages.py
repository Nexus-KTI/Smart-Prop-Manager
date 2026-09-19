"""TenantCloud-style messages hub: chat + maintenance threads."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client

router = APIRouter(prefix="/messages", tags=["messages"])

THREADS_LIST_LIMIT = 100
UNREAD_SCAN_PAGE = 200
UNREAD_SCAN_MAX = 2000


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _svc_or_user(user: AuthedUser):
    try:
        return create_service_client()
    except RuntimeError:
        return user.db


def _is_participant(thread: dict, user_id: str) -> bool:
    return thread.get("landlord_id") == user_id or thread.get("tenant_user_id") == user_id


def _load_thread(user: AuthedUser, thread_id: str) -> dict:
    rows = (
        user.db.table("message_threads")
        .select("*")
        .eq("id", thread_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        # Tenant RLS may hide; try service if participant
        svc = _svc_or_user(user)
        rows = (
            svc.table("message_threads")
            .select("*")
            .eq("id", thread_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    if not rows:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread = dict(rows[0])
    if not _is_participant(thread, user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return thread


def _unread_for_thread(user: AuthedUser, thread: dict) -> bool:
    last = thread.get("last_message_at")
    if not last:
        return False
    reads = (
        user.db.table("message_thread_reads")
        .select("last_read_at")
        .eq("thread_id", thread["id"])
        .eq("user_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not reads:
        return True
    return str(reads[0].get("last_read_at") or "") < str(last)


def ensure_maintenance_thread(
    *,
    landlord_id: str,
    tenant_user_id: str | None,
    unit_id: str | None,
    tenancy_id: str | None,
    maintenance_request_id: str,
    subject: str,
    db: Any,
) -> dict:
    """Idempotent: create MR thread if missing (service or user client)."""
    existing = (
        db.table("message_threads")
        .select("*")
        .eq("maintenance_request_id", maintenance_request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return dict(existing[0])
    row = {
        "kind": "maintenance",
        "landlord_id": landlord_id,
        "tenant_user_id": tenant_user_id,
        "unit_id": unit_id,
        "tenancy_id": tenancy_id,
        "maintenance_request_id": maintenance_request_id,
        "subject": (subject or "Maintenance")[:160],
        "last_message_at": None,
        "last_message_preview": None,
    }
    inserted = db.table("message_threads").insert(row).execute().data
    return _first_row(inserted) or row


def _peer_user_id(thread: dict, user_id: str) -> str | None:
    landlord_id = thread.get("landlord_id")
    tenant_id = thread.get("tenant_user_id")
    if user_id == landlord_id:
        return tenant_id
    if user_id == tenant_id:
        return landlord_id
    return None


def _peer_last_read_at(db: Any, thread: dict, user_id: str) -> str | None:
    peer_id = _peer_user_id(thread, user_id)
    if not peer_id:
        return None
    reads = (
        db.table("message_thread_reads")
        .select("last_read_at")
        .eq("thread_id", thread["id"])
        .eq("user_id", peer_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not reads:
        return None
    return reads[0].get("last_read_at")


def _charge_label_for_payment(transaction: dict) -> str:
    label = (transaction.get("charge_label") or "").strip()
    if label:
        return label
    charge = (transaction.get("charge_type") or "rent").strip().lower()
    if charge == "rent":
        return "Rent"
    if charge == "service_charge":
        return "Service charge"
    if charge == "deposit":
        return "Deposit"
    return charge.replace("_", " ").strip().title() or "Payment"


def _format_naira(amount: Any) -> str:
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return "₦0"
    return f"₦{value:,.0f}"


def post_payment_to_chat(db: Any, transaction: dict) -> dict | None:
    """
    Post a payment status line into an existing landlord↔tenant chat.
    Does not create a chat thread. Idempotent on transaction_id.
    Never raises to callers (payment success must not fail on chat).
    """
    try:
        txn_id = transaction.get("id")
        unit_id = transaction.get("unit_id")
        if not txn_id or not unit_id:
            return None

        unit_rows = (
            db.table("units")
            .select("id, properties(owner_id)")
            .eq("id", unit_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not unit_rows:
            return None
        unit = dict(unit_rows[0])
        prop = unit.get("properties") or {}
        if isinstance(prop, list):
            prop = prop[0] if prop else {}
        landlord_id = prop.get("owner_id") if isinstance(prop, dict) else None
        if not landlord_id:
            return None

        tenancy_rows = (
            db.table("tenancies")
            .select("id, tenant_user_id")
            .eq("unit_id", unit_id)
            .eq("landlord_id", landlord_id)
            .in_("status", ["active", "pending_verification"])
            .not_.is_("tenant_user_id", "null")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not tenancy_rows:
            return None
        tenancy = dict(tenancy_rows[0])
        tenant_user_id = tenancy.get("tenant_user_id")
        if not tenant_user_id:
            return None

        threads = (
            db.table("message_threads")
            .select("*")
            .eq("kind", "chat")
            .eq("landlord_id", landlord_id)
            .eq("tenant_user_id", tenant_user_id)
            .eq("unit_id", unit_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not threads:
            return None
        thread = dict(threads[0])
        thread_id = thread["id"]

        # Idempotency: skip if this payment already posted to the thread.
        existing = (
            db.table("messages")
            .select("id, meta")
            .eq("thread_id", thread_id)
            .eq("kind", "payment")
            .limit(50)
            .execute()
            .data
            or []
        )
        for row in existing:
            meta = row.get("meta") or {}
            if isinstance(meta, str):
                continue
            if str(meta.get("transaction_id") or "") == str(txn_id):
                return dict(row)

        status_val = (transaction.get("status") or "paid").strip().lower()
        status_label = "Paid" if status_val == "paid" else status_val.replace("_", " ").title()
        charge_label = _charge_label_for_payment(transaction)
        amount_txt = _format_naira(transaction.get("amount"))
        body = f"{charge_label} payment recorded · {amount_txt} · {status_label}"
        receipt_url = (transaction.get("receipt_url") or "").strip() or None
        meta = {
            "transaction_id": str(txn_id),
            "amount": transaction.get("amount"),
            "currency": transaction.get("currency") or "NGN",
            "status": status_val,
            "charge_type": transaction.get("charge_type") or "rent",
            "charge_label": charge_label,
            "receipt_url": receipt_url,
        }

        sender_id = (
            transaction.get("initiator_user_id")
            or landlord_id
        )
        now = _now()
        inserted = (
            db.table("messages")
            .insert(
                {
                    "thread_id": thread_id,
                    "sender_id": sender_id,
                    "body": body,
                    "kind": "payment",
                    "meta": meta,
                    "created_at": now,
                }
            )
            .execute()
            .data
        )
        msg = _first_row(inserted)
        if not msg:
            return None

        preview = body if len(body) <= 140 else body[:137] + "…"
        db.table("message_threads").update(
            {"last_message_at": now, "last_message_preview": preview}
        ).eq("id", thread_id).execute()
        return msg
    except Exception:
        return None


@router.get("/unread-count")
def unread_count(user: AuthedUser = Depends(get_current_user)):
    """Unread thread count — pages through threads so the rail badge is not stuck at 200."""

    def _page(eq_col: str, offset: int) -> list:
        end = offset + UNREAD_SCAN_PAGE - 1
        return (
            user.db.table("message_threads")
            .select("id, last_message_at, landlord_id, tenant_user_id")
            .eq(eq_col, user.id)
            .order("last_message_at", desc=True)
            .range(offset, end)
            .execute()
            .data
            or []
        )

    seen: set[str] = set()
    threads: list[dict] = []
    capped = False
    for eq_col in ("landlord_id", "tenant_user_id"):
        offset = 0
        while offset < UNREAD_SCAN_MAX:
            batch = _page(eq_col, offset)
            for row in batch:
                tid = str(row.get("id") or "")
                if not tid or tid in seen:
                    continue
                seen.add(tid)
                threads.append(dict(row))
            if len(batch) < UNREAD_SCAN_PAGE:
                break
            offset += UNREAD_SCAN_PAGE
            if offset >= UNREAD_SCAN_MAX:
                capped = True
                break

    count = sum(1 for t in threads if _unread_for_thread(user, t))
    return {
        "unread_threads": count,
        "scanned": len(threads),
        "capped": capped,
    }


@router.get("/contacts")
def list_contacts(user: AuthedUser = Depends(get_current_user)):
    """People you can start a chat with (linked tenancies)."""
    # Landlord: active/pending tenants with user ids
    as_landlord = (
        user.db.table("tenancies")
        .select(
            "id, unit_id, tenant_user_id, tenant_name, tenant_contact, status, "
            "units(label, properties(name))"
        )
        .eq("landlord_id", user.id)
        .in_("status", ["active", "pending_verification", "draft"])
        .not_.is_("tenant_user_id", "null")
        .limit(100)
        .execute()
        .data
        or []
    )
    contacts = []
    for t in as_landlord:
        unit = t.get("units") or {}
        prop = unit.get("properties") if isinstance(unit, dict) else None
        contacts.append(
            {
                "role": "tenant",
                "tenancy_id": t["id"],
                "unit_id": t.get("unit_id"),
                "user_id": t.get("tenant_user_id"),
                "name": t.get("tenant_name") or t.get("tenant_contact") or "Tenant",
                "unit_label": unit.get("label") if isinstance(unit, dict) else None,
                "property_name": prop.get("name") if isinstance(prop, dict) else None,
                "tenancy_status": t.get("status"),
            }
        )

    if contacts:
        return {"items": contacts}

    # Tenant: their landlord via active tenancy
    as_tenant = (
        user.db.table("tenancies")
        .select(
            "id, unit_id, landlord_id, tenant_name, status, "
            "units(label, properties(name))"
        )
        .eq("tenant_user_id", user.id)
        .in_("status", ["active", "pending_verification"])
        .limit(20)
        .execute()
        .data
        or []
    )
    for t in as_tenant:
        unit = t.get("units") or {}
        prop = unit.get("properties") if isinstance(unit, dict) else None
        contacts.append(
            {
                "role": "landlord",
                "tenancy_id": t["id"],
                "unit_id": t.get("unit_id"),
                "user_id": t.get("landlord_id"),
                "name": "Your landlord",
                "unit_label": unit.get("label") if isinstance(unit, dict) else None,
                "property_name": prop.get("name") if isinstance(prop, dict) else None,
                "tenancy_status": t.get("status"),
            }
        )
    return {"items": contacts}


@router.get("/threads")
def list_threads(
    user: AuthedUser = Depends(get_current_user),
    kind: str | None = Query(default=None),
):
    if kind and kind not in ("chat", "maintenance"):
        raise HTTPException(status_code=400, detail="Invalid kind")

    def _fetch(eq_col: str) -> list:
        q = (
            user.db.table("message_threads")
            .select("*")
            .eq(eq_col, user.id)
            .order("last_message_at", desc=True)
            .limit(THREADS_LIST_LIMIT)
        )
        if kind:
            q = q.eq("kind", kind)
        return q.execute().data or []

    landlord_rows = _fetch("landlord_id")
    tenant_rows = _fetch("tenant_user_id")
    rows = list(landlord_rows)
    seen = {r["id"] for r in rows}
    for r in tenant_rows:
        if r["id"] not in seen:
            rows.append(r)

    items = []
    for row in rows:
        item = dict(row)
        item["unread"] = _unread_for_thread(user, item)
        items.append(item)
    items.sort(key=lambda x: x.get("last_message_at") or x.get("created_at") or "", reverse=True)
    capped = (
        len(landlord_rows) >= THREADS_LIST_LIMIT
        or len(tenant_rows) >= THREADS_LIST_LIMIT
    )
    return {
        "items": items,
        "loaded": len(items),
        "capped": capped,
    }


@router.post("/threads/chat", status_code=status.HTTP_201_CREATED)
def open_chat_thread(payload: dict, user: AuthedUser = Depends(get_current_user)):
    """Open or return existing chat for a tenancy the user participates in."""
    tenancy_id = (payload.get("tenancy_id") or "").strip()
    if not tenancy_id:
        raise HTTPException(status_code=400, detail="tenancy_id is required")

    svc = _svc_or_user(user)
    trows = (
        svc.table("tenancies")
        .select("id, landlord_id, tenant_user_id, unit_id, tenant_name, status")
        .eq("id", tenancy_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not trows:
        raise HTTPException(status_code=404, detail="Tenancy not found")
    tenancy = dict(trows[0])
    if user.id not in (tenancy.get("landlord_id"), tenancy.get("tenant_user_id")):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not tenancy.get("tenant_user_id"):
        raise HTTPException(
            status_code=400,
            detail="Tenant must claim invite before chat is available",
        )

    existing = (
        svc.table("message_threads")
        .select("*")
        .eq("kind", "chat")
        .eq("landlord_id", tenancy["landlord_id"])
        .eq("tenant_user_id", tenancy["tenant_user_id"])
        .eq("unit_id", tenancy["unit_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return {"item": dict(existing[0]), "created": False}

    subject = tenancy.get("tenant_name") or "Tenant chat"
    row = {
        "kind": "chat",
        "landlord_id": tenancy["landlord_id"],
        "tenant_user_id": tenancy["tenant_user_id"],
        "unit_id": tenancy["unit_id"],
        "tenancy_id": tenancy["id"],
        "subject": subject[:160],
    }
    inserted = svc.table("message_threads").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not open chat")
    return {"item": created, "created": True}


@router.post("/threads/maintenance/{request_id}", status_code=status.HTTP_201_CREATED)
def open_maintenance_thread(
    request_id: str, user: AuthedUser = Depends(get_current_user)
):
    svc = _svc_or_user(user)
    rows = (
        svc.table("maintenance_requests")
        .select("*")
        .eq("id", request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    mr = dict(rows[0])
    if user.id not in (mr.get("landlord_id"), mr.get("tenant_user_id")):
        raise HTTPException(status_code=403, detail="Forbidden")

    thread = ensure_maintenance_thread(
        landlord_id=mr["landlord_id"],
        tenant_user_id=mr.get("tenant_user_id"),
        unit_id=mr.get("unit_id"),
        tenancy_id=mr.get("tenancy_id"),
        maintenance_request_id=mr["id"],
        subject=mr.get("title") or "Maintenance",
        db=svc,
    )
    return {"item": thread}


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str, user: AuthedUser = Depends(get_current_user)):
    thread = _load_thread(user, thread_id)
    thread["unread"] = _unread_for_thread(user, thread)
    return {"item": thread}


@router.get("/threads/{thread_id}/messages")
def list_messages(thread_id: str, user: AuthedUser = Depends(get_current_user)):
    thread = _load_thread(user, thread_id)
    svc = _svc_or_user(user)
    rows = (
        user.db.table("messages")
        .select("*")
        .eq("thread_id", thread_id)
        .order("created_at")
        .limit(200)
        .execute()
        .data
        or []
    )
    if not rows:
        # RLS edge: use svc filtered by participant already checked
        rows = (
            svc.table("messages")
            .select("*")
            .eq("thread_id", thread_id)
            .order("created_at")
            .limit(200)
            .execute()
            .data
            or []
        )
    peer_last_read_at = _peer_last_read_at(svc, thread, user.id)
    return {"items": rows, "peer_last_read_at": peer_last_read_at}


@router.post("/threads/{thread_id}/messages", status_code=status.HTTP_201_CREATED)
def send_message(
    thread_id: str, payload: dict, user: AuthedUser = Depends(get_current_user)
):
    thread = _load_thread(user, thread_id)
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is required")
    if len(body) > 4000:
        raise HTTPException(status_code=400, detail="Message too long")

    now = _now()
    svc = _svc_or_user(user)
    inserted = (
        svc.table("messages")
        .insert(
            {
                "thread_id": thread_id,
                "sender_id": user.id,
                "body": body,
                "kind": "user",
                "created_at": now,
            }
        )
        .execute()
        .data
    )
    msg = _first_row(inserted)
    if not msg:
        raise HTTPException(status_code=500, detail="Could not send message")

    preview = body if len(body) <= 140 else body[:137] + "…"
    svc.table("message_threads").update(
        {"last_message_at": now, "last_message_preview": preview}
    ).eq("id", thread_id).execute()

    # Mark sender as read
    svc.table("message_thread_reads").upsert(
        {"thread_id": thread_id, "user_id": user.id, "last_read_at": now}
    ).execute()

    return {"item": msg, "thread_id": thread["id"]}


@router.post("/threads/{thread_id}/read")
def mark_thread_read(thread_id: str, user: AuthedUser = Depends(get_current_user)):
    _load_thread(user, thread_id)
    now = _now()
    user.db.table("message_thread_reads").upsert(
        {"thread_id": thread_id, "user_id": user.id, "last_read_at": now}
    ).execute()
    return {"ok": True, "last_read_at": now}
