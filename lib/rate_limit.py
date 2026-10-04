"""Postgres-backed rate limiting shared by every API worker."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status


def _trust_proxy() -> bool:
    raw = (os.getenv("TRUST_PROXY") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def client_ip(request: Request) -> str:
    """
    Resolve client IP for rate limits.

    By default ignore X-Forwarded-For (spoofable). When TRUST_PROXY=1 behind a
    known edge (Render/CF), prefer CF-Connecting-IP, else the left-most
    X-Forwarded-For hop set by the proxy.
    """
    if _trust_proxy():
        cf = (request.headers.get("cf-connecting-ip") or "").strip()
        if cf:
            return cf
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",")
        if forwarded and forwarded[0].strip():
            return forwarded[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


INVITES_PER_HOUR = 30


def consume_rate_limit(
    key: str,
    *,
    limit: int,
    window_seconds: float,
) -> tuple[bool, int]:
    """Count one hit in a Postgres fixed window. Returns (allowed, retry_after_seconds).

    Raises when the limiter itself is unavailable; callers choose fail-open or closed.
    """
    from lib.db import create_service_client

    if limit < 1 or window_seconds < 1:
        raise ValueError("Rate-limit bounds must be positive")
    key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
    data = (
        create_service_client()
        .rpc(
            "consume_rate_limit",
            {
                "p_key_hash": key_hash,
                "p_limit": int(limit),
                "p_window_seconds": max(1, int(window_seconds)),
            },
        )
        .execute()
        .data
    )
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict) or "allowed" not in data:
        raise RuntimeError("Invalid rate-limit response")
    if data["allowed"]:
        return True, 0
    try:
        reset_at = datetime.fromisoformat(
            str(data.get("reset_at") or "").replace("Z", "+00:00")
        )
        retry_after = max(
            1,
            int((reset_at - datetime.now(timezone.utc)).total_seconds()) + 1,
        )
    except (TypeError, ValueError):
        retry_after = max(1, int(window_seconds))
    return False, retry_after


def enforce_rate_limit(
    key: str,
    *,
    limit: int,
    window_seconds: float,
    detail: str = "Too many requests. Try again shortly.",
) -> None:
    """Fixed window enforced atomically in Postgres; fail closed if unavailable."""
    try:
        allowed, retry_after = consume_rate_limit(
            key, limit=limit, window_seconds=window_seconds
        )
    except ValueError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Request protection temporarily unavailable. Try again shortly.",
        ) from exc

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )


def enforce_invite_limit(user_id: str) -> None:
    """Invites send SMS/email on our account; cap them per landlord."""
    enforce_rate_limit(
        f"invite:{user_id}",
        limit=INVITES_PER_HOUR,
        window_seconds=3600,
        detail="Too many invites sent this hour. Try again later.",
    )
