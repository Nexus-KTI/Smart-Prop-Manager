"""Dashboard overview from the portfolio snapshot: counts, overdue money, property cards."""

from __future__ import annotations

from datetime import date
from typing import Any

from lib.unit_status import _parse_txn_day as lagos_day
from lib.unit_status import (
    charge_breakdown,
    due_date_for_unit,
    next_due_date_for_unit,
)

_CARD_RANK = {"overdue": 0, "due-soon": 1, "occupied": 2, "vacant": 3, "empty": 4}


def is_occupied(unit: dict) -> bool:
    return bool(str(unit.get("tenant_name") or "").strip())


def _unit_view(unit: dict, today: date) -> dict[str, Any]:
    """Overdue / due-soon money is what is left this period after part payments."""
    lines = list(charge_breakdown(unit, unit.get("transactions") or [], today).values())
    overdue = sum(line["remaining"] for line in lines if line["status"] == "OVERDUE")
    due_soon = sum(line["remaining"] for line in lines if line["status"] == "DUE SOON")
    paid = all(line["status"] == "PAID" for line in lines)
    next_due = next_due_date_for_unit(unit, today) if paid else due_date_for_unit(unit, today)
    return {
        "occupied": is_occupied(unit),
        "overdue": overdue,
        "due_soon": due_soon,
        "is_overdue": any(line["status"] == "OVERDUE" for line in lines),
        "is_due_soon": any(line["status"] == "DUE SOON" for line in lines),
        "full": sum(line["expected"] for line in lines),
        "next_due": next_due,
    }


def _card(prop: dict, units: list[dict], today: date) -> dict[str, Any]:
    views = [_unit_view(unit, today) for unit in units]
    occupied = [view for view in views if view["occupied"]]
    overdue = [view for view in occupied if view["is_overdue"]]
    due_soon = [view for view in occupied if view["is_due_soon"]]
    next_due: date | None = None
    if not units:
        status, amount = "empty", None
    elif overdue:
        status, amount = "overdue", sum(view["overdue"] for view in overdue)
    elif due_soon:
        status, amount = "due-soon", sum(view["due_soon"] for view in due_soon)
    elif not occupied:
        status, amount = "vacant", sum(view["full"] for view in views)
    else:
        status = "occupied"
        dated = sorted((v for v in occupied if v["next_due"]), key=lambda v: v["next_due"])
        if dated:
            amount, next_due = dated[0]["full"], dated[0]["next_due"]
        else:
            amount = sum(view["full"] for view in occupied)
    photo = next((u.get("photo_url") for u in units if str(u.get("photo_url") or "").strip()), None)
    return {
        "id": prop.get("id"),
        "name": str(prop.get("name") or "").strip() or "Untitled property",
        "address": str(prop.get("address") or "").strip() or None,
        "photo_url": photo,
        "units": len(units),
        "occupied": len(occupied),
        "status": status,
        "amount": amount,
        "next_due": next_due.isoformat() if next_due else None,
    }


def build_portfolio_overview(
    properties: list[dict],
    snapshot_rows: list[dict],
    *,
    today: date,
    capped: bool = False,
) -> dict[str, Any]:
    """Overdue = unpaid rent/service charge past due this period on let units only."""
    units_by_property: dict[str, list[dict]] = {}
    for row in snapshot_rows:
        unit = row["unit"]
        units_by_property.setdefault(str(row.get("property_id") or ""), []).append(unit)

    overdue_amount = due_week_amount = 0.0
    overdue_units = due_week_units = occupied_total = unit_total = 0
    for units in units_by_property.values():
        for unit in units:
            unit_total += 1
            if not is_occupied(unit):
                continue
            occupied_total += 1
            view = _unit_view(unit, today)
            if view["is_overdue"]:
                overdue_units += 1
                overdue_amount += view["overdue"]
            if view["is_due_soon"]:
                due_week_units += 1
                due_week_amount += view["due_soon"]

    cards = [_card(prop, units_by_property.get(str(prop.get("id")), []), today) for prop in properties]
    cards.sort(key=lambda card: (_CARD_RANK[card["status"]], card["name"].casefold()))
    return {
        "property_count": len(properties),
        "unit_count": unit_total,
        "occupied": occupied_total,
        "vacant": unit_total - occupied_total,
        "overdue_amount": overdue_amount,
        "overdue_units": overdue_units,
        "due_week_amount": due_week_amount,
        "due_week_units": due_week_units,
        "new_this_month": sum(
            1
            for prop in properties
            if (created := lagos_day(prop.get("created_at")))
            and (created.year, created.month) == (today.year, today.month)
        ),
        "properties": cards,
        "capped": capped,
    }
