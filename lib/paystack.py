"""Paystack payment integration helpers."""

import hashlib
import hmac
import os
from typing import Any

import httpx
from fastapi import HTTPException, status
from starlette.datastructures import Headers

PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify/{reference}"


def verify_webhook_signature(headers: Headers, body: bytes) -> None:
    """Verify Paystack webhook via HMAC SHA512 of the raw body."""
    secret = os.getenv("PAYSTACK_SECRET_KEY")
    if not secret:
        raise RuntimeError("Missing PAYSTACK_SECRET_KEY environment variable")

    signature = headers.get("x-paystack-signature")
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Paystack signature",
        )

    computed = hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha512,
    ).hexdigest()

    if not hmac.compare_digest(computed, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Paystack signature",
        )


def verify_transaction(reference: str) -> dict[str, Any]:
    """Verify a Paystack transaction by reference. Returns the data payload."""
    secret = os.getenv("PAYSTACK_SECRET_KEY")
    if not secret:
        raise RuntimeError("Missing PAYSTACK_SECRET_KEY environment variable")

    if not reference:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing payment reference",
        )

    response = httpx.get(
        PAYSTACK_VERIFY_URL.format(reference=reference),
        headers={"Authorization": f"Bearer {secret}"},
        timeout=30.0,
    )

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from Paystack",
        ) from exc

    if response.status_code >= 400 or not payload.get("status"):
        message = payload.get("message") or "Could not verify Paystack payment"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    data = payload.get("data") or {}
    if data.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment not successful (status: {data.get('status')})",
        )

    return data
