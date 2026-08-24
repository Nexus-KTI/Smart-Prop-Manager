"""Unit tests for Phase 2 exit metric helpers (no live DB)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from lib.phase2_exit import compute_phase2_exit, format_phase2_exit_report


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._filters: list[tuple] = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key: str, value: Any):
        self._filters.append(("eq", key, value))
        return self

    def neq(self, key: str, value: Any):
        self._filters.append(("neq", key, value))
        return self

    def gte(self, key: str, value: Any):
        self._filters.append(("gte", key, value))
        return self

    def in_(self, key: str, values: list[Any]):
        self._filters.append(("in", key, values))
        return self

    def execute(self):
        rows = list(self._rows)
        for kind, key, value in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(key) == value]
            elif kind == "neq":
                rows = [r for r in rows if r.get(key) != value]
            elif kind == "gte":
                rows = [r for r in rows if str(r.get(key) or "") >= str(value)]
            elif kind == "in":
                allowed = set(value)
                rows = [r for r in rows if r.get(key) in allowed]
        return type("R", (), {"data": rows})()


class _FakeDb:
    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables

    def table(self, name: str):
        return _FakeQuery(self._tables.get(name, []))


def test_phase2_exit_percentages():
    now = datetime(2026, 8, 23, tzinfo=timezone.utc)
    recent = (now - timedelta(days=5)).isoformat()
    old = (now - timedelta(days=60)).isoformat()

    db = _FakeDb(
        {
            "phase2_active_landlords": [
                {"landlord_id": "L1"},
                {"landlord_id": "L2"},
            ],
            "transactions": [
                {
                    "unit_id": "U1",
                    "charge_type": "service_charge",
                    "status": "paid",
                    "paid_at": recent,
                    "created_at": recent,
                },
                {
                    "unit_id": "U2",
                    "charge_type": "service_charge",
                    "status": "paid",
                    "paid_at": old,
                    "created_at": old,
                },
                {
                    "unit_id": "U3",
                    "charge_type": "rent",
                    "status": "paid",
                    "paid_at": recent,
                    "created_at": recent,
                },
            ],
            "units": [
                {"id": "U1", "properties": {"owner_id": "L1"}},
                {"id": "U2", "properties": {"owner_id": "L2"}},
            ],
            "phase2_occupied_units": [
                {"unit_id": "U1", "term_end": "2026-12-01"},
                {"unit_id": "U2", "term_end": None},
                {"unit_id": "U3", "term_end": "2027-01-01"},
            ],
            "product_events": [
                {
                    "event_name": "renewal_banner_viewed",
                    "landlord_id": "L1",
                    "unit_id": "U1",
                    "created_at": recent,
                }
            ],
        }
    )

    report = compute_phase2_exit(db, now=now, window_days=30)
    assert report["metric_1_non_rent_collection"]["active_landlords"] == 2
    assert report["metric_1_non_rent_collection"]["landlords_with_paid_non_rent"] == 1
    assert report["metric_1_non_rent_collection"]["percent"] == 50.0
    assert report["metric_2_renewal_visibility"]["occupied_units"] == 3
    assert report["metric_2_renewal_visibility"]["occupied_with_term_end"] == 2
    assert report["metric_2_renewal_visibility"]["percent"] == 66.7
    assert report["metric_2b_renewal_banner_views"]["views"] == 1
    assert "Non-rent collection" in format_phase2_exit_report(report)


def test_phase2_exit_zero_denominators():
    report = compute_phase2_exit(_FakeDb({}), window_days=30)
    assert report["metric_1_non_rent_collection"]["percent"] == 0.0
    assert report["metric_2_renewal_visibility"]["percent"] == 0.0
