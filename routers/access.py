"""Software access passes / gate codes (Phase 5 F50)."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from lib.access import PERM_ACCESS_VISITOR_PASSES, require_property_access
from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client

router = APIRouter(prefix="/access", tags=["access"])

VALID_SUBJECTS = frozenset({"tenant", "guest", "artisan", "contractor"})

# Tenant self-serve guest codes (after landlord move-in pass).
TENANT_GUEST_MAX_HOURS = 6
TENANT_GUEST_DURATION_HOURS = (1, 2, 4, 6)
TENANT_GUEST_MAX_ACTIVE = 2
TENANT_GUEST_MAX_USES = 1  # single entry until gate Admit exists
TENANT_GUEST_SOURCE = "tenant_self"


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _serialize_pass(row: dict) -> dict:
    out = dict(row)
    until = row.get("valid_until")
    status_val = row.get("status") or "active"
    if status_val == "active" and until:
        try:
            until_dt = _parse_dt(str(until))
            if until_dt < _now():
                out["status"] = "expired"
                out["effective_status"] = "expired"
            else:
                out["effective_status"] = "active"
        except ValueError:
            out["effective_status"] = status_val
    else:
        out["effective_status"] = status_val
    return out


def _gen_code() -> str:
    return secrets.token_hex(3).upper()  # 6 hex chars


def _active_tenancy_for_tenant(user: AuthedUser) -> dict | None:
    """First active claimed tenancy for this user (service read for unit/property)."""
    svc = create_service_client()
    rows = (
        svc.table("tenancies")
        .select("id, unit_id, landlord_id, tenant_user_id, tenant_name, status")
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    tenancy = dict(rows[0])
    unit_id = str(tenancy.get("unit_id") or "")
    if not unit_id:
        return None
    unit_rows = (
        svc.table("units")
        .select("id, property_id, label")
        .eq("id", unit_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    unit = dict(unit_rows[0]) if unit_rows else {}
    property_id = str(unit.get("property_id") or "")
    if not property_id:
        return None
    return {
        "tenancy_id": str(tenancy.get("id")),
        "unit_id": unit_id,
        "unit_label": unit.get("label") or unit_id[:8],
        "landlord_id": str(tenancy.get("landlord_id")),
        "property_id": property_id,
        "tenant_name": tenancy.get("tenant_name") or "Tenant",
    }


def _count_active_tenant_guests(
    *, landlord_id: str, unit_id: str, created_by: str
) -> int:
    svc = create_service_client()
    rows = (
        svc.table("access_passes")
        .select("id, valid_until, status")
        .eq("landlord_id", landlord_id)
        .eq("unit_id", unit_id)
        .eq("subject_type", "guest")
        .eq("created_by", created_by)
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    now = _now()
    count = 0
    for row in rows:
        until = row.get("valid_until")
        if not until:
            count += 1
            continue
        try:
            if _parse_dt(str(until)) >= now:
                count += 1
        except ValueError:
            count += 1
    return count


@router.get("/occupants")
def list_occupants(
    property_id: str = Query(...),
    user: AuthedUser = Depends(get_current_user),
):
    """Active tenancies with a linked tenant account on this property."""
    require_property_access(
        user.id, property_id, permission=PERM_ACCESS_VISITOR_PASSES
    )
    units = (
        user.db.table("units")
        .select("id, label")
        .eq("property_id", property_id)
        .execute()
        .data
        or []
    )
    unit_ids = [str(u["id"]) for u in units if u.get("id")]
    by_unit = {str(u["id"]): u for u in units if u.get("id")}
    if not unit_ids:
        return {"items": []}

    rows = (
        user.db.table("tenancies")
        .select("id, unit_id, tenant_user_id, tenant_name, status")
        .in_("unit_id", unit_ids)
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    items = []
    for row in rows:
        if not row.get("tenant_user_id"):
            continue
        uid = str(row.get("unit_id") or "")
        unit = by_unit.get(uid) or {}
        items.append(
            {
                "tenancy_id": row.get("id"),
                "unit_id": uid,
                "unit_label": unit.get("label") or uid[:8],
                "tenant_user_id": row.get("tenant_user_id"),
                "tenant_name": row.get("tenant_name") or "Tenant",
            }
        )
    return {"items": items}


@router.get("/passes")
def list_passes(
    property_id: str | None = Query(default=None),
    user: AuthedUser = Depends(get_current_user),
):
    PASSES_PAGE_LIMIT = 100
    q = (
        user.db.table("access_passes")
        .select("*")
        .eq("landlord_id", user.id)
        .order("created_at", desc=True)
        .limit(PASSES_PAGE_LIMIT)
    )
    if property_id:
        require_property_access(
            user.id, property_id, permission=PERM_ACCESS_VISITOR_PASSES
        )
        q = q.eq("property_id", property_id)
    rows = q.execute().data or []
    items = [_serialize_pass(dict(r)) for r in rows]
    return {
        "items": items,
        "loaded": len(items),
        "capped": len(items) >= PASSES_PAGE_LIMIT,
    }


@router.post("/passes", status_code=status.HTTP_201_CREATED)
def create_pass(payload: dict, user: AuthedUser = Depends(get_current_user)):
    property_id = (payload.get("property_id") or "").strip()
    if not property_id:
        raise HTTPException(status_code=400, detail="property_id is required")

    ctx = require_property_access(
        user.id, property_id, permission=PERM_ACCESS_VISITOR_PASSES
    )
    landlord_id = ctx.owner_id

    subject_type = (payload.get("subject_type") or "guest").strip().lower()
    if subject_type not in VALID_SUBJECTS:
        raise HTTPException(status_code=400, detail="Invalid subject_type")

    subject_label = (payload.get("subject_label") or "").strip()
    if not subject_label:
        raise HTTPException(status_code=400, detail="subject_label is required")

    valid_until = (payload.get("valid_until") or "").strip()
    if not valid_until:
        raise HTTPException(status_code=400, detail="valid_until is required")

    unit_id = (payload.get("unit_id") or "").strip() or None
    subject_user_id = (payload.get("subject_user_id") or "").strip() or None
    code = (payload.get("code") or "").strip().upper() or _gen_code()
    valid_from = (payload.get("valid_from") or "").strip() or _now().isoformat()

    # Owner inserts as landlord_id; staff acting for owner need service insert
    # when user.id != landlord_id — use user.db when owner, else service with landlord_id.
    row = {
        "landlord_id": landlord_id,
        "property_id": property_id,
        "unit_id": unit_id,
        "subject_type": subject_type,
        "subject_user_id": subject_user_id,
        "subject_label": subject_label[:120],
        "code": code[:32],
        "valid_from": valid_from,
        "valid_until": valid_until,
        "status": "active",
        "source_type": (payload.get("source_type") or None),
        "source_id": (payload.get("source_id") or None),
        "created_by": user.id,
        "updated_at": _now().isoformat(),
    }

    if landlord_id == user.id:
        inserted = user.db.table("access_passes").insert(row).execute().data
    else:
        inserted = (
            create_service_client().table("access_passes").insert(row).execute().data
        )

    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create pass")
    return {"item": _serialize_pass(dict(created))}


@router.post("/passes/{pass_id}/revoke")
def revoke_pass(pass_id: str, user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("access_passes")
        .select("*")
        .eq("id", pass_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        # Staff may need service lookup
        rows = (
            create_service_client()
            .table("access_passes")
            .select("*")
            .eq("id", pass_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    if not rows:
        raise HTTPException(status_code=404, detail="Pass not found")

    current = dict(rows[0])
    require_property_access(
        user.id,
        str(current["property_id"]),
        permission=PERM_ACCESS_VISITOR_PASSES,
    )

    patch = {
        "status": "revoked",
        "updated_at": _now().isoformat(),
    }
    if current.get("landlord_id") == user.id:
        updated = (
            user.db.table("access_passes")
            .update(patch)
            .eq("id", pass_id)
            .execute()
            .data
        )
    else:
        updated = (
            create_service_client()
            .table("access_passes")
            .update(patch)
            .eq("id", pass_id)
            .execute()
            .data
        )
    row = _first_row(updated) or {**current, **patch}
    return {"item": _serialize_pass(dict(row))}


@router.get("/me")
def list_my_passes(user: AuthedUser = Depends(get_current_user)):
    MY_PASSES_LIMIT = 50
    rows = (
        user.db.table("access_passes")
        .select("*")
        .eq("subject_user_id", user.id)
        .order("created_at", desc=True)
        .limit(MY_PASSES_LIMIT)
        .execute()
        .data
        or []
    )
    items = [_serialize_pass(dict(r)) for r in rows]
    # Prefer showing still-usable codes first
    active = [i for i in items if i.get("effective_status") == "active"]
    other = [i for i in items if i.get("effective_status") != "active"]
    ordered = active + other
    tenancy = _active_tenancy_for_tenant(user)
    guest_active = 0
    if tenancy:
        guest_active = _count_active_tenant_guests(
            landlord_id=tenancy["landlord_id"],
            unit_id=tenancy["unit_id"],
            created_by=user.id,
        )
    return {
        "items": ordered,
        "loaded": len(ordered),
        "capped": len(items) >= MY_PASSES_LIMIT,
        "can_create_guest": bool(tenancy),
        "guest_active_count": guest_active,
        "guest_max_active": TENANT_GUEST_MAX_ACTIVE,
        "guest_max_hours": TENANT_GUEST_MAX_HOURS,
        "guest_duration_hours": list(TENANT_GUEST_DURATION_HOURS),
        "guest_max_uses": TENANT_GUEST_MAX_USES,
        "tenancy": (
            {
                "id": tenancy["tenancy_id"],
                "unit_label": tenancy["unit_label"],
                "property_id": tenancy["property_id"],
            }
            if tenancy
            else None
        ),
    }


@router.post("/me/guest-passes", status_code=status.HTTP_201_CREATED)
def create_my_guest_pass(payload: dict, user: AuthedUser = Depends(get_current_user)):
    """Tenant mints a short-lived single-entry guest gate code for their unit."""
    tenancy = _active_tenancy_for_tenant(user)
    if not tenancy:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active claimed tenancy required to create guest codes",
        )

    subject_label = (payload.get("subject_label") or "").strip()
    if not subject_label:
        raise HTTPException(status_code=400, detail="subject_label is required")

    raw_hours = payload.get("duration_hours")
    if raw_hours is None and payload.get("valid_until"):
        # Legacy clients: map absolute expiry onto the nearest allowed preset ≤ max.
        try:
            until_dt = _parse_dt(str(payload.get("valid_until") or "").strip())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid valid_until") from exc
        delta_h = (until_dt - _now()).total_seconds() / 3600
        if delta_h <= 0:
            raise HTTPException(status_code=400, detail="valid_until must be in the future")
        if delta_h > TENANT_GUEST_MAX_HOURS + 0.05:
            raise HTTPException(
                status_code=400,
                detail=f"Guest codes may last at most {TENANT_GUEST_MAX_HOURS} hours",
            )
        # Snap up to the smallest allowed preset that covers the requested window.
        chosen = None
        for h in TENANT_GUEST_DURATION_HOURS:
            if delta_h <= h + 0.05:
                chosen = h
                break
        duration_hours = chosen or TENANT_GUEST_MAX_HOURS
    else:
        try:
            duration_hours = int(raw_hours)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail="duration_hours must be one of 1, 2, 4, or 6",
            ) from exc
        if duration_hours not in TENANT_GUEST_DURATION_HOURS:
            raise HTTPException(
                status_code=400,
                detail="duration_hours must be one of 1, 2, 4, or 6",
            )

    now = _now()
    valid_until_dt = now + timedelta(hours=duration_hours)

    active_count = _count_active_tenant_guests(
        landlord_id=tenancy["landlord_id"],
        unit_id=tenancy["unit_id"],
        created_by=user.id,
    )
    if active_count >= TENANT_GUEST_MAX_ACTIVE:
        raise HTTPException(
            status_code=400,
            detail=f"At most {TENANT_GUEST_MAX_ACTIVE} active guest codes at a time",
        )

    row = {
        "landlord_id": tenancy["landlord_id"],
        "property_id": tenancy["property_id"],
        "unit_id": tenancy["unit_id"],
        "subject_type": "guest",
        "subject_user_id": user.id,
        "subject_label": subject_label[:120],
        "code": _gen_code(),
        "valid_from": now.isoformat(),
        "valid_until": valid_until_dt.isoformat(),
        "status": "active",
        "source_type": TENANT_GUEST_SOURCE,
        "source_id": tenancy["tenancy_id"],
        "created_by": user.id,
        "max_uses": TENANT_GUEST_MAX_USES,
        "uses_count": 0,
        "updated_at": now.isoformat(),
    }
    inserted = create_service_client().table("access_passes").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create guest pass")
    return {"item": _serialize_pass(dict(created))}


@router.post("/me/passes/{pass_id}/revoke")
def revoke_my_guest_pass(pass_id: str, user: AuthedUser = Depends(get_current_user)):
    """Tenant revokes a guest pass they created."""
    svc = create_service_client()
    rows = (
        svc.table("access_passes")
        .select("*")
        .eq("id", pass_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Pass not found")
    current = dict(rows[0])
    if current.get("created_by") != user.id or current.get("subject_type") != "guest":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only revoke guest codes you created",
        )
    if current.get("status") == "revoked":
        return {"item": _serialize_pass(current)}

    patch = {"status": "revoked", "updated_at": _now().isoformat()}
    updated = (
        svc.table("access_passes").update(patch).eq("id", pass_id).execute().data
    )
    row = _first_row(updated) or {**current, **patch}
    return {"item": _serialize_pass(dict(row))}
