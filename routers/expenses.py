"""Money-out expenses + scheduled fees + rent-roll report."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user

router = APIRouter(tags=["expenses"])

VALID_EXPENSE_CATS = frozenset(
    {"repairs", "utilities", "security", "service_charge", "tax", "agency", "other"}
)
VALID_FEE_TYPES = frozenset({"service_charge", "other"})
VALID_FEE_STATUS = frozenset({"due", "paid", "waived", "canceled"})


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


def _money(value: Any) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid amount") from exc
    if amount < 0:
        raise HTTPException(status_code=400, detail="Amount must be >= 0")
    return amount.quantize(Decimal("0.01"))


def _require_owned_unit(user: AuthedUser, unit_id: str) -> dict:
    rows = (
        user.db.table("units")
        .select("id, property_id, properties!inner(owner_id)")
        .eq("id", unit_id)
        .eq("properties.owner_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Unit not found")
    return dict(rows[0])


@router.get("/expenses")
def list_expenses(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("expenses")
        .select("*")
        .eq("landlord_id", user.id)
        .order("paid_on", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
def create_expense(payload: dict, user: AuthedUser = Depends(get_current_user)):
    category = (payload.get("category") or "other").strip().lower()
    if category not in VALID_EXPENSE_CATS:
        raise HTTPException(status_code=400, detail="Invalid category")
    amount = _money(payload.get("amount"))
    paid_on = (payload.get("paid_on") or date.today().isoformat()).strip()
    property_id = payload.get("property_id") or None
    unit_id = payload.get("unit_id") or None
    if unit_id:
        unit = _require_owned_unit(user, unit_id)
        property_id = unit["property_id"]
    elif property_id:
        props = (
            user.db.table("properties")
            .select("id")
            .eq("id", property_id)
            .eq("owner_id", user.id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not props:
            raise HTTPException(status_code=404, detail="Property not found")

    row = {
        "landlord_id": user.id,
        "property_id": property_id,
        "unit_id": unit_id,
        "category": category,
        "amount": float(amount),
        "currency": (payload.get("currency") or "NGN").strip().upper()[:3],
        "paid_on": paid_on,
        "vendor": ((payload.get("vendor") or "").strip() or None),
        "notes": ((payload.get("notes") or "").strip() or None),
    }
    if row["vendor"] and len(row["vendor"]) > 120:
        raise HTTPException(status_code=400, detail="Vendor too long")
    inserted = user.db.table("expenses").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create expense")
    return {"item": created}


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: str, user: AuthedUser = Depends(get_current_user)):
    user.db.table("expenses").delete().eq("id", expense_id).eq(
        "landlord_id", user.id
    ).execute()
    return {"ok": True}


@router.get("/fees/unit/{unit_id}")
def list_unit_fees(unit_id: str, user: AuthedUser = Depends(get_current_user)):
    _require_owned_unit(user, unit_id)
    rows = (
        user.db.table("scheduled_fees")
        .select("*")
        .eq("unit_id", unit_id)
        .eq("landlord_id", user.id)
        .order("due_on", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.post("/fees/unit/{unit_id}", status_code=status.HTTP_201_CREATED)
def create_unit_fee(
    unit_id: str, payload: dict, user: AuthedUser = Depends(get_current_user)
):
    _require_owned_unit(user, unit_id)
    label = (payload.get("label") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    amount = _money(payload.get("amount"))
    due_on = (payload.get("due_on") or "").strip()
    if not due_on:
        raise HTTPException(status_code=400, detail="due_on is required")
    charge_type = (payload.get("charge_type") or "other").strip().lower()
    if charge_type not in VALID_FEE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid charge_type")
    tenancy_id = payload.get("tenancy_id") or None
    row = {
        "landlord_id": user.id,
        "unit_id": unit_id,
        "tenancy_id": tenancy_id,
        "label": label[:120],
        "amount": float(amount),
        "currency": (payload.get("currency") or "NGN").strip().upper()[:3],
        "due_on": due_on,
        "charge_type": charge_type,
        "status": "due",
    }
    inserted = user.db.table("scheduled_fees").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create fee")
    return {"item": created}


@router.patch("/fees/{fee_id}")
def update_fee(fee_id: str, payload: dict, user: AuthedUser = Depends(get_current_user)):
    next_status = (payload.get("status") or "").strip().lower()
    if next_status not in VALID_FEE_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")
    rows = (
        user.db.table("scheduled_fees")
        .select("*")
        .eq("id", fee_id)
        .eq("landlord_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Fee not found")
    updated = (
        user.db.table("scheduled_fees")
        .update({"status": next_status})
        .eq("id", fee_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    return {"item": _first_row(updated) or {**rows[0], "status": next_status}}


@router.get("/fees/me")
def list_my_fees(user: AuthedUser = Depends(get_current_user)):
    tenancies = (
        user.db.table("tenancies")
        .select("unit_id")
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .limit(20)
        .execute()
        .data
        or []
    )
    unit_ids = [t["unit_id"] for t in tenancies if t.get("unit_id")]
    if not unit_ids:
        return {"items": []}
    rows = (
        user.db.table("scheduled_fees")
        .select("*")
        .in_("unit_id", unit_ids)
        .in_("status", ["due", "paid"])
        .order("due_on")
        .limit(100)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.get("/reports/rent-roll")
def rent_roll(user: AuthedUser = Depends(get_current_user)):
    """Simple rent roll: units + active/pending tenancy + last payment."""
    units = (
        user.db.table("units")
        .select(
            "id, label, rent_amount, frequency, property_id, "
            "properties!inner(owner_id, name)"
        )
        .eq("properties.owner_id", user.id)
        .order("label")
        .limit(500)
        .execute()
        .data
        or []
    )
    unit_ids = [u["id"] for u in units]
    tenancy_by_unit: dict[str, dict] = {}
    if unit_ids:
        tenancies = (
            user.db.table("tenancies")
            .select(
                "id, unit_id, status, tenant_name, tenant_contact, tenant_user_id, term_end"
            )
            .eq("landlord_id", user.id)
            .in_("status", ["active", "pending_verification", "draft"])
            .in_("unit_id", unit_ids)
            .limit(500)
            .execute()
            .data
            or []
        )
        for t in tenancies:
            uid = t.get("unit_id")
            if uid and uid not in tenancy_by_unit:
                tenancy_by_unit[uid] = t
            elif uid and t.get("status") == "active":
                tenancy_by_unit[uid] = t

    rows_out = []
    for u in units:
        prop = u.get("properties") or {}
        t = tenancy_by_unit.get(u["id"])
        rows_out.append(
            {
                "unit_id": u["id"],
                "unit_label": u.get("label"),
                "property_name": prop.get("name") if isinstance(prop, dict) else None,
                "rent_amount": u.get("rent_amount"),
                "currency": "NGN",
                "frequency": u.get("frequency"),
                "tenancy_status": t.get("status") if t else None,
                "tenant_name": t.get("tenant_name") if t else None,
                "tenant_contact": t.get("tenant_contact") if t else None,
                "term_end": t.get("term_end") if t else None,
            }
        )

    expense_sum = 0.0
    expenses = (
        user.db.table("expenses")
        .select("amount")
        .eq("landlord_id", user.id)
        .gte("paid_on", date.today().replace(day=1).isoformat())
        .limit(500)
        .execute()
        .data
        or []
    )
    for e in expenses:
        try:
            expense_sum += float(e.get("amount") or 0)
        except (TypeError, ValueError):
            pass

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "items": rows_out,
        "month_expenses_total": round(expense_sum, 2),
        "occupied": sum(1 for r in rows_out if r.get("tenancy_status") == "active"),
        "vacant": sum(1 for r in rows_out if not r.get("tenancy_status")),
    }
