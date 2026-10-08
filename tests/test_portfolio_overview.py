"""Dashboard overview: overdue money on let units, due this week, property cards."""

from __future__ import annotations

import os
from datetime import date
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from lib.portfolio_overview import build_portfolio_overview  # noqa: E402
from lib.unit_status import next_due_date_for_unit  # noqa: E402
from lib.urgent_actions import build_urgent_actions  # noqa: E402

TODAY = date(2026, 8, 20)


def _paid(at: str, charge_type: str = "rent", amount: float = 100_000) -> dict:
    return {"status": "paid", "paid_at": at, "created_at": at, "charge_type": charge_type, "amount": amount}


def _unit(uid: str, prop: str, *, tenant: str | None = "Ada", due_day: int = 1, rent: float = 100_000,
          service: float = 0, txns: list | None = None, photo: str | None = None) -> dict:
    return {
        "property_id": prop,
        "property_name": prop,
        "unit": {
            "id": uid,
            "label": uid,
            "property_id": prop,
            "rent_amount": rent,
            "service_charge_amount": service,
            "frequency": "monthly",
            "due_day": due_day,
            "tenant_name": tenant,
            "tenant_contact": "+2348000000000" if tenant else None,
            "photo_url": photo,
            "transactions": txns or [],
        },
    }


PROPS = [
    {"id": "late", "name": "Late Court", "address": "1 Allen", "created_at": "2026-08-01T10:00:00Z"},
    {"id": "soon", "name": "Soon House", "address": None, "created_at": "2026-07-31T23:30:00Z"},
    {"id": "paid", "name": "Paid Place", "address": "3 Awolowo", "created_at": "2026-05-01T10:00:00Z"},
    {"id": "empty-let", "name": "Vacant Villa", "address": "", "created_at": "2026-05-01T10:00:00Z"},
    {"id": "none", "name": "bare plot", "address": None, "created_at": "2026-05-01T10:00:00Z"},
]

ROWS = [
    # Rent overdue; service charge paid this month → only rent counts.
    _unit("l1", "late", service=10_000, txns=[_paid("2026-08-02T09:00:00Z", "service_charge", 10_000)],
          photo="https://cdn/l1.jpg"),
    # Vacant and past due: never overdue money.
    _unit("l2", "late", tenant=None, rent=80_000),
    # Due in 3 days with a service charge.
    _unit("s1", "soon", due_day=23, service=5_000),
    # Paid this month: next due is next month.
    _unit("p1", "paid", due_day=5, txns=[_paid("2026-08-04T09:00:00Z")]),
    _unit("v1", "empty-let", tenant="  ", rent=60_000, service=4_000),
]


def test_kpis_count_overdue_charges_on_let_units_only():
    out = build_portfolio_overview(PROPS, ROWS, today=TODAY)
    assert (out["overdue_amount"], out["overdue_units"]) == (100_000, 1)
    assert (out["due_week_amount"], out["due_week_units"]) == (105_000, 1)
    assert (out["property_count"], out["unit_count"], out["occupied"], out["vacant"]) == (5, 5, 3, 2)
    # 23:30 UTC on 31 Jul is 1 Aug in Lagos.
    assert out["new_this_month"] == 2
    assert out["capped"] is False


def test_property_cards_most_urgent_first_with_charge_amounts():
    cards = {c["id"]: c for c in build_portfolio_overview(PROPS, ROWS, today=TODAY)["properties"]}
    order = [c["id"] for c in build_portfolio_overview(PROPS, ROWS, today=TODAY)["properties"]]
    assert order == ["late", "soon", "paid", "empty-let", "none"]

    late = cards["late"]
    assert (late["status"], late["amount"], late["units"], late["occupied"]) == ("overdue", 100_000, 2, 1)
    assert late["photo_url"] == "https://cdn/l1.jpg" and late["address"] == "1 Allen"
    assert (cards["soon"]["status"], cards["soon"]["amount"]) == ("due-soon", 105_000)
    assert cards["soon"]["address"] is None
    paid = cards["paid"]
    assert (paid["status"], paid["amount"], paid["next_due"]) == ("occupied", 100_000, "2026-09-05")
    assert (cards["empty-let"]["status"], cards["empty-let"]["amount"]) == ("vacant", 64_000)
    assert (cards["none"]["status"], cards["none"]["amount"], cards["none"]["units"]) == ("empty", None, 0)


def test_pending_unit_shows_its_current_due_date():
    rows = [_unit("p2", "paid", due_day=30)]
    card = build_portfolio_overview(PROPS[2:3], rows, today=TODAY)["properties"][0]
    assert (card["status"], card["next_due"]) == ("occupied", "2026-08-30")


def test_empty_portfolio():
    out = build_portfolio_overview([], [], today=TODAY)
    assert out["properties"] == [] and out["overdue_amount"] == 0 and out["unit_count"] == 0


def test_action_needed_skips_vacant_units_for_rent_items():
    rows = [
        _unit("let", "late"),
        _unit("vacant", "late", tenant=None),
        _unit("vacant-soon", "soon", tenant="", due_day=23),
    ]
    items = build_urgent_actions(rows, {}, today=TODAY)
    assert [(i["kind"], i["unit_id"]) for i in items] == [("overdue_chase", "let")]


def test_next_due_date_rolls_months_years_and_clamps():
    monthly = {"frequency": "monthly", "due_day": 31}
    assert next_due_date_for_unit(monthly, date(2026, 1, 10)) == date(2026, 2, 28)
    assert next_due_date_for_unit(monthly, date(2026, 12, 10)) == date(2027, 1, 31)
    weekly = {"frequency": "weekly", "due_day": 6}
    assert next_due_date_for_unit(weekly, date(2026, 8, 12)) == date(2026, 8, 21)
    assert next_due_date_for_unit({"frequency": "daily"}, date(2026, 8, 12)) == date(2026, 8, 13)
    annual = {"frequency": "annual", "due_month": 2, "due_day": 29}
    assert next_due_date_for_unit(annual, date(2027, 3, 1)) == date(2028, 2, 29)
    assert next_due_date_for_unit({"frequency": "monthly"}, date(2026, 8, 12)) is None


# --- endpoint -----------------------------------------------------------------


class _Query:
    def __init__(self, db):
        self.db = db

    def select(self, columns):
        self.db.selects.append(columns)
        return self

    def eq(self, column, value):
        self.db.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.db.filters.append((column, tuple(values)))
        return self

    def execute(self):
        return SimpleNamespace(data=PROPS)


class _Db:
    def __init__(self):
        self.selects, self.filters, self.rpcs = [], [], []

    def table(self, name):
        assert name == "properties"
        return _Query(self)

    def rpc(self, name, params):
        self.rpcs.append((name, params))
        flat = [{**row["unit"], "property_name": row["property_name"], "failed_reminder": None} for row in ROWS]
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=flat))


def test_overview_endpoint_reads_properties_and_one_snapshot(monkeypatch):
    from routers import properties

    db = _Db()
    ctx = SimpleNamespace(role="owner", owner_id="o1")
    monkeypatch.setattr(properties, "resolve_portfolio", lambda *_a: ctx)
    monkeypatch.setattr(properties, "accessible_property_ids_for_portfolio", lambda _c: [p["id"] for p in PROPS])
    monkeypatch.setattr("lib.unit_status.lagos_today", lambda: TODAY)

    out = properties.portfolio_overview(user=SimpleNamespace(id="o1", db=db), portfolio_owner_id=None)

    assert out["overdue_amount"] == 100_000 and len(out["properties"]) == 5
    assert db.selects == ["id, name, address, created_at"]
    assert ("owner_id", "o1") in db.filters
    assert [name for name, _ in db.rpcs] == ["portfolio_unit_snapshot"]


def test_overview_endpoint_without_properties_skips_reads(monkeypatch):
    from routers import properties

    monkeypatch.setattr(properties, "resolve_portfolio", lambda *_a: SimpleNamespace(role="owner", owner_id="o1"))
    monkeypatch.setattr(properties, "accessible_property_ids_for_portfolio", lambda _c: [])
    db = _Db()
    out = properties.portfolio_overview(user=SimpleNamespace(id="o1", db=db), portfolio_owner_id=None)
    assert out["property_count"] == 0 and db.selects == [] and db.rpcs == []
