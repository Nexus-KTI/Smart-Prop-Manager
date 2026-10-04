"""Landlord Action Needed queue — overdue chase, lease ending, failed sends."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from lib.unit_status import (
    days_until_term_end,
    due_date_for_unit,
    lagos_today,
    resolve_unit_status,
)

ActionKind = Literal[
    "overdue_chase",
    "overdue_no_contact",
    "due_soon",
    "lease_ending",
    "chase_failed",
]

LEASE_ENDING_DAYS = 60
LEASE_ENDING_SOON_BOOST_DAYS = 14
FAILED_LOOKBACK_DAYS = 14
PORTFOLIO_MAX_UNITS = 5000
# Enough history for the current period's status; same cap as the property pages
# and the window portfolio_unit_snapshot (sql/055) reads.
RECENT_TXN_LIMIT = 36

# Higher = more urgent
_PRIORITY = {
    "chase_failed_overdue": 100,
    "chase_failed": 90,
    "overdue_chase": 80,
    "overdue_no_contact": 70,
    "lease_ending_soon": 60,
    "lease_ending": 50,
    "due_soon": 40,
}


def _has_contact(unit: dict) -> bool:
    return bool((unit.get("tenant_contact") or "").strip())


def _priority_for(
    kind: ActionKind, *, overdue: bool = False, days_left: int | None = None
) -> int:
    if kind == "chase_failed":
        return (
            _PRIORITY["chase_failed_overdue"]
            if overdue
            else _PRIORITY["chase_failed"]
        )
    if kind == "lease_ending":
        if days_left is not None and days_left <= LEASE_ENDING_SOON_BOOST_DAYS:
            return _PRIORITY["lease_ending_soon"]
        return _PRIORITY["lease_ending"]
    return _PRIORITY.get(kind, 0)


def _detail_for(
    kind: ActionKind,
    *,
    unit: dict,
    today: date,
    days_left: int | None,
    error_detail: str | None,
) -> str:
    if kind in {"overdue_chase", "overdue_no_contact"}:
        due = due_date_for_unit(unit, today)
        if due and due < today:
            days = (today - due).days
            return f"{days} day{'s' if days != 1 else ''} overdue"
        return "Past due"
    if kind == "due_soon":
        due = due_date_for_unit(unit, today)
        if due:
            days = (due - today).days
            if days == 0:
                return "Due today"
            return f"Due in {days} day{'s' if days != 1 else ''}"
        return "Due soon"
    if kind == "lease_ending":
        if days_left is None:
            return "Lease ending soon"
        if days_left < 0:
            return f"Term ended {abs(days_left)} day{'s' if days_left != -1 else ''} ago"
        if days_left == 0:
            return "Term ends today"
        return f"Term ends in {days_left} day{'s' if days_left != 1 else ''}"
    if kind == "chase_failed":
        return (error_detail or "").strip() or "Last chase failed — retry"
    return ""


def _item(
    *,
    unit: dict,
    property_name: str,
    property_id: str | None,
    kind: ActionKind,
    today: date,
    days_left: int | None = None,
    overdue: bool = False,
    reminder_id: str | None = None,
    error_detail: str | None = None,
) -> dict[str, Any]:
    unit_id = str(unit.get("id") or "")
    return {
        "id": f"{kind}:{unit_id}"
        + (f":{reminder_id}" if reminder_id else ""),
        "kind": kind,
        "priority": _priority_for(kind, overdue=overdue, days_left=days_left),
        "unit_id": unit_id,
        "property_id": property_id,
        "property_name": property_name or "",
        "unit_label": (unit.get("label") or "").strip() or "Unit",
        "tenant_name": (unit.get("tenant_name") or "").strip() or None,
        "tenant_contact": (unit.get("tenant_contact") or "").strip() or None,
        "detail": _detail_for(
            kind,
            unit=unit,
            today=today,
            days_left=days_left,
            error_detail=error_detail,
        ),
        "reminder_id": reminder_id,
        "days_until_term_end": days_left,
        "payment_status": resolve_unit_status(
            unit, unit.get("transactions") or [], today
        ),
    }


def _normalize_snapshot_row(row: dict[str, Any]) -> dict[str, Any]:
    unit = dict(row)
    property_name = unit.pop("property_name", None) or ""
    failed = unit.pop("failed_reminder", None)
    unit["transactions"] = unit.get("transactions") or []
    return {
        "unit": unit,
        "property_id": unit.get("property_id"),
        "property_name": property_name,
        "failed_reminder": failed if isinstance(failed, dict) else None,
    }


def load_portfolio_snapshot(
    db,
    *,
    owner_id: str,
    property_ids: list[str],
    today: date,
    max_units: int = PORTFOLIO_MAX_UNITS,
) -> list[dict[str, Any]]:
    """Every unit in scope with its status-deciding transactions, in one call (sql/055)."""
    if not property_ids:
        return []
    since = datetime.combine(
        today - timedelta(days=FAILED_LOOKBACK_DAYS),
        datetime.min.time(),
        tzinfo=timezone.utc,
    ).isoformat()
    data = (
        db.rpc(
            "portfolio_unit_snapshot",
            {
                "p_owner_id": owner_id,
                "p_property_ids": property_ids,
                "p_failed_since": since,
                "p_max_units": max_units,
            },
        )
        .execute()
        .data
    )
    rows = data if isinstance(data, list) else []
    return [_normalize_snapshot_row(row) for row in rows if isinstance(row, dict)]


def failed_reminders_by_unit(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        str(row["unit"].get("id")): row["failed_reminder"]
        for row in rows
        if row.get("failed_reminder") and row["unit"].get("id")
    }


def build_urgent_actions(
    portfolio_rows: list[dict[str, Any]],
    failed_by_unit: dict[str, dict[str, Any]],
    *,
    today: date | None = None,
) -> list[dict[str, Any]]:
    """Pure ranking from portfolio rows + failed reminder map (testable)."""
    day = today or lagos_today()
    items: list[dict[str, Any]] = []

    for row in portfolio_rows:
        unit = row["unit"]
        property_name = row.get("property_name") or ""
        property_id = row.get("property_id")
        unit_id = str(unit.get("id") or "")
        if not unit_id:
            continue

        txns = unit.get("transactions") or []
        status = resolve_unit_status(unit, txns, day)
        contact = _has_contact(unit)
        days_left = days_until_term_end(unit, day)
        # Nobody owes rent on a vacant unit, so it is never chased as overdue or due.
        let = bool((unit.get("tenant_name") or "").strip())
        overdue = let and status == "OVERDUE"

        if overdue:
            kind: ActionKind = (
                "overdue_chase" if contact else "overdue_no_contact"
            )
            items.append(
                _item(
                    unit=unit,
                    property_name=property_name,
                    property_id=property_id,
                    kind=kind,
                    today=day,
                    overdue=True,
                )
            )
        elif let and status == "DUE SOON":
            items.append(
                _item(
                    unit=unit,
                    property_name=property_name,
                    property_id=property_id,
                    kind="due_soon",
                    today=day,
                )
            )

        if days_left is not None and 0 <= days_left <= LEASE_ENDING_DAYS:
            items.append(
                _item(
                    unit=unit,
                    property_name=property_name,
                    property_id=property_id,
                    kind="lease_ending",
                    today=day,
                    days_left=days_left,
                )
            )

        failed = failed_by_unit.get(unit_id)
        if failed:
            items.append(
                _item(
                    unit=unit,
                    property_name=property_name,
                    property_id=property_id,
                    kind="chase_failed",
                    today=day,
                    overdue=overdue,
                    reminder_id=str(failed.get("id") or "") or None,
                    error_detail=failed.get("error_detail"),
                )
            )

    items.sort(
        key=lambda it: (
            -int(it.get("priority") or 0),
            str(it.get("property_name") or ""),
            str(it.get("unit_label") or ""),
            str(it.get("kind") or ""),
        )
    )
    return items


def summarize_actions(items: list[dict[str, Any]]) -> dict[str, int]:
    overdue = sum(
        1
        for it in items
        if it.get("kind") in {"overdue_chase", "overdue_no_contact"}
    )
    lease_ending = sum(1 for it in items if it.get("kind") == "lease_ending")
    failed = sum(1 for it in items if it.get("kind") == "chase_failed")
    due_soon = sum(1 for it in items if it.get("kind") == "due_soon")
    return {
        "urgent": len(items),
        "overdue": overdue,
        "lease_ending": lease_ending,
        "failed": failed,
        "due_soon": due_soon,
    }


def collect_urgent_actions_for_owner(
    db,
    *,
    owner_id: str,
    property_ids: list[str],
    today: date | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    day = today or lagos_today()
    portfolio = load_portfolio_snapshot(
        db, owner_id=owner_id, property_ids=property_ids, today=day
    )
    items = build_urgent_actions(portfolio, failed_reminders_by_unit(portfolio), today=day)
    return items, summarize_actions(items)
