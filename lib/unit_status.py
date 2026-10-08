"""Unit payment status (mirrors web/lib/dashboard.ts resolveUnitStatus)."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

ChargeStatus = Literal["PAID", "OVERDUE", "DUE SOON", "PENDING"]
DUE_SOON_DAYS = 7
PAID_TOLERANCE = 0.5
STATUS_RANK = {"OVERDUE": 3, "DUE SOON": 2, "PENDING": 1, "PAID": 0}
LAGOS = ZoneInfo("Africa/Lagos")


def lagos_today() -> date:
    """Landlords' calendar day (the web resolves status in the browser's Lagos time)."""
    return datetime.now(LAGOS).date()


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


def due_date_for_unit(unit: dict, today: date) -> date | None:
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


def next_due_date_for_unit(unit: dict, today: date) -> date | None:
    """The due date of the period after the current one (mirrors nextDueDateForUnit)."""
    current = due_date_for_unit(unit, today)
    if current is None:
        return None
    freq = str(unit.get("frequency") or "monthly").strip().lower()
    if freq == "daily":
        return current + timedelta(days=1)
    if freq == "weekly":
        return current + timedelta(days=7)
    due_day = int(unit.get("due_day") or 1)
    if freq == "annual":
        year = current.year + 1
        last = calendar.monthrange(year, current.month)[1]
        return date(year, current.month, min(due_day, last))
    year = current.year + (1 if current.month == 12 else 0)
    month = 1 if current.month == 12 else current.month + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(due_day, last))


def _parse_txn_day(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        return value
    else:
        text = str(value).strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(LAGOS)
    return parsed.date()


def period_bounds(unit: dict, today: date) -> tuple[date, date]:
    """First and last day of the current rent period (mirrors periodStart/periodEnd)."""
    freq = str(unit.get("frequency") or "monthly").strip().lower()
    due = due_date_for_unit(unit, today)
    if due is None:
        if freq == "annual":
            return date(today.year, 1, 1), date(today.year, 12, 31)
        last = calendar.monthrange(today.year, today.month)[1]
        return date(today.year, today.month, 1), date(today.year, today.month, last)
    if freq == "daily":
        return due, due
    if freq == "weekly":
        return due - timedelta(days=6), due
    if freq == "annual":
        return date(due.year, 1, 1), date(due.year, 12, 31)
    last = calendar.monthrange(due.year, due.month)[1]
    return date(due.year, due.month, 1), date(due.year, due.month, last)


def period_window_start(today: date) -> date:
    """Earliest day any current period can start: 1 Jan, less a week for weekly rent."""
    return date(today.year, 1, 1) - timedelta(days=7)


def _net_paid(txn: dict) -> float:
    return max(0.0, _to_number(txn.get("amount")) - _to_number(txn.get("refunded_amount")))


def _paid_rows_in_period(
    unit: dict, transactions: list[dict], today: date, charge_type: str
) -> list[dict]:
    start, end = period_bounds(unit, today)
    rows = []
    for t in transactions:
        if t.get("status") != "paid" or _txn_charge_type(t) != charge_type:
            continue
        paid = _parse_txn_day(t.get("paid_at") or t.get("created_at"))
        if paid and start <= paid <= end:
            rows.append(t)
    return rows


def _paid_in_current_period(
    unit: dict, transactions: list[dict], today: date, charge_type: str
) -> bool:
    return bool(_paid_rows_in_period(unit, transactions, today, charge_type))


def _status_when_open(
    transactions: list[dict], charge_type: str, unit: dict, today: date
) -> ChargeStatus:
    if any(
        t.get("status") == "overdue" and _txn_charge_type(t) == charge_type
        for t in transactions
    ):
        return "OVERDUE"
    due = due_date_for_unit(unit, today)
    if due and due < today:
        return "OVERDUE"
    if due:
        days = (due - today).days
        if 0 <= days <= DUE_SOON_DAYS:
            return "DUE SOON"
    return "PENDING"


def charge_breakdown(
    unit: dict, transactions: list[dict], today: date
) -> dict[str, dict[str, Any]]:
    """Per charge: status, expected, paid this period, remaining (mirrors chargeBreakdown).

    Overpaying one charge covers the other: tenant checkout and autopay record
    rent + service charge as a single rent row.
    """
    expected = {"rent": _to_number(unit.get("rent_amount"))}
    service = _to_number(unit.get("service_charge_amount"))
    if service > 0:
        expected["service_charge"] = service
    rows = {kind: _paid_rows_in_period(unit, transactions, today, kind) for kind in expected}
    raw = {kind: sum(_net_paid(t) for t in rows[kind]) for kind in expected}
    paid = dict(raw)
    if service > 0:
        paid["rent"] += max(0.0, raw["service_charge"] - expected["service_charge"])
        paid["service_charge"] += max(0.0, raw["rent"] - expected["rent"])
    out: dict[str, dict[str, Any]] = {}
    for kind, amount in expected.items():
        if amount > 0:
            covered = paid[kind] >= amount - PAID_TOLERANCE
        else:
            covered = bool(rows[kind])
        status = "PAID" if covered else _status_when_open(transactions, kind, unit, today)
        out[kind] = {
            "status": status,
            "expected": amount,
            "paid": min(paid[kind], amount) if amount > 0 else paid[kind],
            "remaining": 0.0 if covered else max(0.0, amount - paid[kind]),
        }
    return out


def outstanding_for_unit(unit: dict, transactions: list[dict], today: date) -> float:
    """What is still owed for the current period across rent and service charge."""
    return sum(line["remaining"] for line in charge_breakdown(unit, transactions, today).values())


def resolve_charge_status(
    unit: dict,
    transactions: list[dict],
    charge_type: str,
    today: date,
) -> ChargeStatus:
    line = charge_breakdown(unit, transactions, today).get(charge_type)
    if line is not None:
        return line["status"]
    if _paid_in_current_period(unit, transactions, today, charge_type):
        return "PAID"
    return _status_when_open(transactions, charge_type, unit, today)


def resolve_unit_status(
    unit: dict, transactions: list[dict], today: date
) -> ChargeStatus:
    """Worst status across rent + configured service charge (not one-off other)."""
    worst: ChargeStatus = "PAID"
    for line in charge_breakdown(unit, transactions, today).values():
        if STATUS_RANK[line["status"]] > STATUS_RANK[worst]:
            worst = line["status"]
    return worst


def parse_term_end(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()[:10]
    if len(text) != 10:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def days_until_term_end(unit: dict, today: date) -> int | None:
    end = parse_term_end(unit.get("term_end"))
    if end is None:
        return None
    return (end - today).days
