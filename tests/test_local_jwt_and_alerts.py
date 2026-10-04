"""Local access-token verification, GoTrue fallback, API workers, and dead-letter alerts."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from lib import auth, delivery_outbox, jwt_verify  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
URL = "https://proj.supabase.co"
KID = "key-1"
EC_KEY = ec.generate_private_key(ec.SECP256R1())


def _jwk(private_key, kid=KID, alg="ES256") -> dict:
    algo = jwt.algorithms.ECAlgorithm if alg == "ES256" else jwt.algorithms.RSAAlgorithm
    return {**algo.to_jwk(private_key.public_key(), as_dict=True), "kid": kid, "alg": alg}


def _token(**overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": "user-1",
        "email": "ada@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "iss": f"{URL}/auth/v1",
        "iat": now,
        "exp": now + 3600,
    }
    headers = {"kid": overrides.pop("_kid", KID)}
    key = overrides.pop("_key", EC_KEY)
    alg = overrides.pop("_alg", "ES256")
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=alg, headers=headers)


class _KeyEndpoint:
    def __init__(self, keys=None, fail=False):
        self.keys = keys if keys is not None else [_jwk(EC_KEY)]
        self.fail = fail
        self.calls = 0

    def get(self, url, timeout=None):
        self.calls += 1
        assert url == f"{URL}/auth/v1/.well-known/jwks.json"
        if self.fail:
            raise RuntimeError("network down")
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"keys": self.keys})


class _GoTrue:
    def __init__(self):
        self.calls = 0

    def get_user(self, _token):
        self.calls += 1
        return SimpleNamespace(user=SimpleNamespace(id="gotrue-user", email="g@example.com"))


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", URL + "/")
    monkeypatch.delenv("AUTH_LOCAL_JWT", raising=False)
    jwt_verify._cache.clear()
    endpoint = _KeyEndpoint()
    gotrue = _GoTrue()
    monkeypatch.setattr(jwt_verify, "get_http_client", lambda: endpoint)
    monkeypatch.setattr(auth, "_TOKEN_CACHE", {})
    monkeypatch.setattr(auth, "create_anon_client", lambda: SimpleNamespace(auth=gotrue))
    yield SimpleNamespace(endpoint=endpoint, gotrue=gotrue, monkeypatch=monkeypatch)
    jwt_verify._cache.clear()


# --- local verification -----------------------------------------------------


def test_valid_token_is_verified_locally_without_gotrue(env):
    assert auth.verify_identity(_token()) == ("user-1", "ada@example.com")
    assert auth.verify_identity(_token(sub="user-2", email=None)) == ("user-2", None)
    assert env.gotrue.calls == 0
    assert env.endpoint.calls == 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": int(time.time()) - 120},
        {"aud": "anon"},
        {"iss": "https://evil.example/auth/v1"},
        {"role": "anon"},
        {"role": "service_role"},
        {"sub": None},
        {"exp": None},
    ],
    ids=["expired", "audience", "issuer", "anon-role", "service-role", "no-sub", "no-exp"],
)
def test_bad_claims_are_rejected_without_gotrue(env, overrides):
    with pytest.raises(HTTPException) as exc:
        auth.verify_identity(_token(**overrides))
    assert exc.value.status_code == 401
    assert env.gotrue.calls == 0


def test_tampered_signature_and_garbage_are_rejected(env):
    head, body, sig = _token().split(".")
    other = _token(sub="someone-else").split(".")[1]
    for bad in (f"{head}.{other}.{sig}", "not-a-jwt"):
        with pytest.raises(HTTPException) as exc:
            auth.verify_identity(bad)
        assert exc.value.status_code == 401
    assert env.gotrue.calls == 0


def test_algorithm_must_match_the_signing_key(env):
    rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException):
        auth.verify_identity(_token(_key=rsa_key, _alg="RS256"))
    assert env.gotrue.calls == 0


def test_legacy_hs256_token_goes_to_gotrue(env):
    legacy = _token(_key="x" * 32, _alg="HS256")
    assert auth.verify_identity(legacy) == ("gotrue-user", "g@example.com")
    assert env.gotrue.calls == 1
    assert env.endpoint.calls == 0


def test_unknown_kid_refetches_once_then_falls_back(env):
    other = ec.generate_private_key(ec.SECP256R1())
    auth.verify_identity(_token())
    stray = _token(_key=other, _kid="rotated")
    assert auth.verify_identity(stray)[0] == "gotrue-user"
    assert env.endpoint.calls == 1  # cache is fresh and the retry window has not passed
    jwt_verify._cache.attempted_at -= jwt_verify.JWKS_RETRY_SEC + 1
    env.endpoint.keys.append(_jwk(other, kid="rotated"))
    assert auth.verify_identity(stray)[0] == "user-1"
    assert env.endpoint.calls == 2


def test_keys_are_refetched_after_ttl(env):
    auth.verify_identity(_token())
    auth.verify_identity(_token())
    assert env.endpoint.calls == 1
    jwt_verify._cache.fetched_at -= jwt_verify.JWKS_TTL_SEC + 1
    jwt_verify._cache.attempted_at -= jwt_verify.JWKS_TTL_SEC + 1
    auth.verify_identity(_token())
    assert env.endpoint.calls == 2


def test_unreachable_keys_fall_back_to_gotrue_without_hammering(env):
    env.endpoint.fail = True
    assert auth.verify_identity(_token())[0] == "gotrue-user"
    env.monkeypatch.setattr(auth, "_TOKEN_CACHE", {})
    assert auth.verify_identity(_token(sub="again"))[0] == "gotrue-user"
    assert env.endpoint.calls == 1
    assert env.gotrue.calls == 2


def test_kill_switch_uses_gotrue_only(env):
    env.monkeypatch.setenv("AUTH_LOCAL_JWT", "0")
    assert auth.verify_identity(_token())[0] == "gotrue-user"
    assert env.endpoint.calls == 0


def test_missing_supabase_url_falls_back(env):
    env.monkeypatch.setenv("SUPABASE_URL", "")
    assert auth.verify_identity(_token())[0] == "gotrue-user"


def test_get_current_user_yields_the_local_identity(env):
    seen = {}
    env.monkeypatch.setattr(
        auth, "enforce_aal2_if_mfa_enrolled", lambda uid, tok: seen.update(uid=uid)
    )
    env.monkeypatch.setattr(auth, "create_user_client", lambda tok: "db")
    env.monkeypatch.setattr(auth, "close_user_client", lambda db: seen.update(closed=db))
    token = _token()
    gen = auth.get_current_user(SimpleNamespace(credentials=token))
    user = next(gen)
    assert (user.id, user.email, user.access_token, user.db) == (
        "user-1",
        "ada@example.com",
        token,
        "db",
    )
    gen.close()
    assert seen == {"uid": "user-1", "closed": "db"}
    assert env.gotrue.calls == 0


def test_profile_reread_after_update_skips_the_token_cache(env):
    token = _token()
    auth.verify_access_token(token)
    auth.verify_access_token(token)
    auth.verify_access_token(token, fresh=True)
    assert env.gotrue.calls == 2


# --- API workers --------------------------------------------------------------


def test_dockerfile_runs_two_api_workers():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "ENV WEB_CONCURRENCY=2" in dockerfile
    requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")
    assert "PyJWT[crypto]" in requirements


# --- dead-letter alerts -------------------------------------------------------


class _Rpc:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


class _OutboxDb:
    def __init__(self, delivery):
        self.delivery = delivery

    def rpc(self, name, params):
        if name == "claim_delivery_outbox":
            return _Rpc([self.delivery])
        return _Rpc(True)


def _delivery(attempts: int) -> dict:
    return {
        "id": "d1",
        "lease_token": "lease-1",
        "attempt_count": attempts,
        "max_attempts": 5,
        "event_name": "notification",
        "channel": "whatsapp",
        "contact": "+2348031234567",
        "payload": {"message": "Rent due Friday"},
    }


def _alerts(caplog):
    return [r for r in caplog.records if getattr(r, "alert", None) == "outbox"]


def test_retryable_failure_warns_without_alert(monkeypatch, caplog):
    def fail(*_args):
        raise TimeoutError("provider timed out")

    monkeypatch.setattr(delivery_outbox, "_deliver", fail)
    with caplog.at_level(logging.WARNING, logger="lib.delivery_outbox"):
        stats = delivery_outbox.process_delivery_outbox(db=_OutboxDb(_delivery(2)))
    assert stats["retried"] == 1
    assert _alerts(caplog) == []
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


@pytest.mark.parametrize(
    ("attempts", "error", "permanent"),
    [(5, TimeoutError("provider timed out"), False), (1, RuntimeError("Email not configured"), True)],
    ids=["exhausted", "permanent"],
)
def test_dead_letter_raises_one_alert_without_contact(monkeypatch, caplog, attempts, error, permanent):
    def fail(*_args):
        raise error

    monkeypatch.setattr(delivery_outbox, "_deliver", fail)
    monkeypatch.setattr(delivery_outbox, "_log_reminder", lambda *a, **k: None)
    with caplog.at_level(logging.WARNING, logger="lib.delivery_outbox"):
        stats = delivery_outbox.process_delivery_outbox(db=_OutboxDb(_delivery(attempts)))
    assert stats["dead"] == 1
    (alert,) = _alerts(caplog)
    assert alert.levelno == logging.ERROR
    assert (alert.outbox_id, alert.event_name, alert.channel) == ("d1", "notification", "whatsapp")
    assert (alert.attempts, alert.permanent) == (attempts, permanent)
    fields = {k: v for k, v in vars(alert).items() if k not in {"exc_info", "exc_text"}}
    assert "+2348031234567" not in str(fields)
    assert "Rent due Friday" not in str(fields)
