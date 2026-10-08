"""Portfolio snapshot read model (sql/055), ops overdue on it, and status-rule alignment."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from lib import unit_status  # noqa: E402
from lib.unit_status import resolve_charge_status, resolve_unit_status  # noqa: E402
from routers import staff  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def _unit(**extra) -> dict:
    return {"rent_amount": 1000, "service_charge_amount": 0, "frequency": "monthly", "due_day": 1, **extra}


def _paid(at: str, charge_type: str = "rent", amount: float = 1000) -> dict:
    return {"status": "paid", "paid_at": at, "created_at": at, "charge_type": charge_type, "amount": amount}


# --- status rules match web/lib/dashboard.ts -----------------------------------


def test_weekly_period_is_the_seven_days_ending_on_the_due_date():
    # 2026-08-12 is a Wednesday; due_day 6 = Friday (JS getDay 5) → due 2026-08-14.
    unit = _unit(frequency="weekly", due_day=6)
    today = date(2026, 8, 12)
    assert resolve_charge_status(unit, [_paid("2026-08-08T10:00:00+01:00")], "rent", today) == "PAID"
    # Paid earlier in the month, before this week's window: no longer PAID.
    assert resolve_charge_status(unit, [_paid("2026-08-03T10:00:00+01:00")], "rent", today) == "DUE SOON"


def test_daily_period_is_the_day_itself():
    unit = _unit(frequency="daily")
    today = date(2026, 8, 12)
    assert resolve_charge_status(unit, [_paid("2026-08-12T08:00:00+01:00")], "rent", today) == "PAID"
    assert resolve_charge_status(unit, [_paid("2026-08-11T08:00:00+01:00")], "rent", today) == "DUE SOON"


def test_paid_dates_are_read_in_lagos_time():
    unit = _unit(due_day=1)
    # 23:30 UTC on 31 Aug is 00:30 on 1 Sep in Lagos.
    late = _paid("2026-08-31T23:30:00Z")
    assert resolve_unit_status(unit, [late], date(2026, 9, 10)) == "PAID"
    assert resolve_unit_status(unit, [late], date(2026, 8, 20)) == "OVERDUE"


def test_monthly_and_annual_periods_unchanged():
    assert resolve_unit_status(_unit(due_day=5), [_paid("2026-08-02T09:00:00Z")], date(2026, 8, 20)) == "PAID"
    annual = _unit(frequency="annual", due_month=3, due_day=1)
    assert resolve_unit_status(annual, [_paid("2026-01-15T09:00:00Z")], date(2026, 8, 20)) == "PAID"
    assert resolve_unit_status(annual, [_paid("2025-12-15T09:00:00Z")], date(2026, 8, 20)) == "OVERDUE"


def test_lagos_today_uses_lagos_clock():
    assert unit_status.LAGOS.key == "Africa/Lagos"
    assert isinstance(unit_status.lagos_today(), date)


# --- ops overdue --------------------------------------------------------------


class _SnapshotDb:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=self.data))


def test_ops_overdue_returns_only_overdue_units_from_the_snapshot(monkeypatch):
    rows = [
        {
            "id": "u-over",
            "label": "A",
            "tenant_name": "Ada",
            "property_id": "p1",
            "property_name": "12 Adeniran",
            "due_day": 1,
            "frequency": "monthly",
            "rent_amount": 1000,
            "service_charge_amount": 0,
            "transactions": [],
            "failed_reminder": None,
        },
        {
            "id": "u-vacant",
            "label": "V",
            "tenant_name": None,
            "property_id": "p1",
            "property_name": "12 Adeniran",
            "due_day": 1,
            "frequency": "monthly",
            "rent_amount": 1000,
            "service_charge_amount": 0,
            "transactions": [],
            "failed_reminder": None,
        },
        {
            "id": "u-paid",
            "label": "B",
            "tenant_name": "Bode",
            "property_id": "p1",
            "property_name": "12 Adeniran",
            "due_day": 1,
            "frequency": "monthly",
            "rent_amount": 1000,
            "service_charge_amount": 0,
            "transactions": [_paid("2026-08-02T09:00:00Z")],
            "failed_reminder": None,
        },
    ]
    db = _SnapshotDb(rows)
    ctx = SimpleNamespace(require=lambda _perm: None, owner_id="o1", role="owner", permissions={"chase"})
    monkeypatch.setattr(staff, "resolve_portfolio", lambda *_a: ctx)
    monkeypatch.setattr(staff, "accessible_property_ids_for_portfolio", lambda _ctx: ["p1"])
    monkeypatch.setattr(staff, "create_service_client", lambda: db)
    monkeypatch.setattr(staff, "lagos_today", lambda: date(2026, 8, 20))

    out = staff.portfolio_overdue_ops(user=SimpleNamespace(id="o1"), portfolio_owner_id=None)

    assert [item["unit"]["id"] for item in out["items"]] == ["u-over"]
    item = out["items"][0]
    assert item["property_name"] == "12 Adeniran" and item["transactions"] == []
    assert "transactions" not in item["unit"] and "failed_reminder" not in item["unit"]
    assert (out["loaded"], out["capped"]) == (3, False)
    assert db.calls[0][0] == "portfolio_unit_snapshot"


# --- migration ------------------------------------------------------------------


def test_migration_055_shape():
    sql = (ROOT / "sql" / "055_portfolio_unit_snapshot.sql").read_text(encoding="utf-8")
    assert "returns jsonb" in sql
    assert "security invoker" in sql
    assert "set search_path = public" in sql
    assert "limit 36" in sql
    assert "r.rn <= 6" in sql
    assert "p.owner_id = p_owner_id" in sql
    assert "from public, anon;" in sql
    assert "auth.uid()" not in sql
