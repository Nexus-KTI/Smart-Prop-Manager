"""Unit tests for Phase 3 exit metric helpers (no live DB)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from lib.phase3_exit import compute_phase3_exit, format_phase3_exit_report


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._filters: list[tuple] = []

    def select(self, *_args, **_kwargs):
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


def test_phase3_exit_percentages():
    now = datetime(2026, 8, 23, tzinfo=timezone.utc)
    recent = (now - timedelta(days=5)).isoformat()
    old = (now - timedelta(days=60)).isoformat()

    db = _FakeDb(
        {
            "tenancies": [
                {
                    "id": "T1",
                    "unit_id": "U1",
                    "status": "active",
                    "activated_at": recent,
                    "tenant_user_id": "TEN1",
                    "checklist_id_collected": True,
                    "checklist_agreement_signed": True,
                    "checklist_references_checked": True,
                    "checklist_identity_verified": False,
                },
                {
                    "id": "T2",
                    "unit_id": "U2",
                    "status": "active",
                    "activated_at": recent,
                    "tenant_user_id": "TEN2",
                    "checklist_id_collected": True,
                    "checklist_agreement_signed": False,
                    "checklist_references_checked": True,
                    "checklist_identity_verified": True,
                },
                {
                    "id": "T3",
                    "unit_id": "U3",
                    "status": "active",
                    "activated_at": old,
                    "tenant_user_id": "TEN3",
                    "checklist_id_collected": True,
                    "checklist_agreement_signed": True,
                    "checklist_references_checked": True,
                    "checklist_identity_verified": False,
                },
            ],
            "transactions": [
                {
                    "id": "X1",
                    "unit_id": "U1",
                    "status": "paid",
                    "initiated_by": "tenant",
                    "paid_at": recent,
                },
                {
                    "id": "X2",
                    "unit_id": "U1",
                    "status": "paid",
                    "initiated_by": "landlord",
                    "paid_at": recent,
                },
                {
                    "id": "X3",
                    "unit_id": "U9",
                    "status": "paid",
                    "initiated_by": "tenant",
                    "paid_at": recent,
                },
            ],
        }
    )

    report = compute_phase3_exit(db, now=now, window_days=30)
    m1 = report["metric_1_checklist_before_active"]
    m2 = report["metric_2_tenant_initiated_payments"]

    assert m1["activated_tenancies"] == 2
    assert m1["with_required_checklist"] == 1
    assert m1["percent"] == 50.0
    assert m1["optional_identity_complete"] == 1

    assert m2["eligible_paid_transactions"] == 2
    assert m2["tenant_initiated"] == 1
    assert m2["percent"] == 50.0
    assert m2["units_with_tenant_account"] == 3

    text = format_phase3_exit_report(report)
    assert "Checklist completed before occupancy active" in text
    assert "Tenant-initiated payments" in text
