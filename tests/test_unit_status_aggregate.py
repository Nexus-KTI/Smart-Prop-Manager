"""Properties-list status aggregates worst charge type (mirrors web/lib/dashboard.ts)."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Any, Literal

ChargeStatus = Literal["PAID", "OVERDUE", "DUE SOON", "PENDING"]
DUE_SOON_DAYS = 7
STATUS_RANK = {"OVERDUE": 3, "DUE SOON": 2, "PENDING": 1, "PAID": 0}


def _to_number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _txn_charge_type(txn: dict) -> str:
    raw = str(txn.get("charge_type") or "rent").strip().lower()
    if raw in {"service_charge", "other"}:
        return raw
    return "rent"


def _due_date_for_unit(unit: dict, today: date) -> date | None:
    freq = str(unit.get("frequency") or "monthly").strip().lower()
    raw = unit.get("due_day")
    if freq == "daily":
        return today
    if raw is None:
        return None
    try:
        due_day = int(raw)
    except (TypeError, ValueError):
        return None
    if due_day < 1:
        return None
    if freq == "weekly":
        # due_day 1–7 → Sun=0 … Sat=6
        target = (due_day - 1) % 7
        js_weekday = (today.weekday() + 1) % 7
        delta = (target - js_weekday + 7) % 7
        return today + timedelta(days=delta)
    if freq == "annual":
        try:
            due_month = int(unit.get("due_month") or 1)
        except (TypeError, ValueError):
            due_month = 1
        if due_month < 1 or due_month > 12:
            due_month = 1
        last = calendar.monthrange(today.year, due_month)[1]
        return date(today.year, due_month, min(due_day, last))
    last = calendar.monthrange(today.year, today.month)[1]
    return date(today.year, today.month, min(due_day, last))


def _parse_txn_day(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _paid_in_current_period(
    unit: dict, transactions: list[dict], today: date, charge_type: str
) -> bool:
    matching = [t for t in transactions if _txn_charge_type(t) == charge_type]
    due = _due_date_for_unit(unit, today)
    if due is None:
        return any(
            t.get("status") == "paid"
            and (d := _parse_txn_day(t.get("paid_at") or t.get("created_at")))
            and (
                d.year == today.year
                if str(unit.get("frequency") or "").lower() == "annual"
                else d.year == today.year and d.month == today.month
            )
            for t in matching
        )
    freq = str(unit.get("frequency") or "monthly").strip().lower()
    if freq == "annual":
        start = date(due.year, 1, 1)
        end = date(due.year, 12, 31)
    else:
        # monthly period: calendar month of due date
        start = date(due.year, due.month, 1)
        last = calendar.monthrange(due.year, due.month)[1]
        end = date(due.year, due.month, last)
    for t in matching:
        if t.get("status") != "paid":
            continue
        paid = _parse_txn_day(t.get("paid_at") or t.get("created_at"))
        if paid and start <= paid <= end:
            return True
    return False


def resolve_charge_status(
    unit: dict,
    transactions: list[dict],
    charge_type: str,
    today: date,
) -> ChargeStatus:
    matching = [t for t in transactions if _txn_charge_type(t) == charge_type]
    if _paid_in_current_period(unit, transactions, today, charge_type):
        return "PAID"
    if any(t.get("status") == "overdue" for t in matching):
        return "OVERDUE"
    due = _due_date_for_unit(unit, today)
    if due and due < today:
        return "OVERDUE"
    if due:
        days = (due - today).days
        if 0 <= days <= DUE_SOON_DAYS:
            return "DUE SOON"
    return "PENDING"


def resolve_unit_status(
    unit: dict, transactions: list[dict], today: date
) -> ChargeStatus:
    """Worst status across rent + configured service charge (not one-off other)."""
    statuses = [resolve_charge_status(unit, transactions, "rent", today)]
    if _to_number(unit.get("service_charge_amount")) > 0:
        statuses.append(
            resolve_charge_status(unit, transactions, "service_charge", today)
        )
    worst: ChargeStatus = "PAID"
    for status in statuses:
        if STATUS_RANK[status] > STATUS_RANK[worst]:
            worst = status
    return worst


def _unit_fixture(**overrides: Any) -> dict:
    base = {
        "id": "u1",
        "label": "Flat 1",
        "rent_amount": 100_000,
        "service_charge_amount": 10_000,
        "frequency": "monthly",
        "due_day": 1,
    }
    base.update(overrides)
    return base


def test_rent_paid_service_overdue_shows_overdue():
    # Mid-month: due day 1 already passed → unpaid service charge is OVERDUE.
    today = date(2026, 8, 15)
    unit = _unit_fixture()
    txns = [
        {
            "charge_type": "rent",
            "status": "paid",
            "paid_at": "2026-08-01T10:00:00+00:00",
            "amount": 100_000,
        }
    ]
    assert resolve_charge_status(unit, txns, "rent", today) == "PAID"
    assert resolve_charge_status(unit, txns, "service_charge", today) == "OVERDUE"
    assert resolve_unit_status(unit, txns, today) == "OVERDUE"


def test_all_paid_stays_paid():
    today = date(2026, 8, 15)
    unit = _unit_fixture()
    txns = [
        {
            "charge_type": "rent",
            "status": "paid",
            "paid_at": "2026-08-01T10:00:00+00:00",
        },
        {
            "charge_type": "service_charge",
            "status": "paid",
            "paid_at": "2026-08-01T10:00:00+00:00",
        },
    ]
    assert resolve_unit_status(unit, txns, today) == "PAID"


def test_rent_paid_service_due_soon_shows_due_soon():
    # Due day = today → DUE SOON window (0 days).
    today = date(2026, 8, 1)
    unit = _unit_fixture(due_day=1)
    txns = [
        {
            "charge_type": "rent",
            "status": "paid",
            "paid_at": "2026-08-01T10:00:00+00:00",
        }
    ]
    assert resolve_charge_status(unit, txns, "rent", today) == "PAID"
    assert resolve_charge_status(unit, txns, "service_charge", today) == "DUE SOON"
    assert resolve_unit_status(unit, txns, today) == "DUE SOON"


def test_other_without_due_does_not_force_overdue():
    today = date(2026, 8, 15)
    unit = _unit_fixture(service_charge_amount=None)
    txns = [
        {
            "charge_type": "rent",
            "status": "paid",
            "paid_at": "2026-08-01T10:00:00+00:00",
        },
        {
            "charge_type": "other",
            "charge_label": "Generator",
            "status": "paid",
            "paid_at": "2026-07-01T10:00:00+00:00",
        },
    ]
    assert resolve_unit_status(unit, txns, today) == "PAID"


def test_no_service_charge_stays_rent_only():
    today = date(2026, 8, 15)
    unit = _unit_fixture(service_charge_amount=0)
    txns: list[dict] = []
    assert resolve_unit_status(unit, txns, today) == "OVERDUE"
