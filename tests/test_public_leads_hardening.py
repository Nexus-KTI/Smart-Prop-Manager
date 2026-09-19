"""Unit tests for public lead / invite hardening (captcha + client IP)."""

from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import MagicMock

# lib imports that pull db need env at import time.
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

import pytest
from fastapi import HTTPException

from lib import captcha as captcha_mod
from lib.rate_limit import client_ip
from routers import public_leads


def _request(*, host: str = "203.0.113.9", headers: dict[str, str] | None = None):
    return SimpleNamespace(
        client=SimpleNamespace(host=host),
        headers=headers or {},
    )


def test_client_ip_ignores_xff_by_default(monkeypatch):
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    req = _request(
        host="203.0.113.9",
        headers={"x-forwarded-for": "198.51.100.1, 203.0.113.9"},
    )
    assert client_ip(req) == "203.0.113.9"


def test_client_ip_prefers_cf_when_trust_proxy(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    req = _request(
        host="10.0.0.1",
        headers={
            "cf-connecting-ip": "198.51.100.50",
            "x-forwarded-for": "203.0.113.1, 10.0.0.1",
        },
    )
    assert client_ip(req) == "198.51.100.50"


def test_client_ip_uses_first_xff_when_trust_proxy(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "true")
    req = _request(
        host="10.0.0.1",
        headers={"x-forwarded-for": "198.51.100.7, 10.0.0.1"},
    )
    assert client_ip(req) == "198.51.100.7"


def test_captcha_skipped_without_secret(monkeypatch):
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    assert captcha_mod.captcha_enforced() is False
    captcha_mod.verify_turnstile(None)


def test_captcha_requires_token_when_secret_set(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    assert captcha_mod.captcha_enforced() is True
    with pytest.raises(HTTPException) as exc:
        captcha_mod.verify_turnstile(None)
    assert exc.value.status_code == 400


def test_captcha_rejects_failed_siteverify(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"success": False}

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(captcha_mod, "get_http_client", lambda: FakeClient())
    with pytest.raises(HTTPException) as exc:
        captcha_mod.verify_turnstile("bad-token")
    assert exc.value.status_code == 400


def test_captcha_accepts_successful_turnstile_verification(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    posted: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"success": True, "hostname": "localhost"}

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, *, data, timeout=None):
            posted["url"] = url
            posted["data"] = data
            return FakeResponse()

    monkeypatch.setattr(captcha_mod, "get_http_client", lambda: FakeClient())
    captcha_mod.verify_turnstile("good-token", remoteip="203.0.113.9")

    assert posted["url"] == captcha_mod.TURNSTILE_SITEVERIFY_URL
    assert posted["data"] == {
        "secret": "test-secret",
        "response": "good-token",
        "remoteip": "203.0.113.9",
    }


def test_validate_invite_rejects_non_uuid(monkeypatch):
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    monkeypatch.setattr(public_leads, "enforce_rate_limit", lambda *a, **k: None)
    req = _request()
    out = public_leads.validate_signup_invite("not-a-uuid", req)
    assert out.valid is False


def test_validate_invite_ok_when_invited(monkeypatch):
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    monkeypatch.setattr(public_leads, "enforce_rate_limit", lambda *a, **k: None)
    invite_id = "11111111-1111-4111-8111-111111111111"

    db = MagicMock()
    chain = db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value
    chain.execute.return_value = SimpleNamespace(
        data=[{"id": invite_id, "name": "Ada", "whatsapp": "+234801", "status": "invited"}]
    )
    monkeypatch.setattr(public_leads, "_service_db", lambda: db)

    out = public_leads.validate_signup_invite(invite_id, _request())
    assert out.valid is True
    assert out.name == "Ada"


def test_create_public_lead_inserts_via_service(monkeypatch):
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)

    db = MagicMock()
    db.table.return_value.insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "lead-1"}]
    )
    monkeypatch.setattr(public_leads, "_service_db", lambda: db)
    monkeypatch.setattr(public_leads, "enforce_rate_limit", lambda *a, **k: None)

    body = public_leads.PublicLeadCreate(
        name="Funke",
        whatsapp="+2348012345678",
        unit_count=3,
        source="access",
    )
    out = public_leads.create_public_lead(body, _request())
    assert out == {"ok": True, "id": "lead-1"}
