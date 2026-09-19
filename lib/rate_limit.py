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


def enforce_rate_limit(
    key: str,
    *,
    limit: int,
    window_seconds: float,
    detail: str = "Too many requests. Try again shortly.",
) -> None:
    """Fixed window enforced atomically in Postgres; fail closed if unavailable."""
    from lib.db import create_service_client

    if limit < 1 or window_seconds < 1:
        raise ValueError("Rate-limit bounds must be positive")
    key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
    try:
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
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Request protection temporarily unavailable. Try again shortly.",
        ) from exc

    if not data["allowed"]:
        retry_after = 1
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
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )
