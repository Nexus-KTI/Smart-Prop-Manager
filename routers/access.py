"""Software access passes / gate codes (Phase 5 F50)."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from lib.access import PERM_ACCESS_VISITOR_PASSES, require_property_access
from lib.auth import AuthedUser, get_current_user

router = APIRouter(prefix="/access", tags=["access"])

VALID_SUBJECTS = frozenset({"tenant", "guest", "artisan", "contractor"})


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_pass(row: dict) -> dict:
    out = dict(row)
    until = row.get("valid_until")
    status_val = row.get("status") or "active"
    if status_val == "active" and until:
        try:
            until_dt = datetime.fromisoformat(str(until).replace("Z", "+00:00"))
            if until_dt.tzinfo is None:
                until_dt = until_dt.replace(tzinfo=timezone.utc)
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
        from lib.db import create_service_client

        inserted = create_service_client().table("access_passes").insert(row).execute().data

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
        from lib.db import create_service_client

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
        from lib.db import create_service_client

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
    return {
        "items": ordered,
        "loaded": len(ordered),
        "capped": len(items) >= MY_PASSES_LIMIT,
    }
