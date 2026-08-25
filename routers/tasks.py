"""Landlord/tenant ops tasks + light calendar feed."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])

VALID_STATUS = frozenset({"open", "done", "canceled"})


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


@router.get("/")
def list_landlord_tasks(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("ops_tasks")
        .select("*")
        .eq("landlord_id", user.id)
        .order("due_on")
        .limit(100)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.get("/me")
def list_my_tasks(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("ops_tasks")
        .select("*")
        .eq("tenant_user_id", user.id)
        .eq("audience", "tenant")
        .order("due_on")
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.get("/calendar")
def calendar_feed(user: AuthedUser = Depends(get_current_user)):
    """Light calendar: open tasks + upcoming term ends for landlord."""
    today = date.today()
    horizon = today + timedelta(days=60)
    events: list[dict] = []

    tasks = (
        user.db.table("ops_tasks")
        .select("id, title, due_on, status, audience, unit_id")
        .eq("landlord_id", user.id)
        .eq("status", "open")
        .gte("due_on", today.isoformat())
        .lte("due_on", horizon.isoformat())
        .limit(100)
        .execute()
        .data
        or []
    )
    for t in tasks:
        events.append(
            {
                "kind": "task",
                "id": t["id"],
                "title": t.get("title"),
                "date": t.get("due_on"),
                "meta": {"audience": t.get("audience"), "unit_id": t.get("unit_id")},
            }
        )

    tenancies = (
        user.db.table("tenancies")
        .select("id, unit_id, tenant_name, term_end, status")
        .eq("landlord_id", user.id)
        .eq("status", "active")
        .gte("term_end", today.isoformat())
        .lte("term_end", horizon.isoformat())
        .limit(100)
        .execute()
        .data
        or []
    )
    for t in tenancies:
        events.append(
            {
                "kind": "term_end",
                "id": t["id"],
                "title": f"Lease ends: {t.get('tenant_name') or 'tenant'}",
                "date": t.get("term_end"),
                "meta": {"unit_id": t.get("unit_id")},
            }
        )

    fees = (
        user.db.table("scheduled_fees")
        .select("id, label, due_on, unit_id, amount, currency")
        .eq("landlord_id", user.id)
        .eq("status", "due")
        .gte("due_on", today.isoformat())
        .lte("due_on", horizon.isoformat())
        .limit(100)
        .execute()
        .data
        or []
    )
    for f in fees:
        events.append(
            {
                "kind": "fee",
                "id": f["id"],
                "title": f.get("label"),
                "date": f.get("due_on"),
                "meta": {
                    "unit_id": f.get("unit_id"),
                    "amount": f.get("amount"),
                    "currency": f.get("currency"),
                },
            }
        )

    events.sort(key=lambda e: e.get("date") or "")
    return {"items": events, "from": today.isoformat(), "to": horizon.isoformat()}


@router.get("/calendar/me")
def tenant_calendar(user: AuthedUser = Depends(get_current_user)):
    today = date.today()
    horizon = today + timedelta(days=60)
    events: list[dict] = []

    tasks = (
        user.db.table("ops_tasks")
        .select("id, title, due_on, status")
        .eq("tenant_user_id", user.id)
        .eq("audience", "tenant")
        .eq("status", "open")
        .limit(50)
        .execute()
        .data
        or []
    )
    for t in tasks:
        if t.get("due_on"):
            events.append(
                {
                    "kind": "task",
                    "id": t["id"],
                    "title": t.get("title"),
                    "date": t.get("due_on"),
                }
            )

    fees = (
        user.db.table("scheduled_fees")
        .select("id, label, due_on, amount, currency, unit_id, status")
        .eq("status", "due")
        .limit(50)
        .execute()
        .data
        or []
    )
    for f in fees:
        due = f.get("due_on")
        if due and today.isoformat() <= due <= horizon.isoformat():
            events.append(
                {
                    "kind": "fee",
                    "id": f["id"],
                    "title": f.get("label"),
                    "date": due,
                    "meta": {"amount": f.get("amount"), "currency": f.get("currency")},
                }
            )

    tenancy = (
        user.db.table("tenancies")
        .select("id, term_end")
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
        or []
    )
    if tenancy and tenancy[0].get("term_end"):
        te = tenancy[0]["term_end"]
        if today.isoformat() <= te <= horizon.isoformat():
            events.append(
                {
                    "kind": "term_end",
                    "id": tenancy[0]["id"],
                    "title": "Lease ends",
                    "date": te,
                }
            )

    events.sort(key=lambda e: e.get("date") or "")
    return {"items": events, "from": today.isoformat(), "to": horizon.isoformat()}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_task(payload: dict, user: AuthedUser = Depends(get_current_user)):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    audience = (payload.get("audience") or "landlord").strip().lower()
    if audience not in ("landlord", "tenant"):
        raise HTTPException(status_code=400, detail="Invalid audience")

    tenant_user_id = payload.get("tenant_user_id") or None
    unit_id = payload.get("unit_id") or None
    tenancy_id = payload.get("tenancy_id") or None
    property_id = payload.get("property_id") or None

    if audience == "tenant":
        if not tenant_user_id and tenancy_id:
            trows = (
                user.db.table("tenancies")
                .select("id, tenant_user_id, unit_id, landlord_id")
                .eq("id", tenancy_id)
                .eq("landlord_id", user.id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not trows:
                raise HTTPException(status_code=404, detail="Tenancy not found")
            tenant_user_id = trows[0].get("tenant_user_id")
            unit_id = unit_id or trows[0].get("unit_id")
        if not tenant_user_id:
            raise HTTPException(
                status_code=400,
                detail="tenant_user_id or tenancy_id required for tenant tasks",
            )

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "landlord_id": user.id,
        "audience": audience,
        "tenant_user_id": tenant_user_id,
        "property_id": property_id,
        "unit_id": unit_id,
        "tenancy_id": tenancy_id,
        "title": title[:160],
        "details": ((payload.get("details") or "").strip() or None),
        "due_on": payload.get("due_on") or None,
        "status": "open",
        "created_by": user.id,
        "updated_at": now,
    }
    inserted = user.db.table("ops_tasks").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create task")
    return {"item": created}


@router.patch("/{task_id}")
def update_task(task_id: str, payload: dict, user: AuthedUser = Depends(get_current_user)):
    next_status = (payload.get("status") or "").strip().lower()
    if next_status not in VALID_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")

    rows = (
        user.db.table("ops_tasks")
        .select("*")
        .eq("id", task_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    current = dict(rows[0])
    is_landlord = current.get("landlord_id") == user.id
    is_tenant = (
        current.get("audience") == "tenant"
        and current.get("tenant_user_id") == user.id
    )
    if not is_landlord and not is_tenant:
        raise HTTPException(status_code=403, detail="Forbidden")
    if is_tenant and next_status not in ("done", "open"):
        raise HTTPException(status_code=400, detail="Tenants can only open/done")

    updated = (
        user.db.table("ops_tasks")
        .update(
            {
                "status": next_status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", task_id)
        .execute()
        .data
    )
    return {"item": _first_row(updated) or {**current, "status": next_status}}
