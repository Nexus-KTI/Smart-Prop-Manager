"""Urgent action ranking (Action Needed hub)."""

from __future__ import annotations

from datetime import date

from lib.urgent_actions import build_urgent_actions, summarize_actions


def _row(
    *,
    unit_id: str,
    label: str,
    due_day: int = 1,
    contact: str | None = "+2348012345678",
    term_end: str | None = None,
    txns: list | None = None,
    service_charge_amount: float = 0,
) -> dict:
    return {
        "property_name": "12 Adeniran",
        "property_id": "prop-1",
        "unit": {
            "id": unit_id,
            "label": label,
            "rent_amount": 100_000,
            "service_charge_amount": service_charge_amount,
            "frequency": "monthly",
            "due_day": due_day,
            "tenant_name": "Tenant",
            "tenant_contact": contact,
            "term_end": term_end,
            "transactions": txns or [],
        },
    }


def test_ranks_overdue_before_due_soon():
    today = date(2026, 8, 15)
    rows = [
        _row(unit_id="u-soon", label="Soon", due_day=15),  # due today → DUE SOON
        _row(unit_id="u-over", label="Over", due_day=1),  # past due → OVERDUE
    ]
    items = build_urgent_actions(rows, {}, today=today)
    kinds = [it["kind"] for it in items]
    assert "overdue_chase" in kinds
    assert "due_soon" in kinds
    overdue_i = next(i for i, it in enumerate(items) if it["kind"] == "overdue_chase")
    soon_i = next(i for i, it in enumerate(items) if it["kind"] == "due_soon")
    assert overdue_i < soon_i


def test_lease_ending_and_no_contact():
    today = date(2026, 8, 15)
    rows = [
        _row(
            unit_id="u-vacant-over",
            label="No contact",
            due_day=1,
            contact=None,
            term_end="2026-08-25",
        ),
    ]
    items = build_urgent_actions(rows, {}, today=today)
    kinds = {it["kind"] for it in items}
    assert "overdue_no_contact" in kinds
    assert "lease_ending" in kinds
    ending = next(it for it in items if it["kind"] == "lease_ending")
    assert ending["days_until_term_end"] == 10
    assert ending["priority"] >= 60  # ≤14d boost


def test_failed_chase_boosts_priority_when_overdue():
    today = date(2026, 8, 15)
    rows = [
        _row(unit_id="u1", label="Flat", due_day=1),
    ]
    failed = {
        "u1": {
            "id": "rem-1",
            "error_detail": "Provider timeout",
            "status": "failed",
        }
    }
    items = build_urgent_actions(rows, failed, today=today)
    failed_item = next(it for it in items if it["kind"] == "chase_failed")
    assert failed_item["priority"] == 100
    assert failed_item["reminder_id"] == "rem-1"
    assert "timeout" in (failed_item["detail"] or "").lower()
    assert items[0]["kind"] == "chase_failed"


def test_summary_counts():
    today = date(2026, 8, 15)
    rows = [
        _row(unit_id="u1", label="A", due_day=1, term_end="2026-09-01"),
        _row(unit_id="u2", label="B", due_day=15),
    ]
    failed = {"u2": {"id": "r2", "error_detail": "bad", "status": "failed"}}
    items = build_urgent_actions(rows, failed, today=today)
    summary = summarize_actions(items)
    assert summary["overdue"] >= 1
    assert summary["due_soon"] >= 1
    assert summary["lease_ending"] >= 1
    assert summary["failed"] == 1
    assert summary["urgent"] == len(items)


class _FakeExecute:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, pages: dict[tuple[int, int], list], calls: list[tuple[int, int]]):
        self._pages = pages
        self._calls = calls
        self._range: tuple[int, int] | None = None

    def select(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start: int, end: int):
        self._calls.append((start, end))
        self._range = (start, end)
        return self

    def execute(self):
        assert self._range is not None
        return _FakeExecute(self._pages.get(self._range, []))


class _FakeDb:
    def __init__(self, pages: dict[tuple[int, int], list]):
        self._pages = pages
        self.range_calls: list[tuple[int, int]] = []

    def table(self, _name: str):
        return _FakeQuery(self._pages, self.range_calls)


def test_load_portfolio_unit_rows_pages_past_200():
    from lib.urgent_actions import load_portfolio_unit_rows

    def unit_row(i: int) -> dict:
        return {
            "id": f"u-{i}",
            "label": f"U{i}",
            "rent_amount": 1,
            "service_charge_amount": 0,
            "frequency": "monthly",
            "due_day": 1,
            "due_month": None,
            "term_end": None,
            "tenant_name": "T",
            "tenant_contact": "+234",
            "property_id": "p1",
            "properties": {"id": "p1", "name": "P", "owner_id": "o1"},
            "transactions": [],
        }

    page0 = [unit_row(i) for i in range(200)]
    page1 = [unit_row(i) for i in range(200, 250)]
    db = _FakeDb({(0, 199): page0, (200, 399): page1})
    items = load_portfolio_unit_rows(
        db, owner_id="o1", property_ids=["p1"], page_size=200, max_units=5000
    )
    assert len(items) == 250
    assert db.range_calls == [(0, 199), (200, 399)]
    assert items[0]["unit"]["id"] == "u-0"
    assert items[-1]["unit"]["id"] == "u-249"


def test_summary_matches_full_build_not_truncated_slice():
    """Regression: summary must count all built items, not a 200-row prefix."""
    today = date(2026, 8, 15)
    rows = [
        _row(unit_id=f"u-{i}", label=f"U{i}", due_day=1) for i in range(250)
    ]
    items = build_urgent_actions(rows, {}, today=today)
    summary = summarize_actions(items)
    overdue_kinds = {
        it["kind"] for it in items if it["kind"] in {"overdue_chase", "overdue_no_contact"}
    }
    assert summary["overdue"] == 250
    assert summary["urgent"] == len(items)
    assert "overdue_chase" in overdue_kinds

