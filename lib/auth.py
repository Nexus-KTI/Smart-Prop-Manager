"""Authentication helpers (JWT / session verification)."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
import time
from collections.abc import Generator
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client
from supabase_auth.errors import AuthApiError

from lib.admin import is_admin_email
from lib.db import close_user_client, create_anon_client, create_user_client
from lib.http_client import get_http_client
from lib.jwt_verify import (
    InvalidToken,
    LocalVerifyUnavailable,
    local_jwt_enabled,
    verify_claims,
)

_bearer = HTTPBearer()
logger = logging.getLogger(__name__)

_MFA_FACTOR_CACHE: dict[str, tuple[float, bool]] = {}
_MFA_CACHE_TTL_SEC = 60.0
_MFA_CACHE_MAX_ENTRIES = 2048
_MFA_CACHE_LOCK = threading.Lock()

# A dashboard load fires ~10 calls with the same JWT; GoTrue only needs to see it once.
# Keyed by SHA-256 so raw tokens never sit in memory as dict keys.
_TOKEN_CACHE: dict[str, tuple[float, object]] = {}
_TOKEN_CACHE_TTL_SEC = 60.0
_TOKEN_CACHE_MAX_ENTRIES = 4096
_TOKEN_CACHE_LOCK = threading.Lock()


@dataclass
class AuthedUser:
    id: str
    email: str | None
    access_token: str
    db: Client


def _jwt_claims(token: str) -> dict:
    """Decode claims without a signature check — only use after GoTrue verified the token."""
    try:
        payload_b64 = token.split(".")[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _jwt_aal(token: str) -> str:
    """Read aal claim from an already-verified access token (no sig check)."""
    aal = str(_jwt_claims(token).get("aal") or "aal1").lower()
    return aal if aal in {"aal1", "aal2"} else "aal1"


def _user_has_verified_mfa(user_id: str) -> bool:
    """True when the account has at least one verified MFA factor."""
    now = time.monotonic()
    with _MFA_CACHE_LOCK:
        cached = _MFA_FACTOR_CACHE.get(user_id)
    if cached and now - cached[0] < _MFA_CACHE_TTL_SEC:
        return cached[1]

    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not service_key:
        return False

    has_mfa = False
    try:
        client = get_http_client()
        timeout = httpx.Timeout(8.0, connect=4.0)
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        res = client.get(
            f"{url}/auth/v1/admin/users/{user_id}/factors",
            headers=headers,
            timeout=timeout,
        )
        response_ok = res.status_code == 200
        if response_ok:
            body = res.json()
            factors = body if isinstance(body, list) else body.get("factors") or []
            for factor in factors:
                if not isinstance(factor, dict):
                    continue
                if str(factor.get("status") or "").lower() == "verified":
                    has_mfa = True
                    break
        else:
            res2 = client.get(
                f"{url}/auth/v1/admin/users/{user_id}",
                headers=headers,
                timeout=timeout,
            )
            if res2.status_code == 200:
                response_ok = True
                user_body = res2.json()
                factors = user_body.get("factors") or []
                for factor in factors:
                    if not isinstance(factor, dict):
                        continue
                    if str(factor.get("status") or "").lower() == "verified":
                        has_mfa = True
                        break
        if not response_ok:
            raise RuntimeError(
                f"MFA factor lookup returned {res.status_code}/{res2.status_code}"
            )
    except Exception as exc:
        logger.exception("MFA factor lookup failed for %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MFA status unavailable",
            headers={"X-Auth-AAL": "mfa-status-unavailable"},
        ) from exc

    with _MFA_CACHE_LOCK:
        expired = [
            key
            for key, (stored_at, _value) in _MFA_FACTOR_CACHE.items()
            if now - stored_at >= _MFA_CACHE_TTL_SEC
        ]
        for key in expired:
            _MFA_FACTOR_CACHE.pop(key, None)
        if len(_MFA_FACTOR_CACHE) >= _MFA_CACHE_MAX_ENTRIES:
            oldest = min(_MFA_FACTOR_CACHE, key=lambda key: _MFA_FACTOR_CACHE[key][0])
            _MFA_FACTOR_CACHE.pop(oldest, None)
        _MFA_FACTOR_CACHE[user_id] = (now, has_mfa)
    return has_mfa


def enforce_aal2_if_mfa_enrolled(user_id: str, access_token: str) -> None:
    """Reject AAL1 tokens when the account has verified MFA factors."""
    if _jwt_aal(access_token) == "aal2":
        return
    if not _user_has_verified_mfa(user_id):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="MFA required",
        headers={"X-Auth-AAL": "aal2-required"},
    )


def _cached_token(key: str):
    now = time.time()
    with _TOKEN_CACHE_LOCK:
        cached = _TOKEN_CACHE.get(key)
        if cached is None:
            return None
        if cached[0] <= now:
            _TOKEN_CACHE.pop(key, None)
            return None
        return cached[1]


def _remember_token(key: str, token: str, response) -> None:
    now = time.time()
    expires_at = now + _TOKEN_CACHE_TTL_SEC
    exp = _jwt_claims(token).get("exp")
    if isinstance(exp, (int, float)):
        expires_at = min(expires_at, float(exp))
    if expires_at <= now:
        return
    with _TOKEN_CACHE_LOCK:
        if len(_TOKEN_CACHE) >= _TOKEN_CACHE_MAX_ENTRIES:
            for stale in [k for k, (until, _) in _TOKEN_CACHE.items() if until <= now]:
                _TOKEN_CACHE.pop(stale, None)
        if len(_TOKEN_CACHE) >= _TOKEN_CACHE_MAX_ENTRIES:
            _TOKEN_CACHE.pop(min(_TOKEN_CACHE, key=lambda k: _TOKEN_CACHE[k][0]), None)
        _TOKEN_CACHE[key] = (expires_at, response)


def verify_access_token(token: str, *, fresh: bool = False):
    """Verify JWT via GoTrue (cached up to 60s), with one retry on flaky HTTP transport."""
    key = hashlib.sha256(token.encode()).hexdigest()
    cached = None if fresh else _cached_token(key)
    if cached is not None:
        return cached
    client = create_anon_client()
    last_transport: Exception | None = None
    for attempt in range(2):
        try:
            response = client.auth.get_user(token)
            if response is not None and getattr(response, "user", None) is not None:
                _remember_token(key, token, response)
            return response
        except AuthApiError:
            raise
        except httpx.TransportError as exc:
            last_transport = exc
            if attempt == 0:
                time.sleep(0.15)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Auth service temporarily unavailable",
    ) from last_transport


def _invalid_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )


def verify_identity(token: str) -> tuple[str, str | None]:
    """Return (user id, email) for a valid access token.

    Checked locally against the project's signing keys; GoTrue is only asked when
    the token can't be checked locally (legacy HS256, unknown key, keys unreachable).
    Like PostgREST, a local check accepts a signed-out session until its token expires.
    """
    if local_jwt_enabled():
        try:
            claims = verify_claims(token)
        except InvalidToken as exc:
            raise _invalid_token() from exc
        except LocalVerifyUnavailable:
            pass
        else:
            email = str(claims.get("email") or "").strip() or None
            return str(claims["sub"]), email
    try:
        response = verify_access_token(token)
    except AuthApiError as exc:
        raise _invalid_token() from exc
    user = getattr(response, "user", None)
    if user is None:
        raise _invalid_token()
    return str(user.id), user.email


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> Generator[AuthedUser, None, None]:
    """Verify the Supabase JWT and return a user-scoped DB client."""
    token = credentials.credentials
    user_id, email = verify_identity(token)

    enforce_aal2_if_mfa_enrolled(user_id, token)

    db = create_user_client(token)
    try:
        yield AuthedUser(
            id=user_id,
            email=email,
            access_token=token,
            db=db,
        )
    finally:
        close_user_client(db)


def require_admin(user: AuthedUser = Depends(get_current_user)) -> AuthedUser:
    """Require the caller to be on ADMIN_EMAILS."""
    if not is_admin_email(user.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


def require_admin_aal2(
    user: AuthedUser = Depends(require_admin),
) -> AuthedUser:
    """Require an allowlisted admin with an explicit AAL2 session."""
    if _jwt_aal(user.access_token) != "aal2":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="AAL2 authentication required",
            headers={"X-Auth-AAL": "aal2-required"},
        )
    return user
