"""Background worker loop, daily guard, retention batching, and the inline-flush switch."""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from lib import delivery_outbox, retention, worker  # noqa: E402
from routers import cron_jobs  # noqa: E402


class _Result:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


class _PurgeDb:
    """Serves one queued result per call of each purge RPC."""

    def __init__(self, rounds, ledger=()):
        self.rounds = list(rounds)
        self.ledger = list(ledger)
        self.calls = []

    def rpc(self, name, params=None):
        self.calls.append((name, params))
        if name == "purge_paystack_events":
            return _Result(self.ledger.pop(0) if self.ledger else 0)
        return _Result(self.rounds.pop(0) if self.rounds else {})


# --- retention ---------------------------------------------------------------


def test_retention_passes_windows_and_stops_on_partial_batch():
    db = _PurgeDb([{"outbox": 3, "product_events": 0, "reminders": 1}])
    out = retention.purge_expired_records(db, batch=10)
    assert out == {
        "outbox": 3,
        "product_events": 0,
        "reminders": 1,
        "paystack_events": 0,
        "rounds": 1,
    }
    assert db.calls == [
        (
            "purge_expired_records",
            {
                "p_outbox_days": 30,
                "p_event_days": 180,
                "p_reminder_months": 18,
                "p_batch": 10,
            },
        ),
        ("purge_paystack_events", {"p_months": 12, "p_batch": 10}),
    ]


def test_retention_ledger_and_records_finish_independently():
    db = _PurgeDb(
        [{"outbox": 1, "product_events": 0, "reminders": 0}],
        ledger=[10, 10, 3],
    )
    out = retention.purge_expired_records(db, batch=10)
    assert out["paystack_events"] == 23 and out["outbox"] == 1 and out["rounds"] == 3
    names = [name for name, _ in db.calls]
    assert names.count("purge_expired_records") == 1
    assert names.count("purge_paystack_events") == 3


def test_retention_repeats_while_any_table_fills_the_batch():
    db = _PurgeDb(
        [
            {"outbox": 10, "product_events": 2, "reminders": 0},
            {"outbox": 10, "product_events": 0, "reminders": 0},
            {"outbox": 4, "product_events": 0, "reminders": 0},
        ]
    )
    out = retention.purge_expired_records(db, batch=10)
    assert out == {
        "outbox": 24,
        "product_events": 2,
        "reminders": 0,
        "paystack_events": 0,
        "rounds": 3,
    }


def test_retention_caps_rounds(caplog):
    db = _PurgeDb([{"outbox": 5, "product_events": 0, "reminders": 0}] * 10)
    out = retention.purge_expired_records(db, batch=5, max_rounds=3)
    assert out["rounds"] == 3 and out["outbox"] == 15
    assert "more rows remain" in caplog.text


def test_retention_route_requires_cron_secret(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    with pytest.raises(HTTPException) as ei:
        cron_jobs.run_retention_job(authorization="Bearer nope", x_cron_secret=None)
    assert ei.value.status_code == 401

    db = _PurgeDb([{"outbox": 1, "product_events": 0, "reminders": 0}])
    monkeypatch.setattr("lib.db.create_service_client", lambda: db)
    out = cron_jobs.run_retention_job(authorization="Bearer test-secret", x_cron_secret=None)
    assert out["outbox"] == 1 and out["rounds"] == 1


def test_migration_052_is_service_role_only_and_batched():
    sql = (Path(__file__).resolve().parents[1] / "sql" / "052_retention_purge.sql").read_text(
        encoding="utf-8"
    )
    assert "status in ('sent', 'dead')" in sql
    assert sql.count("limit p_batch") == 3
    assert "from public, anon, authenticated" in sql
    assert "to service_role;" in sql
    assert "set search_path = public" in sql


def test_migration_054_ledger_purge_is_service_role_only_and_batched():
    sql = (
        Path(__file__).resolve().parents[1] / "sql" / "054_paystack_ledger_retention.sql"
    ).read_text(encoding="utf-8")
    assert "limit p_batch" in sql
    assert "make_interval(months => p_months)" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role;" in sql
    assert "set search_path = public" in sql


# --- inline flush switch -----------------------------------------------------


def test_inline_flush_off_skips_the_claim(monkeypatch):
    calls = []
    monkeypatch.setattr(
        delivery_outbox, "process_delivery_outbox", lambda **kw: calls.append(kw) or {"claimed": 1}
    )
    monkeypatch.setenv("OUTBOX_INLINE_FLUSH", "0")
    assert delivery_outbox.flush_delivery_outbox(db=object())["claimed"] == 0
    assert calls == []

    monkeypatch.delenv("OUTBOX_INLINE_FLUSH")
    assert delivery_outbox.flush_delivery_outbox(db=object())["claimed"] == 1
    assert len(calls) == 1


# --- worker ------------------------------------------------------------------


def _utc(hour_lagos: int, day: int = 3) -> datetime:
    # Africa/Lagos is UTC+1 all year.
    return datetime(2026, 10, day, hour_lagos - 1, 30, tzinfo=timezone.utc)


def test_daily_due_waits_for_seven_lagos_and_runs_once_per_day():
    assert worker.daily_due(_utc(6), None) is None
    assert worker.daily_due(_utc(7), None) == date(2026, 10, 3)
    assert worker.daily_due(_utc(23), date(2026, 10, 3)) is None
    assert worker.daily_due(_utc(8, day=4), date(2026, 10, 3)) == date(2026, 10, 4)


def test_daily_guard_window_fits_the_limiter(monkeypatch):
    seen = {}

    def consume(key, *, limit, window_seconds):
        seen.update(key=key, limit=limit, window=window_seconds)
        return True, 0

    monkeypatch.setattr("lib.rate_limit.consume_rate_limit", consume)
    assert worker.claim_daily_run(date(2026, 10, 3)) is True
    assert seen == {"key": "worker-daily:2026-10-03", "limit": 1, "window": 86400}
    sql = (Path(__file__).resolve().parents[1] / "sql").glob("*.sql")
    assert any("p_window_seconds > 86400" in p.read_text(encoding="utf-8") for p in sql)


class _Harness:
    def __init__(self, monkeypatch, *, claimed=0, guard=True, hour=6):
        self.events = []
        self.now = _utc(hour)
        self.mono = 0.0

        def drain(db):
            self.events.append("drain")
            return {"claimed": claimed}

        def guard_fn(day):
            self.events.append(("guard", day))
            if isinstance(guard, Exception):
                raise guard
            return guard

        monkeypatch.setattr(worker, "_drain", drain)
        monkeypatch.setattr(worker, "_purge_rate_limits", lambda db: self.events.append("purge") or 0)
        monkeypatch.setattr(worker, "claim_daily_run", guard_fn)
        monkeypatch.setattr(worker, "_reminder_jobs", lambda: self.events.append("reminders") or {})
        monkeypatch.setattr(worker, "_retention", lambda db: self.events.append("retention") or {})
        self.worker = worker.Worker(
            db_factory=lambda: object(),
            clock=lambda: self.now,
            monotonic=lambda: self.mono,
        )


def test_tick_drains_and_waits_when_batch_is_partial(monkeypatch):
    h = _Harness(monkeypatch, claimed=3)
    assert h.worker.tick() == worker.DRAIN_INTERVAL_SEC
    assert h.events == ["drain", "purge"]


def test_tick_loops_immediately_on_full_batch(monkeypatch):
    h = _Harness(monkeypatch, claimed=worker.DRAIN_BATCH)
    assert h.worker.tick() == 0.0


def test_rate_limit_purge_is_hourly(monkeypatch):
    h = _Harness(monkeypatch)
    h.worker.tick()
    h.mono = 1800
    h.worker.tick()
    h.mono = 3600
    h.worker.tick()
    assert h.events.count("purge") == 2


def test_daily_jobs_run_once_after_seven(monkeypatch):
    h = _Harness(monkeypatch, hour=7)
    h.worker.tick()
    h.worker.tick()
    assert h.events.count("reminders") == 1
    assert h.events.count("retention") == 1
    assert h.worker.last_daily == date(2026, 10, 3)


def test_daily_jobs_skip_when_another_run_claimed_the_day(monkeypatch):
    h = _Harness(monkeypatch, hour=9, guard=False)
    h.worker.tick()
    h.worker.tick()
    assert "reminders" not in h.events
    assert h.events.count(("guard", date(2026, 10, 3))) == 1


def test_daily_guard_outage_retries_next_pass(monkeypatch):
    h = _Harness(monkeypatch, hour=9, guard=RuntimeError("limiter down"))
    h.worker.tick()
    assert "reminders" not in h.events
    assert h.worker.last_daily is None


def test_failed_reminder_jobs_still_run_retention(monkeypatch):
    h = _Harness(monkeypatch, hour=7)

    def boom():
        raise RuntimeError("supabase down")

    monkeypatch.setattr(worker, "_reminder_jobs", boom)
    h.worker.tick()
    assert "retention" in h.events


def test_drain_failure_does_not_stop_the_pass(monkeypatch):
    h = _Harness(monkeypatch, hour=7)

    def boom(db):
        raise RuntimeError("claim failed")

    monkeypatch.setattr(worker, "_drain", boom)
    assert h.worker.tick() == worker.DRAIN_INTERVAL_SEC
    assert "reminders" in h.events


def test_stop_ends_run_loop(monkeypatch):
    h = _Harness(monkeypatch)
    monkeypatch.setattr(worker.signal, "signal", lambda *a: None)
    original = h.worker.tick

    def tick_then_stop():
        delay = original()
        h.worker.stop()
        return delay

    h.worker.tick = tick_then_stop
    h.worker.run()
    assert h.events.count("drain") == 1


def test_worker_entry_point_is_module_runnable():
    src = (Path(__file__).resolve().parents[1] / "scripts" / "worker.py").read_text(encoding="utf-8")
    assert "Worker().run()" in src and "init_sentry()" in src
