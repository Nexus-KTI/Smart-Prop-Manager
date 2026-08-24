"""Unit tests for Phase 2 renewal lead-day matching (no DB)."""

from datetime import date

from lib.reminder_job import unit_renewal_due_today


def test_renewal_on_term_end():
    unit = {"term_end": "2026-09-01"}
    assert unit_renewal_due_today(unit, date(2026, 9, 1))


def test_renewal_lead_days():
    unit = {"term_end": date(2026, 10, 1)}
    assert unit_renewal_due_today(unit, date(2026, 9, 1))  # 30 days
    assert unit_renewal_due_today(unit, date(2026, 9, 17))  # 14 days
    assert unit_renewal_due_today(unit, date(2026, 9, 24))  # 7 days
    assert not unit_renewal_due_today(unit, date(2026, 9, 2))


def test_renewal_missing_term_end():
    assert not unit_renewal_due_today({}, date(2026, 9, 1))
    assert not unit_renewal_due_today({"term_end": None}, date(2026, 9, 1))
