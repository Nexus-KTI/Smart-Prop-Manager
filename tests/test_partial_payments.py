"""Partial payments, step A: a charge is paid only when the period's payments cover it."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from lib import autopay_job, reminder_job  # noqa: E402
from lib.period_payments import load_period_payments, merge_transactions  # noqa: E402
from lib.portfolio_overview import build_portfolio_overview  # noqa: E402
from lib.unit_status import charge_breakdown, outstanding_for_unit, resolve_unit_status  # noqa: E402
from lib.urgent_actions import build_urgent_actions  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TODAY = date(2026, 8, 15)


def _unit(**extra) -> dict:
    return {
        "id": "u1",
        "label": "Flat 1",
        "rent_amount": 100_000,
        "service_charge_amount": 0,
        "frequency": "monthly",
        "due_day": 1,
        "tenant_name": "Ada",
        "tenant_contact": "+2348000000000",
        **extra,
    }


def _paid(amount: float, at: str = "2026-08-02T09:00:00Z", charge_type: str = "rent", **extra) -> dict:
    return {"status": "paid", "amount": amount, "paid_at": at, "created_at": at, "charge_type": charge_type, **extra}


# --- the rule -----------------------------------------------------------------


def test_part_payment_stays_open_with_the_remainder():
    line = charge_breakdown(_unit(), [_paid(40_000)], TODAY)["rent"]
    assert line == {"status": "OVERDUE", "expected": 100_000, "paid": 40_000, "remaining": 60_000}


def test_installments_that_add_up_settle_the_charge():
    txns = [_paid(40_000), _paid(60_000, "2026-08-10T09:00:00Z")]
    assert resolve_unit_status(_unit(), txns, TODAY) == "PAID"
    assert outstanding_for_unit(_unit(), txns, TODAY) == 0


def test_last_kobo_rounding_counts_as_paid():
    assert resolve_unit_status(_unit(), [_paid(99_999.6)], TODAY) == "PAID"


def test_last_months_payment_does_not_count():
    assert outstanding_for_unit(_unit(), [_paid(100_000, "2026-07-20T09:00:00Z")], TODAY) == 100_000


def test_one_combined_row_settles_rent_and_service_charge():
    unit = _unit(service_charge_amount=10_000)
    lines = charge_breakdown(unit, [_paid(110_000)], TODAY)
    assert lines["rent"]["status"] == lines["service_charge"]["status"] == "PAID"


def test_combined_row_short_of_both_leaves_service_charge_open():
    unit = _unit(service_charge_amount=10_000)
    lines = charge_breakdown(unit, [_paid(104_000)], TODAY)
    assert lines["rent"]["status"] == "PAID"
    assert (lines["service_charge"]["paid"], lines["service_charge"]["remaining"]) == (4_000, 6_000)
    assert outstanding_for_unit(unit, [_paid(104_000)], TODAY) == 6_000


def test_refund_reopens_the_charge():
    txns = [_paid(100_000, refunded_amount=30_000)]
    assert resolve_unit_status(_unit(), txns, TODAY) == "OVERDUE"
    assert outstanding_for_unit(_unit(), txns, TODAY) == 30_000


def test_twelve_annual_installments_are_all_counted():
    unit = _unit(frequency="annual", due_month=3, due_day=1, rent_amount=1_200_000)
    txns = [_paid(100_000, f"2026-{m:02d}-02T09:00:00Z") for m in range(1, 13)]
    assert resolve_unit_status(unit, txns, date(2026, 12, 20)) == "PAID"
    assert outstanding_for_unit(unit, txns[:11], date(2026, 12, 20)) == 100_000


def test_zero_rent_unit_is_paid_by_any_row():
    unit = _unit(rent_amount=0)
    assert resolve_unit_status(unit, [_paid(0)], TODAY) == "PAID"
    assert resolve_unit_status(unit, [], TODAY) == "OVERDUE"


# --- complete period data -----------------------------------------------------


class _TxnQuery:
    def __init__(self, db):
        self.db = db
        self.call: dict = {}

    def select(self, columns):
        self.call["select"] = columns
        return self

    def in_(self, column, values):
        self.call[column] = list(values)
        return self

    def eq(self, column, value):
        self.call[column] = value
        return self

    def or_(self, expr):
        self.call["or"] = expr
        return self

    def order(self, column):
        return self

    def range(self, start, end):
        self.call["range"] = (start, end)
        return self

    def execute(self):
        self.db.calls.append(self.call)
        start, end = self.call["range"]
        rows = [r for r in self.db.rows if r["unit_id"] in self.call["unit_id"]]
        return SimpleNamespace(data=rows[start : end + 1])


class _TxnDb:
    def __init__(self, rows):
        self.rows = rows
        self.calls: list[dict] = []

    def table(self, name):
        assert name == "transactions"
        return _TxnQuery(self)


def test_loader_reads_from_each_period_start_in_lagos_time_and_pages():
    rows = [{"id": f"t{i}", "unit_id": "u1", **_paid(1)} for i in range(1005)]
    db = _TxnDb(rows)
    weekly = _unit(id="u2", frequency="weekly", due_day=6)
    out = load_period_payments(db, [_unit(), weekly], date(2026, 8, 12))

    assert len(out["u1"]) == 1005 and "u2" not in out
    monthly_calls = [c for c in db.calls if c["unit_id"] == ["u1"]]
    assert [c["range"] for c in monthly_calls] == [(0, 999), (1000, 1999)]
    # 1 Aug 00:00 Lagos is 31 Jul 23:00 UTC.
    assert monthly_calls[0]["or"] == 'paid_at.gte."2026-07-31T23:00:00Z",created_at.gte."2026-07-31T23:00:00Z"'
    assert monthly_calls[0]["status"] == "paid"
    # Weekly rent due Fri 14 Aug: the period starts Sat 8 Aug.
    weekly_call = next(c for c in db.calls if c["unit_id"] == ["u2"])
    assert "2026-08-07T23:00:00Z" in weekly_call["or"]


def test_merge_keeps_one_copy_per_transaction():
    recent = [{"id": "a", "status": "overdue"}, {"id": "b", "status": "paid"}]
    period = [{"id": "b", "status": "paid"}, {"id": "c", "status": "paid"}]
    assert [r["id"] for r in merge_transactions(recent, period)] == ["b", "c", "a"]


# --- what the landlord sees ---------------------------------------------------


def _row(unit: dict) -> dict:
    return {"property_id": "p1", "property_name": "12 Adeniran", "unit": {"property_id": "p1", **unit}}


def test_overview_counts_only_what_is_left():
    rows = [_row(_unit(transactions=[_paid(40_000)]))]
    props = [{"id": "p1", "name": "12 Adeniran", "address": None, "created_at": "2026-01-01T00:00:00Z"}]
    out = build_portfolio_overview(props, rows, today=TODAY)
    assert (out["overdue_amount"], out["overdue_units"]) == (60_000, 1)


def test_action_detail_shows_how_much_was_paid():
    items = build_urgent_actions([_row(_unit(transactions=[_paid(40_000)]))], {}, today=TODAY)
    assert items[0]["kind"] == "overdue_chase"
    assert items[0]["detail"] == "14 days overdue · ₦\u00a040,000.00 of ₦\u00a0100,000.00 paid"


def test_action_detail_without_payment_is_unchanged():
    items = build_urgent_actions([_row(_unit())], {}, today=TODAY)
    assert items[0]["detail"] == "14 days overdue"


def test_tenant_balance_is_this_periods_remainder(monkeypatch):
    from routers import tenancies

    monkeypatch.setattr("lib.unit_status.lagos_today", lambda: TODAY)
    monkeypatch.setattr(
        "lib.period_payments.load_period_payments", lambda _db, _units, _day: {"u1": [_paid(40_000)]}
    )
    assert tenancies._period_balance(object(), [_unit()]) == {
        "expected": 100_000,
        "paid": 40_000,
        "remaining": 60_000,
        "due_date": "2026-08-01",
    }
    assert tenancies._period_balance(object(), None) is None


# --- reminders and autopay ask only for what is left ---------------------------


def test_due_reminder_skips_covered_units_and_asks_for_the_rest(monkeypatch):
    day = date(2026, 8, 1)
    units = [
        _unit(id="u-paid", properties={"owner_id": "o1", "name": "12 Adeniran"}),
        _unit(id="u-part", properties={"owner_id": "o1", "name": "12 Adeniran"}),
        _unit(id="u-none", properties={"owner_id": "o1", "name": "12 Adeniran"}),
    ]
    period = {"u-paid": [_paid(100_000, "2026-08-01T08:00:00Z")], "u-part": [_paid(40_000, "2026-08-01T08:00:00Z")]}
    amounts: list[float] = []
    queued: list[str] = []

    monkeypatch.setattr("lib.db.create_service_client", lambda: object())
    monkeypatch.setattr(reminder_job, "_select_all_units", lambda _build: units)
    monkeypatch.setattr("lib.period_payments.load_period_payments", lambda _db, _units, _day: period)
    monkeypatch.setattr(reminder_job, "_already_reminded_today", lambda *_a, **_k: False)
    monkeypatch.setattr(reminder_job, "_business_name", lambda *_a: None)
    monkeypatch.setattr("lib.notify.get_owner_notification_channel", lambda *_a: "sms")
    monkeypatch.setattr("lib.notify.contact_matches_channel", lambda *_a: True)
    monkeypatch.setattr("lib.notification_prefs.load_profile_notification_prefs", lambda *_a: None)

    def fake_due(*, amount, **_kw):
        amounts.append(amount)
        return SimpleNamespace(text="due", subject="due", html="<p>due</p>")

    monkeypatch.setattr("lib.email_templates.tenant_due", fake_due)
    monkeypatch.setattr(
        "lib.delivery_outbox.enqueue_notification",
        lambda _db, *, idempotency_key, **_kw: queued.append(idempotency_key),
    )

    stats = reminder_job.run_due_reminders(today=day)

    assert (stats["queued"], stats["skipped"]) == (2, 1)
    assert amounts == [60_000, 100_000]
    assert queued == ["due-reminder:u-part:2026-08-01", "due-reminder:u-none:2026-08-01"]


class _AutopayQuery:
    def __init__(self, db, table):
        self.db, self.table = db, table

    def select(self, *_a):
        return self

    def eq(self, *_a):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        if self.table == "tenancies":
            return SimpleNamespace(data=self.db.tenancies)
        return SimpleNamespace(data=[{"id": "pm1", "authorization_code": "AUTH_x"}])


class _AutopayDb:
    def __init__(self, tenancies):
        self.tenancies = tenancies

    def table(self, name):
        return _AutopayQuery(self, name)


def _tenancy(tid: str, unit_id: str) -> dict:
    return {
        "id": tid,
        "unit_id": unit_id,
        "tenant_user_id": f"user-{tid}",
        "autopay_enabled": True,
        "autopay_payment_method_id": "pm1",
        "autopay_days_before": 0,
        "units": _unit(id=unit_id),
    }


def test_autopay_charges_the_remainder_skips_covered_and_survives_a_refused_claim(monkeypatch):
    day = date(2026, 8, 1)
    db = _AutopayDb([_tenancy("t-paid", "u-paid"), _tenancy("t-part", "u-part"), _tenancy("t-key", "u-key")])
    period = {"u-paid": [_paid(100_000, "2026-08-01T08:00:00Z")], "u-part": [_paid(40_000, "2026-08-01T08:00:00Z")]}
    charged: list[tuple[str, float]] = []

    def fake_charge(_db, *, unit, amount, **_kw):
        if unit["id"] == "u-key":
            raise RuntimeError("Idempotency key reused with different payment inputs")
        charged.append((unit["id"], amount))
        return "charged"

    monkeypatch.setattr("lib.db.create_service_client", lambda: db)
    monkeypatch.setattr(
        "lib.period_payments.load_period_payments",
        lambda _db, units, _day: {units[0]["id"]: period.get(units[0]["id"], [])},
    )
    monkeypatch.setattr(autopay_job, "_charge_one", fake_charge)

    stats = autopay_job.run_autopay_charges(today=day)

    assert charged == [("u-part", 60_000)]
    assert stats == {"checked": 3, "charged": 1, "skipped": 1, "failed": 1}


def test_hand_sent_reminders_use_what_is_left(monkeypatch):
    from routers import reminders

    period = {"u-paid": [_paid(100_000)], "u-part": [_paid(40_000)]}
    monkeypatch.setattr("lib.unit_status.lagos_today", lambda: TODAY)
    monkeypatch.setattr(
        "lib.period_payments.load_period_payments",
        lambda _db, units, _day: {units[0]["id"]: period.get(units[0]["id"], [])},
    )
    assert reminders._amount_left(object(), _unit(id="u-paid")) == 0
    assert reminders._amount_left(object(), _unit(id="u-part")) == 60_000
    assert reminders._amount_left(object(), _unit(id="u-none", service_charge_amount=5_000)) == 105_000


# --- migration ------------------------------------------------------------------


def test_migration_057_returns_every_paid_row_in_the_year_window():
    sql = (ROOT / "sql" / "057_snapshot_period_payments.sql").read_text(encoding="utf-8")
    assert "create or replace function public.portfolio_unit_snapshot(" in sql
    assert "'refunded_amount', r.refunded_amount" in sql and "'id', r.id" in sql
    assert "date_trunc('year', now() at time zone 'Africa/Lagos') - interval '7 days'" in sql
    assert "limit 120" in sql and "limit 36" in sql
    assert "r.rn <= 6" not in sql
    assert "security invoker" in sql and "set search_path = public" in sql
    assert "from public, anon;" in sql
    assert "to authenticated, service_role;" in sql
