"""Optional Cloudflare Turnstile verification for public abuse surfaces."""

from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException, status

from lib.http_client import get_http_client

TURNSTILE_SITEVERIFY_URL = (
    "https://challenges.cloudflare.com/turnstile/v0/siteverify"
)


def turnstile_secret() -> str:
    return (os.getenv("TURNSTILE_SECRET_KEY") or "").strip()


def captcha_enforced() -> bool:
    """When secret is set, public endpoints require a valid captcha token."""
    return bool(turnstile_secret())


def verify_turnstile(
    token: str | None,
    *,
    remoteip: str | None = None,
) -> None:
    secret = turnstile_secret()
    if not secret:
        return
    value = (token or "").strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete the captcha before continuing.",
        )
    if len(value) > 2048:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha failed. Refresh and try again.",
        )

    data: dict[str, Any] = {"secret": secret, "response": value}
    if remoteip:
        data["remoteip"] = remoteip

    try:
        res = get_http_client().post(
            TURNSTILE_SITEVERIFY_URL,
            data=data,
            timeout=8.0,
        )
        res.raise_for_status()
        payload = res.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Captcha verification unavailable. Try again shortly.",
        ) from exc

    if not payload.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha failed. Refresh and try again.",
        )
