import math

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from lib.access import (
    accessible_property_ids_for_portfolio,
    can_create_properties,
    require_property_access,
    require_unit_access,
    resolve_portfolio,
)
from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.pagination import apply_desc_cursor, page_size, paginate_desc

router = APIRouter(prefix="/properties", tags=["properties"])

PROPERTY_FIELDS = {"name", "address", "type", "latitude", "longitude"}
UNIT_FIELDS = {
    "label",
    "rent_amount",
    "frequency",
    "tenant_name",
    "tenant_contact",
    "due_day",
    "due_month",
    "service_charge_amount",
    "term_end",
}

# Status needs recent paid rows only — not full payment history per list fetch.
# order/limit must be query params (foreign_table=...), not inside select — PGRST100.
_TXN_EMBED = "transactions(status, amount, paid_at, created_at, charge_type)"
UNITS_WITH_RECENT_TXNS = f"units(*, {_TXN_EMBED})"
UNIT_WITH_RECENT_TXNS = f"*, {_TXN_EMBED}"
_RECENT_TXN_LIMIT = 36


def _order_recent_txns(query, *, nested_under_units: bool = False):
    """Newest-first cap on embedded transactions (PostgREST foreign_table mods)."""
    foreign = "units.transactions" if nested_under_units else "transactions"
    return query.order(
        "created_at", desc=True, foreign_table=foreign
    ).limit(_RECENT_TXN_LIMIT, foreign_table=foreign)


def _optional_coord(value: object) -> float | None:
    """Parse optional lat/lng; blank/invalid values become None (not required)."""
    if value is None or value == "":
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _sanitize_property_payload(payload: dict) -> dict:
    body = {k: payload[k] for k in PROPERTY_FIELDS if k in payload}
    if "latitude" in body or "longitude" in body:
        lat = _optional_coord(body.get("latitude"))
        lng = _optional_coord(body.get("longitude"))
        # Store coordinates only as a complete pair; never block on missing coords.
        if lat is None or lng is None:
            body["latitude"] = None
            body["longitude"] = None
        else:
            body["latitude"] = lat
            body["longitude"] = lng
    return body


def _portfolio_owner(
    x_portfolio_owner_id: str | None = Header(
        default=None, alias="X-Portfolio-Owner-Id"
    ),
    owner_id: str | None = Query(default=None),
) -> str | None:
    return (owner_id or x_portfolio_owner_id or "").strip() or None


def _db_for_ctx(user: AuthedUser, ctx):
    """Owners use RLS user client; staff reads/writes via service role after ACL."""
    if ctx.role == "owner":
        return user.db
    return create_service_client()


def _owned_property(user: AuthedUser, property_id: str) -> dict | None:
    """Backward-compatible owner-only lookup (Owner path unchanged)."""
    rows = (
        user.db.table("properties")
        .select("*")
        .eq("id", property_id)
        .eq("owner_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _accessible_property(user: AuthedUser, property_id: str) -> dict | None:
    try:
        require_property_access(user.id, property_id)
    except HTTPException:
        return None
    rows = (
        create_service_client()
        .table("properties")
        .select("*")
        .eq("id", property_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _normalize_unit_embed(row: dict) -> dict:
    unit = dict(row)
    if unit.get("transactions") is None:
        unit["transactions"] = []
    return unit


def _serialize_portfolio_unit(row: dict) -> dict:
    unit = _normalize_unit_embed(row)
    prop = unit.pop("properties", None) or {}
    return {
        "unit": unit,
        "property_id": prop.get("id") or unit.get("property_id"),
        "property_name": prop.get("name") or "",
    }


def _owned_unit(user: AuthedUser, unit_id: str) -> dict | None:
    rows = (
        user.db.table("units")
        .select("*, properties!inner(id, name, owner_id)")
        .eq("id", unit_id)
        .eq("properties.owner_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _accessible_unit(user: AuthedUser, unit_id: str) -> dict | None:
    try:
        require_unit_access(user.id, unit_id)
    except HTTPException:
        return None
    rows = (
        create_service_client()
        .table("units")
        .select("*, properties!inner(id, name, owner_id)")
        .eq("id", unit_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


@router.get("/portfolio/units")
def list_portfolio_units(
    user: AuthedUser = Depends(get_current_user),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=50),
    portfolio_owner_id: str | None = Depends(_portfolio_owner),
):
    """Paginated units across the portfolio (flat list for dashboard / reminders)."""
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    db = _db_for_ctx(user, ctx)
    property_ids = accessible_property_ids_for_portfolio(ctx)
    size = page_size(limit)
    query = (
        db.table("units")
        .select(
            f"{UNIT_WITH_RECENT_TXNS}, properties!inner(id, name, owner_id)"
        )
        .eq("properties.owner_id", ctx.owner_id)
        .order("created_at", desc=True)
        .order("id", desc=True)
    )
    if property_ids:
        query = query.in_("property_id", property_ids)
    else:
        return {"items": [], "next_cursor": None}
    query = _order_recent_txns(query)
    query = apply_desc_cursor(query, cursor)
    rows = query.limit(size + 1).execute().data or []
    page, next_cursor = paginate_desc(rows, size)
    items = [_serialize_portfolio_unit(dict(row)) for row in page]
    return {"items": items, "next_cursor": next_cursor}


@router.get("/")
def list_properties(
    user: AuthedUser = Depends(get_current_user),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=50),
    portfolio_owner_id: str | None = Depends(_portfolio_owner),
):
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    db = _db_for_ctx(user, ctx)
    property_ids = accessible_property_ids_for_portfolio(ctx)
    size = page_size(limit)
    query = (
        db.table("properties")
        .select(f"*, {UNITS_WITH_RECENT_TXNS}")
        .eq("owner_id", ctx.owner_id)
        .order("created_at", desc=True)
        .order("id", desc=True)
    )
    if property_ids:
        query = query.in_("id", property_ids)
    else:
        return {"items": [], "next_cursor": None}
    query = _order_recent_txns(query, nested_under_units=True)
    query = apply_desc_cursor(query, cursor)
    rows = query.limit(size + 1).execute().data or []
    items, next_cursor = paginate_desc(rows, size)
    for item in items:
        units = item.get("units")
        if units is None:
            item["units"] = []
        else:
            item["units"] = [_normalize_unit_embed(u) for u in units]
    return {"items": items, "next_cursor": next_cursor}


@router.get("/units/{unit_id}")
def get_unit(unit_id: str, user: AuthedUser = Depends(get_current_user)):
    """Single unit + property name for detail pages (avoids loading every property)."""
    unit_row = _accessible_unit(user, unit_id) or _owned_unit(user, unit_id)
    if not unit_row:
        raise HTTPException(status_code=404, detail="Unit not found")

    unit = dict(unit_row)
    property_row = unit.pop("properties", None) or {}

    return {
        "unit": unit,
        "propertyName": property_row.get("name") or "",
        "propertyId": property_row.get("id") or unit.get("property_id"),
    }


@router.patch("/units/{unit_id}")
def update_unit(
    unit_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    ctx = require_unit_access(user.id, unit_id)
    if ctx.role != "owner":
        raise HTTPException(
            status_code=403, detail="Only the owner can edit unit fields"
        )

    updates = {k: v for k, v in payload.items() if k in UNIT_FIELDS}
    if "service_charge_amount" in updates and updates["service_charge_amount"] in (
        "",
        None,
    ):
        updates["service_charge_amount"] = None
    if "term_end" in updates and updates["term_end"] in ("", None):
        updates["term_end"] = None
    if "due_month" in updates and updates["due_month"] in ("", None):
        updates["due_month"] = None
    freq = updates.get("frequency")
    if freq is not None and freq != "annual":
        updates["due_month"] = None
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    rows = (
        user.db.table("units").update(updates).eq("id", unit_id).execute().data or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Unit not found")
    return rows[0]


@router.delete("/units/{unit_id}")
def delete_unit(unit_id: str, user: AuthedUser = Depends(get_current_user)):
    ctx = require_unit_access(user.id, unit_id)
    if ctx.role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can delete units")

    user.db.table("reminders").delete().eq("unit_id", unit_id).execute()
    user.db.table("transactions").delete().eq("unit_id", unit_id).execute()
    user.db.table("units").delete().eq("id", unit_id).execute()
    return {"ok": True, "id": unit_id}


@router.get("/{property_id}/units")
def list_property_units(
    property_id: str,
    user: AuthedUser = Depends(get_current_user),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=50),
):
    ctx = require_property_access(user.id, property_id)
    db = _db_for_ctx(user, ctx)

    size = page_size(limit)
    query = (
        db.table("units")
        .select(UNIT_WITH_RECENT_TXNS)
        .eq("property_id", property_id)
        .order("created_at", desc=True)
        .order("id", desc=True)
    )
    query = _order_recent_txns(query)
    query = apply_desc_cursor(query, cursor)
    rows = query.limit(size + 1).execute().data or []
    items, next_cursor = paginate_desc(rows, size)
    return {
        "items": [_normalize_unit_embed(dict(row)) for row in items],
        "next_cursor": next_cursor,
    }


@router.get("/{property_id}")
def get_property(property_id: str, user: AuthedUser = Depends(get_current_user)):
    prop = _accessible_property(user, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.post("/")
def create_property(payload: dict, user: AuthedUser = Depends(get_current_user)):
    ctx = resolve_portfolio(user.id, None)
    if not can_create_properties(ctx) or ctx.owner_id != user.id:
        raise HTTPException(
            status_code=403, detail="Only owners can create properties"
        )
    body = _sanitize_property_payload(payload)
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Property name is required")
    body["name"] = name
    if "address" in body and isinstance(body["address"], str):
        body["address"] = body["address"].strip() or None
    body["owner_id"] = user.id
    return user.db.table("properties").insert(body).execute().data


@router.patch("/{property_id}")
def update_property(
    property_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    if not _owned_property(user, property_id):
        raise HTTPException(status_code=404, detail="Property not found")

    updates = _sanitize_property_payload(payload)
    if "name" in updates:
        name = str(updates.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Property name is required")
        updates["name"] = name
    if "address" in updates and isinstance(updates["address"], str):
        updates["address"] = updates["address"].strip() or None
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    rows = (
        user.db.table("properties")
        .update(updates)
        .eq("id", property_id)
        .eq("owner_id", user.id)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Property not found")
    return rows[0]


@router.delete("/{property_id}")
def delete_property(property_id: str, user: AuthedUser = Depends(get_current_user)):
    if not _owned_property(user, property_id):
        raise HTTPException(status_code=404, detail="Property not found")

    units = (
        user.db.table("units")
        .select("id")
        .eq("property_id", property_id)
        .execute()
        .data
        or []
    )
    unit_ids = [u["id"] for u in units if u.get("id")]
    if unit_ids:
        for unit_id in unit_ids:
            user.db.table("reminders").delete().eq("unit_id", unit_id).execute()
            user.db.table("transactions").delete().eq("unit_id", unit_id).execute()
        user.db.table("units").delete().eq("property_id", property_id).execute()

    user.db.table("properties").delete().eq("id", property_id).eq(
        "owner_id", user.id
    ).execute()
    return {"ok": True, "id": property_id}


@router.post("/{property_id}/units")
def add_unit(
    property_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    if not _owned_property(user, property_id):
        raise HTTPException(status_code=404, detail="Property not found")

    body = {k: v for k, v in payload.items() if k in UNIT_FIELDS}
    if body.get("service_charge_amount") in ("", None):
        body["service_charge_amount"] = None
    if body.get("term_end") in ("", None):
        body["term_end"] = None
    if body.get("due_month") in ("", None):
        body["due_month"] = None
    if body.get("frequency") != "annual":
        body["due_month"] = None
    body["property_id"] = property_id
    return user.db.table("units").insert(body).execute().data
