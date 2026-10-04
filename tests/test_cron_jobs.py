"""Tests for HTTP cron entrypoints."""

from __future__ import annotations

import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from routers import cron_jobs


def test_require_cron_secret_rejects_missing_config(monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    with pytest.raises(HTTPException) as ei:
        cron_jobs.require_cron_secret(None, None)
    assert ei.value.status_code == 503


def test_require_cron_secret_accepts_bearer(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    cron_jobs.require_cron_secret("Bearer test-secret", None)


def test_require_cron_secret_accepts_header(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    cron_jobs.require_cron_secret(None, "test-secret")


def test_require_cron_secret_rejects_bad(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    with pytest.raises(HTTPException) as ei:
        cron_jobs.require_cron_secret("Bearer nope", None)
    assert ei.value.status_code == 401


def test_secret_matches_is_constant_time_and_rejects_empty():
    import inspect

    assert cron_jobs.secret_matches("abc", "abc")
    assert not cron_jobs.secret_matches("abd", "abc")
    assert not cron_jobs.secret_matches("", "abc")
    assert not cron_jobs.secret_matches("abc", "")
    assert "compare_digest" in inspect.getsource(cron_jobs.secret_matches)


def test_due_reminder_job_uses_shared_cron_check(monkeypatch):
    from routers import reminders

    monkeypatch.setenv("CRON_SECRET", "test-secret")
    with pytest.raises(HTTPException) as ei:
        reminders.run_due_reminder_job(authorization="Bearer nope", x_cron_secret=None)
    assert ei.value.status_code == 401


def test_run_delivery_outbox_job(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    monkeypatch.setattr(
        "lib.db.create_service_client",
        lambda: type("DB", (), {"rpc": lambda *a, **k: type("R", (), {"execute": lambda self: type("E", (), {"data": 2})()})()})(),
    )
    monkeypatch.setattr(
        "lib.delivery_outbox.process_delivery_outbox",
        lambda db: {"processed": 1, "delivered": 1},
    )
    out = cron_jobs.run_delivery_outbox_job(
        authorization="Bearer test-secret",
        x_cron_secret=None,
    )
    assert out["processed"] == 1
    assert out["expired_rate_limits_purged"] == 2
