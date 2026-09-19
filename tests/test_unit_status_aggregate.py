"""Properties-list status aggregates worst charge type (mirrors web/lib/dashboard.ts)."""

from __future__ import annotations

from datetime import date
from typing import Any

from lib.unit_status import resolve_charge_status, resolve_unit_status


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
