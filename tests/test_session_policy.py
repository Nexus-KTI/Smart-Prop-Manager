"""Stale-session backstop wired into the daily reminders job."""

from __future__ import annotations

from typing import Any

from lib.session_policy import revoke_stale_sessions


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Call:
    def __init__(self, data: Any, error: Exception | None) -> None:
        self._data = data
        self._error = error

    def execute(self) -> _Result:
        if self._error:
            raise self._error
        return _Result(self._data)


class _FakeDb:
    def __init__(self, data: Any = None, error: Exception | None = None) -> None:
        self.data = data
        self.error = error
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: dict) -> _Call:
        self.calls.append((name, params))
        return _Call(self.data, self.error)


def test_revoke_stale_sessions_returns_count() -> None:
    db = _FakeDb(data=3)
    assert revoke_stale_sessions(db) == {"revoked": 3}
    assert db.calls == [("revoke_stale_sessions", {})]


def test_revoke_stale_sessions_handles_null() -> None:
    assert revoke_stale_sessions(_FakeDb(data=None)) == {"revoked": 0}


def test_revoke_stale_sessions_never_raises() -> None:
    result = revoke_stale_sessions(_FakeDb(error=RuntimeError("db down")))
    assert result == {"revoked": 0, "error": "revoke_failed"}


def test_reminder_jobs_include_session_revoke(monkeypatch) -> None:
    import lib.autopay_job as autopay_job
    import lib.reminder_job as reminder_job
    import lib.session_policy as session_policy

    monkeypatch.setattr(reminder_job, "run_due_reminders", lambda today=None: {})
    monkeypatch.setattr(reminder_job, "run_renewal_reminders", lambda today=None: {})
    monkeypatch.setattr(autopay_job, "run_autopay_charges", lambda today=None: {})
    monkeypatch.setattr(
        session_policy, "revoke_stale_sessions", lambda db=None: {"revoked": 2}
    )

    result = reminder_job.run_reminder_jobs()
    assert result["sessions"] == {"revoked": 2}
