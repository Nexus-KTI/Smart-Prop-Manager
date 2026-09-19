"""Unit tests for in-process rate limiting and JWT AAL helpers."""

from __future__ import annotations

import base64
import json
import os
import time

# lib.auth imports lib.db which requires env at import time.
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

import pytest
from fastapi import HTTPException

from lib.auth import (
    AuthedUser,
    _jwt_aal,
    enforce_aal2_if_mfa_enrolled,
    require_admin_aal2,
)
from lib.rate_limit import enforce_rate_limit


def _fake_jwt(aal: str) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"none"}').decode().rstrip("=")
    payload = (
        base64.urlsafe_b64encode(json.dumps({"aal": aal, "sub": "u1"}).encode())
        .decode()
        .rstrip("=")
    )
    return f"{header}.{payload}.sig"


def test_jwt_aal_reads_claim():
    assert _jwt_aal(_fake_jwt("aal2")) == "aal2"
    assert _jwt_aal(_fake_jwt("aal1")) == "aal1"
    assert _jwt_aal("not-a-jwt") == "aal1"


def test_enforce_aal2_passes_when_already_aal2(monkeypatch):
    monkeypatch.setattr("lib.auth._user_has_verified_mfa", lambda _uid: True)
    enforce_aal2_if_mfa_enrolled("user-1", _fake_jwt("aal2"))


def test_enforce_aal2_blocks_aal1_when_mfa_enrolled(monkeypatch):
    monkeypatch.setattr("lib.auth._user_has_verified_mfa", lambda _uid: True)
    with pytest.raises(HTTPException) as exc:
        enforce_aal2_if_mfa_enrolled("user-1", _fake_jwt("aal1"))
    assert exc.value.status_code == 401
    assert exc.value.detail == "MFA required"


def test_enforce_aal2_allows_aal1_without_mfa(monkeypatch):
    monkeypatch.setattr("lib.auth._user_has_verified_mfa", lambda _uid: False)
    enforce_aal2_if_mfa_enrolled("user-1", _fake_jwt("aal1"))


def test_enforce_aal2_fail_closed_when_mfa_status_unavailable(monkeypatch):
    def boom(_uid: str) -> bool:
        raise HTTPException(
            status_code=503,
            detail="MFA status unavailable",
            headers={"X-Auth-AAL": "mfa-status-unavailable"},
        )

    monkeypatch.setattr("lib.auth._user_has_verified_mfa", boom)
    with pytest.raises(HTTPException) as exc:
        enforce_aal2_if_mfa_enrolled("user-1", _fake_jwt("aal1"))
    assert exc.value.status_code == 503


def test_admin_operator_actions_require_explicit_aal2():
    aal1 = AuthedUser(
        id="operator",
        email="operator@example.com",
        access_token=_fake_jwt("aal1"),
        db=None,  # type: ignore[arg-type]
    )
    with pytest.raises(HTTPException) as exc:
        require_admin_aal2(aal1)
    assert exc.value.status_code == 401
    assert exc.value.headers == {"X-Auth-AAL": "aal2-required"}

    aal2 = AuthedUser(
        id="operator",
        email="operator@example.com",
        access_token=_fake_jwt("aal2"),
        db=None,  # type: ignore[arg-type]
    )
    assert require_admin_aal2(aal2) is aal2


def test_rate_limit_trips(monkeypatch):
    calls = 0

    class FakeRpc:
        def execute(self):
            nonlocal calls
            calls += 1
            return type("Result", (), {"data": {"allowed": calls <= 2}})()

    class FakeDb:
        def rpc(self, _name, _params):
            return FakeRpc()

    monkeypatch.setattr("lib.db.create_service_client", lambda: FakeDb())
    key = f"test-rl-{time.time()}"
    enforce_rate_limit(key, limit=2, window_seconds=60)
    enforce_rate_limit(key, limit=2, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit(key, limit=2, window_seconds=60)
    assert exc.value.status_code == 429
    assert int(exc.value.headers["Retry-After"]) >= 1
