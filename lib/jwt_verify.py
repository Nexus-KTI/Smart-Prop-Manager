"""Local verification of Supabase access tokens against the project's signing keys."""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

import httpx
import jwt

from lib.http_client import get_http_client

logger = logging.getLogger(__name__)

# Asymmetric only: legacy HS256 tokens (shared secret) go to GoTrue instead.
ALLOWED_ALGORITHMS = frozenset({"ES256", "RS256", "EdDSA"})
AUDIENCE = "authenticated"
# Supabase's edge caches the JWKS for 10 minutes; holding it longer delays key revocation.
JWKS_TTL_SEC = 600.0
# An unknown kid or a failed fetch triggers at most one fetch per interval.
JWKS_RETRY_SEC = 30.0
CLOCK_LEEWAY_SEC = 10
_JWKS_TIMEOUT = httpx.Timeout(5.0, connect=3.0)


class LocalVerifyUnavailable(Exception):
    """The token cannot be checked locally; ask GoTrue instead."""


class InvalidToken(Exception):
    """The token is definitively not acceptable (bad signature, expired, wrong audience)."""


def local_jwt_enabled() -> bool:
    raw = (os.getenv("AUTH_LOCAL_JWT") or "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _supabase_url() -> str:
    return (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")


class _KeyCache:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.keys: dict[str, jwt.PyJWK] = {}
        self.fetched_at = 0.0
        self.attempted_at = 0.0

    def clear(self) -> None:
        with self.lock:
            self.keys = {}
            self.fetched_at = 0.0
            self.attempted_at = 0.0


_cache = _KeyCache()


def _fetch_keys(url: str) -> dict[str, jwt.PyJWK]:
    response = get_http_client().get(
        f"{url}/auth/v1/.well-known/jwks.json",
        timeout=_JWKS_TIMEOUT,
    )
    response.raise_for_status()
    keys: dict[str, jwt.PyJWK] = {}
    for raw in (response.json() or {}).get("keys") or []:
        if not isinstance(raw, dict) or not raw.get("kid"):
            continue
        try:
            key = jwt.PyJWK.from_dict(raw)
        except jwt.PyJWTError:
            continue
        if key.algorithm_name in ALLOWED_ALGORITHMS:
            keys[str(raw["kid"])] = key
    return keys


def _signing_key(kid: str) -> jwt.PyJWK | None:
    url = _supabase_url()
    if not url:
        raise LocalVerifyUnavailable("SUPABASE_URL is not set")
    with _cache.lock:
        now = time.monotonic()
        fresh = _cache.fetched_at and now - _cache.fetched_at < JWKS_TTL_SEC
        if fresh and kid in _cache.keys:
            return _cache.keys[kid]
        if now - _cache.attempted_at < JWKS_RETRY_SEC:
            return _cache.keys.get(kid) if fresh else None
        _cache.attempted_at = now
        try:
            _cache.keys = _fetch_keys(url)
            _cache.fetched_at = now
        except Exception as exc:  # noqa: BLE001 - any fetch failure falls back to GoTrue
            logger.warning("Signing key fetch failed: %s", exc.__class__.__name__)
            _cache.keys = {}
            _cache.fetched_at = 0.0
            return None
        return _cache.keys.get(kid)


def verify_claims(token: str) -> dict[str, Any]:
    """Verify signature, expiry, issuer, and audience locally; return the claims."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise InvalidToken("malformed token") from exc
    alg = str(header.get("alg") or "")
    kid = str(header.get("kid") or "")
    if alg not in ALLOWED_ALGORITHMS or not kid:
        raise LocalVerifyUnavailable("token is not signed with an asymmetric key")
    key = _signing_key(kid)
    if key is None:
        raise LocalVerifyUnavailable("signing key not available")
    if key.algorithm_name != alg:
        raise InvalidToken("algorithm does not match the signing key")
    try:
        claims = jwt.decode(
            token,
            key.key,
            algorithms=[alg],
            audience=AUDIENCE,
            issuer=f"{_supabase_url()}/auth/v1",
            leeway=CLOCK_LEEWAY_SEC,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidToken(exc.__class__.__name__) from exc
    if claims.get("role") != AUDIENCE or not str(claims.get("sub") or "").strip():
        raise InvalidToken("not a signed-in user token")
    return claims
