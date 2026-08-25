"""Tenant maintenance / repair requests (thin Phase 5 precursor)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

VALID_PRIORITIES = frozenset({"low", "normal", "high", "urgent"})
VALID_STATUSES = frozenset({"new", "in_progress", "resolved", "canceled"})
LANDLORD_STATUSES = frozenset({"new", "in_progress", "resolved", "canceled"})
TENANT_CANCEL_ONLY = frozenset({"canceled"})
VALID_CATEGORIES = frozenset(
    {
        "general",
        "plumbing",
        "electrical",
        "hvac",
        "appliance",
        "structural",
        "pest",
        "other",
    }
)


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _require_active_tenancy_for_tenant(user: AuthedUser) -> dict:
    rows = (
        user.db.table("tenancies")
        .select("id, unit_id, landlord_id, tenant_user_id, status")
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .order("activated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active occupancy required before submitting requests",
        )
    return dict(rows[0])


def _require_owned_unit(user: AuthedUser, unit_id: str) -> None:
    rows = (
        user.db.table("units")
        .select("id, properties!inner(owner_id)")
        .eq("id", unit_id)
        .eq("properties.owner_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")


@router.get("/me")
def list_my_requests(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("maintenance_requests")
        .select("*")
        .eq("tenant_user_id", user.id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.post("/me", status_code=status.HTTP_201_CREATED)
def create_my_request(payload: dict, user: AuthedUser = Depends(get_current_user)):
    tenancy = _require_active_tenancy_for_tenant(user)
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    if len(title) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is too long")

    details = (payload.get("details") or "").strip() or None
    if details and len(details) > 2000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Details are too long")

    priority = (payload.get("priority") or "normal").strip().lower()
    if priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid priority")

    allow_entry = bool(payload.get("allow_entry"))
    category = (payload.get("category") or "general").strip().lower()
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category")
    photo_url = (payload.get("photo_url") or "").strip() or None
    if photo_url and len(photo_url) > 2000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="photo_url too long")
    preferred_time = (payload.get("preferred_time") or "").strip() or None
    if preferred_time and len(preferred_time) > 120:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="preferred_time too long"
        )
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "unit_id": tenancy["unit_id"],
        "tenancy_id": tenancy["id"],
        "landlord_id": tenancy["landlord_id"],
        "tenant_user_id": user.id,
        "title": title,
        "details": details,
        "priority": priority,
        "status": "new",
        "origin": "tenant",
        "allow_entry": allow_entry,
        "category": category,
        "photo_url": photo_url,
        "preferred_time": preferred_time,
        "updated_at": now,
    }
    inserted = user.db.table("maintenance_requests").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create request",
        )
    try:
        from routers.messages import ensure_maintenance_thread
        from lib.db import create_service_client

        try:
            db = create_service_client()
        except RuntimeError:
            db = user.db
        ensure_maintenance_thread(
            landlord_id=created["landlord_id"],
            tenant_user_id=created.get("tenant_user_id"),
            unit_id=created.get("unit_id"),
            tenancy_id=created.get("tenancy_id"),
            maintenance_request_id=created["id"],
            subject=created.get("title") or "Maintenance",
            db=db,
        )
    except Exception:
        pass
    return {"item": created}


@router.patch("/me/{request_id}")
def cancel_my_request(
    request_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    """Tenants may only cancel their own open requests."""
    next_status = (payload.get("status") or "").strip().lower()
    if next_status not in TENANT_CANCEL_ONLY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenants can only cancel requests",
        )

    rows = (
        user.db.table("maintenance_requests")
        .select("*")
        .eq("id", request_id)
        .eq("tenant_user_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    current = dict(rows[0])
    if current.get("status") in ("resolved", "canceled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request is already closed",
        )

    updated = (
        user.db.table("maintenance_requests")
        .update(
            {
                "status": "canceled",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", request_id)
        .eq("tenant_user_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated) or {**current, "status": "canceled"}
    return {"item": row}


@router.get("/unit/{unit_id}")
def list_unit_requests(unit_id: str, user: AuthedUser = Depends(get_current_user)):
    _require_owned_unit(user, unit_id)
    rows = (
        user.db.table("maintenance_requests")
        .select("*")
        .eq("unit_id", unit_id)
        .eq("landlord_id", user.id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.post("/unit/{unit_id}", status_code=status.HTTP_201_CREATED)
def create_unit_work_order(
    unit_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    """Landlord-originated work order (no tenant required)."""
    _require_owned_unit(user, unit_id)
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    priority = (payload.get("priority") or "normal").strip().lower()
    if priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid priority")

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "unit_id": unit_id,
        "landlord_id": user.id,
        "tenancy_id": None,
        "tenant_user_id": None,
        "title": title[:120],
        "details": ((payload.get("details") or "").strip() or None),
        "priority": priority,
        "status": "new",
        "origin": "landlord",
        "allow_entry": bool(payload.get("allow_entry")),
        "updated_at": now,
    }
    inserted = user.db.table("maintenance_requests").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create work order")
    try:
        from routers.messages import ensure_maintenance_thread
        from lib.db import create_service_client

        try:
            db = create_service_client()
        except RuntimeError:
            db = user.db
        # Attach active tenant on unit if any
        tenancies = (
            user.db.table("tenancies")
            .select("id, tenant_user_id")
            .eq("unit_id", unit_id)
            .eq("status", "active")
            .limit(1)
            .execute()
            .data
            or []
        )
        tenant_user_id = created.get("tenant_user_id")
        tenancy_id = created.get("tenancy_id")
        if tenancies:
            tenant_user_id = tenant_user_id or tenancies[0].get("tenant_user_id")
            tenancy_id = tenancy_id or tenancies[0].get("id")
        ensure_maintenance_thread(
            landlord_id=created["landlord_id"],
            tenant_user_id=tenant_user_id,
            unit_id=created.get("unit_id"),
            tenancy_id=tenancy_id,
            maintenance_request_id=created["id"],
            subject=created.get("title") or "Maintenance",
            db=db,
        )
    except Exception:
        pass
    return {"item": created}


@router.get("/artisan/me")
def list_artisan_jobs(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("maintenance_requests")
        .select("*, access_passes(*)")
        .eq("artisan_user_id", user.id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.get("/board")
def list_landlord_board(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("maintenance_requests")
        .select("*")
        .eq("landlord_id", user.id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.post("/{request_id}/assign")
def assign_artisan(
    request_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    rows = (
        user.db.table("maintenance_requests")
        .select("*")
        .eq("id", request_id)
        .eq("landlord_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    current = dict(rows[0])

    artisan_user_id = (payload.get("artisan_user_id") or "").strip() or None
    if not artisan_user_id:
        raise HTTPException(status_code=400, detail="artisan_user_id is required")

    # Must be on active roster
    roster = (
        user.db.table("landlord_artisans")
        .select("id")
        .eq("landlord_id", user.id)
        .eq("artisan_user_id", artisan_user_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not roster:
        raise HTTPException(
            status_code=400,
            detail="Artisan must be on your active roster (invite & claim first)",
        )

    now = datetime.now(timezone.utc)
    scheduled_start = (payload.get("scheduled_start") or "").strip() or None
    scheduled_end = (payload.get("scheduled_end") or "").strip() or None
    access_pass_id = None

    create_pass = bool(payload.get("issue_access_pass"))
    if create_pass and scheduled_end:
        unit_rows = (
            user.db.table("units")
            .select("id, property_id, label")
            .eq("id", current["unit_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if unit_rows:
            unit = dict(unit_rows[0])
            import secrets as _secrets

            pass_row = {
                "landlord_id": user.id,
                "property_id": unit["property_id"],
                "unit_id": unit["id"],
                "subject_type": "artisan",
                "subject_user_id": artisan_user_id,
                "subject_label": f"Job: {current.get('title') or 'Repair'}",
                "code": _secrets.token_hex(3).upper(),
                "valid_from": scheduled_start or now.isoformat(),
                "valid_until": scheduled_end,
                "status": "active",
                "source_type": "maintenance_request",
                "source_id": request_id,
                "created_by": user.id,
                "updated_at": now.isoformat(),
            }
            inserted_pass = user.db.table("access_passes").insert(pass_row).execute().data
            if inserted_pass:
                access_pass_id = inserted_pass[0]["id"]

    patch = {
        "artisan_user_id": artisan_user_id,
        "status": "in_progress",
        "scheduled_start": scheduled_start,
        "scheduled_end": scheduled_end,
        "updated_at": now.isoformat(),
    }
    if access_pass_id:
        patch["access_pass_id"] = access_pass_id

    updated = (
        user.db.table("maintenance_requests")
        .update(patch)
        .eq("id", request_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated) or {**current, **patch}
    return {"item": row}


@router.post("/{request_id}/complete")
def complete_request(request_id: str, user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("maintenance_requests")
        .select("*")
        .eq("id", request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    current = dict(rows[0])
    is_landlord = current.get("landlord_id") == user.id
    is_artisan = current.get("artisan_user_id") == user.id
    if not is_landlord and not is_artisan:
        raise HTTPException(status_code=403, detail="Not allowed")

    now = datetime.now(timezone.utc).isoformat()
    patch = {
        "status": "resolved",
        "completed_at": now,
        "updated_at": now,
    }
    updated = (
        user.db.table("maintenance_requests")
        .update(patch)
        .eq("id", request_id)
        .execute()
        .data
    )
    row = _first_row(updated) or {**current, **patch}
    return {"item": row}


@router.patch("/{request_id}")
def update_request_status(
    request_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    next_status = (payload.get("status") or "").strip().lower()
    if next_status not in LANDLORD_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    rows = (
        user.db.table("maintenance_requests")
        .select("*")
        .eq("id", request_id)
        .eq("landlord_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    patch: dict = {
        "status": next_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if next_status == "resolved":
        patch["completed_at"] = datetime.now(timezone.utc).isoformat()

    updated = (
        user.db.table("maintenance_requests")
        .update(patch)
        .eq("id", request_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated) or {**dict(rows[0]), **patch}
    return {"item": row}
