"""Unit tests for frequency-aware due-day matching (no DB)."""

from datetime import date

from lib.reminder_job import unit_is_due_today


def test_daily_always_due():
    assert unit_is_due_today({"frequency": "daily"}, date(2026, 7, 21))


def test_monthly_exact_day():
    unit = {"frequency": "monthly", "due_day": 21}
    assert unit_is_due_today(unit, date(2026, 7, 21))
    assert not unit_is_due_today(unit, date(2026, 7, 20))


def test_monthly_clamps_to_month_end():
    unit = {"frequency": "monthly", "due_day": 31}
    assert unit_is_due_today(unit, date(2026, 2, 28))
    assert not unit_is_due_today(unit, date(2026, 2, 27))


def test_weekly_sunday_is_due_day_1():
    # 2026-07-19 is Sunday
    unit = {"frequency": "weekly", "due_day": 1}
    assert unit_is_due_today(unit, date(2026, 7, 19))
    assert not unit_is_due_today(unit, date(2026, 7, 20))


def test_weekly_monday_is_due_day_2():
    # 2026-07-20 is Monday
    unit = {"frequency": "weekly", "due_day": 2}
    assert unit_is_due_today(unit, date(2026, 7, 20))
    assert not unit_is_due_today(unit, date(2026, 7, 19))


def test_monthly_missing_due_day():
    assert not unit_is_due_today({"frequency": "monthly"}, date(2026, 7, 21))


def test_annual_exact_anniversary():
    unit = {"frequency": "annual", "due_day": 5, "due_month": 3}
    assert unit_is_due_today(unit, date(2026, 3, 5))
    assert not unit_is_due_today(unit, date(2026, 3, 4))
    assert not unit_is_due_today(unit, date(2026, 4, 5))


def test_annual_defaults_month_to_january():
    unit = {"frequency": "annual", "due_day": 1}
    assert unit_is_due_today(unit, date(2026, 1, 1))
    assert not unit_is_due_today(unit, date(2026, 2, 1))


def test_annual_clamps_to_month_end():
    unit = {"frequency": "annual", "due_day": 31, "due_month": 2}
    assert unit_is_due_today(unit, date(2026, 2, 28))
    assert not unit_is_due_today(unit, date(2026, 2, 27))
