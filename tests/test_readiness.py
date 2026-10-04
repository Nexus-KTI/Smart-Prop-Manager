"""/ready: database reachability with a hard timeout, plus outbox backlog age."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from lib import readiness


class _Outbox:
    def __init__(self, rows=None, delay=0.0, error=None):
        self.rows = rows or []
        self.delay = delay
        self.error = error

    def table(self, _name):
        return self

    def select(self, *_a):
        return self

    def in_(self, *_a):
        return self

    def lte(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        if self.delay:
            time.sleep(self.delay)
        if self.error:
            raise self.error
        return SimpleNamespace(data=self.rows)


def _ago(seconds: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()


def test_ready_with_empty_outbox():
    ok, body = readiness.check_readiness(lambda: _Outbox())
    assert ok
    assert body == {
        "status": "ready",
        "database": "ok",
        "outbox_oldest_ready_seconds": None,
        "outbox": "ok",
    }


def test_stale_outbox_is_reported_but_still_ready():
    ok, body = readiness.check_readiness(
        lambda: _Outbox([{"next_attempt_at": _ago(3600)}])
    )
    assert ok
    assert body["outbox"] == "stale"
    assert body["outbox_oldest_ready_seconds"] >= 3600


def test_database_error_is_not_ready_without_leaking_detail():
    ok, body = readiness.check_readiness(
        lambda: _Outbox(error=RuntimeError("password=secret"))
    )
    assert not ok
    assert body == {"status": "not_ready", "database": "error"}


def test_slow_database_times_out(monkeypatch):
    monkeypatch.setattr(readiness, "READY_TIMEOUT_SEC", 0.05)
    started = time.monotonic()
    ok, body = readiness.check_readiness(lambda: _Outbox(delay=0.5))
    assert not ok
    assert body["database"] == "timeout"
    assert time.monotonic() - started < 0.4


def test_health_stays_shallow():
    import inspect

    import main

    assert inspect.getsource(main.health).strip().endswith('return {"status": "ok"}')
