"""Unit utility providers — landlord CRUD, tenant read."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user

router = APIRouter(prefix="/utilities", tags=["utilities"])

VALID_KINDS = frozenset(
    {"power", "water", "waste", "diesel_generator", "internet", "other"}
)


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _require_owned_unit(user: AuthedUser, unit_id: str) -> dict:
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
    return dict(rows[0])


def _active_tenancy_unit(user: AuthedUser) -> str | None:
    rows = (
        user.db.table("tenancies")
        .select("unit_id")
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .order("activated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    return rows[0].get("unit_id")


@router.get("/me")
def list_my_utilities(user: AuthedUser = Depends(get_current_user)):
    unit_id = _active_tenancy_unit(user)
    if not unit_id:
        return {"items": []}
    rows = (
        user.db.table("unit_utility_providers")
        .select("*")
        .eq("unit_id", unit_id)
        .eq("is_enabled", True)
        .order("sort_order")
        .order("kind")
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.get("/unit/{unit_id}")
def list_unit_utilities(unit_id: str, user: AuthedUser = Depends(get_current_user)):
    _require_owned_unit(user, unit_id)
    rows = (
        user.db.table("unit_utility_providers")
        .select("*")
        .eq("unit_id", unit_id)
        .eq("landlord_id", user.id)
        .order("sort_order")
        .order("kind")
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.post("/unit/{unit_id}", status_code=status.HTTP_201_CREATED)
def create_unit_utility(
    unit_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    _require_owned_unit(user, unit_id)
    kind = (payload.get("kind") or "").strip().lower()
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid kind")
    provider_name = (payload.get("provider_name") or "").strip()
    if not provider_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Provider name is required"
        )

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "unit_id": unit_id,
        "landlord_id": user.id,
        "kind": kind,
        "provider_name": provider_name[:120],
        "account_or_meter": ((payload.get("account_or_meter") or "").strip() or None),
        "notes": ((payload.get("notes") or "").strip() or None),
        "how_to_pay": ((payload.get("how_to_pay") or "").strip() or None),
        "is_enabled": bool(payload.get("is_enabled", True)),
        "sort_order": int(payload.get("sort_order") or 0),
        "updated_at": now,
    }
    try:
        inserted = user.db.table("unit_utility_providers").insert(row).execute().data
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create provider (kind may already exist for this unit)",
        ) from exc
    created = _first_row(inserted)
    if not created:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create provider",
        )
    return {"item": created}


@router.patch("/{provider_id}")
def update_utility(
    provider_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    rows = (
        user.db.table("unit_utility_providers")
        .select("*")
        .eq("id", provider_id)
        .eq("landlord_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    patch: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "provider_name" in payload:
        name = (payload.get("provider_name") or "").strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Provider name is required"
            )
        patch["provider_name"] = name[:120]
    if "account_or_meter" in payload:
        patch["account_or_meter"] = ((payload.get("account_or_meter") or "").strip() or None)
    if "notes" in payload:
        patch["notes"] = ((payload.get("notes") or "").strip() or None)
    if "how_to_pay" in payload:
        patch["how_to_pay"] = ((payload.get("how_to_pay") or "").strip() or None)
    if "is_enabled" in payload:
        patch["is_enabled"] = bool(payload.get("is_enabled"))
    if "sort_order" in payload:
        patch["sort_order"] = int(payload.get("sort_order") or 0)
    if "kind" in payload:
        kind = (payload.get("kind") or "").strip().lower()
        if kind not in VALID_KINDS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid kind")
        patch["kind"] = kind

    updated = (
        user.db.table("unit_utility_providers")
        .update(patch)
        .eq("id", provider_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated) or {**dict(rows[0]), **patch}
    return {"item": row}


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_utility(provider_id: str, user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("unit_utility_providers")
        .select("id")
        .eq("id", provider_id)
        .eq("landlord_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    user.db.table("unit_utility_providers").delete().eq("id", provider_id).eq(
        "landlord_id", user.id
    ).execute()
    return None
