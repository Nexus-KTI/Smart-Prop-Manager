"""Every paid row in each unit's current rent period (no history cap) for status and balances."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any

from lib.unit_status import LAGOS, period_bounds

PERIOD_TXN_FIELDS = "id, unit_id, status, amount, refunded_amount, paid_at, created_at, charge_type"
UNIT_CHUNK = 100
PAGE = 1000


def _since(day: date) -> str:
    start = datetime.combine(day, time.min, tzinfo=LAGOS).astimezone(timezone.utc)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_period_payments(db: Any, units: list[dict], today: date) -> dict[str, list[dict]]:
    """unit_id -> paid rows dated (paid_at, else created_at) on or after its period start."""
    by_start: dict[date, list[str]] = {}
    for unit in units:
        unit_id = str(unit.get("id") or "")
        if unit_id:
            by_start.setdefault(period_bounds(unit, today)[0], []).append(unit_id)
    out: dict[str, list[dict]] = {}
    for start, unit_ids in by_start.items():
        since = _since(start)
        for i in range(0, len(unit_ids), UNIT_CHUNK):
            chunk = unit_ids[i : i + UNIT_CHUNK]
            offset = 0
            while True:
                rows = (
                    db.table("transactions")
                    .select(PERIOD_TXN_FIELDS)
                    .in_("unit_id", chunk)
                    .eq("status", "paid")
                    .or_(f'paid_at.gte."{since}",created_at.gte."{since}"')
                    .order("id")
                    .range(offset, offset + PAGE - 1)
                    .execute()
                    .data
                    or []
                )
                for row in rows:
                    out.setdefault(str(row.get("unit_id")), []).append(row)
                if len(rows) < PAGE:
                    break
                offset += PAGE
    return out


def merge_transactions(existing: list[dict] | None, period_rows: list[dict] | None) -> list[dict]:
    """Recent embedded rows plus the period's paid rows, one copy per id."""
    merged: list[dict] = []
    seen: set[str] = set()
    for row in [*(period_rows or []), *(existing or [])]:
        key = str(row.get("id") or "")
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        merged.append(row)
    return merged


def attach_period_payments(db: Any, units: list[dict], today: date) -> None:
    """Merge each unit's current-period paid rows into its `transactions` in place."""
    if not units:
        return
    period = load_period_payments(db, units, today)
    for unit in units:
        unit["transactions"] = merge_transactions(
            unit.get("transactions"), period.get(str(unit.get("id") or ""))
        )
