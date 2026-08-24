"""Phase 4 exit metrics (no live DB)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from lib.phase4_exit import compute_phase4_exit, format_phase4_exit_report


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._filters: list[tuple] = []

    def select(self, *_a, **_k):
        return self

    def eq(self, key: str, value: Any):
        self._filters.append(("eq", key, value))
        return self

    def execute(self):
        rows = list(self._rows)
        for kind, key, value in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(key) == value]
        return type("R", (), {"data": rows})()


class _FakeDb:
    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables

    def table(self, name: str):
        return _FakeQuery(self._tables.get(name, []))


def test_phase4_exit_multi_portfolio_and_leverage():
    now = datetime(2026, 8, 24, tzinfo=timezone.utc)
    db = _FakeDb(
        {
            "staff_memberships": [
                {
                    "id": "M1",
                    "owner_id": "OA",
                    "user_id": "PM1",
                    "role": "manager",
                    "status": "active",
                },
                {
                    "id": "M2",
                    "owner_id": "OB",
                    "user_id": "PM1",
                    "role": "manager",
                    "status": "active",
                },
                {
                    "id": "M3",
                    "owner_id": "OA",
                    "user_id": "C1",
                    "role": "caretaker",
                    "status": "active",
                },
            ],
            "units": [
                {"id": "U1", "property_id": "P1", "properties": {"owner_id": "OA"}},
                {"id": "U2", "property_id": "P2", "properties": {"owner_id": "OB"}},
                {"id": "U3", "property_id": "P3", "properties": {"owner_id": "OX"}},
            ],
        }
    )
    report = compute_phase4_exit(db, now=now)
    m1 = report["metric_1_multi_portfolio_manager"]
    m2 = report["metric_2_staff_leverage"]
    assert m1["exit_bar_met"] is True
    assert m1["managers_with_ge_2_portfolios"] == 1
    assert "PM1" in m1["manager_user_ids"]
    assert m2["active_staff_users"] == 2
    assert m2["units_under_management"] == 2  # OA + OB only
    assert m2["units_per_staff"] == 1.0
    text = format_phase4_exit_report(report)
    assert ">=2" in text or "Multi-portfolio" in text or "2 owner" in text


def test_phase4_exit_baseline_empty():
    report = compute_phase4_exit(
        _FakeDb({"staff_memberships": [], "units": []}),
        now=datetime(2026, 8, 24, tzinfo=timezone.utc),
    )
    assert report["metric_1_multi_portfolio_manager"]["exit_bar_met"] is False
    assert report["metric_2_staff_leverage"]["units_per_staff"] == 0.0
