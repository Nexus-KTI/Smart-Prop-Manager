"""Paystack payment integration helpers."""

import hashlib
import hmac
import os
import time
from typing import Any

import httpx
from fastapi import HTTPException, status
from starlette.datastructures import Headers

from lib.http_client import PAYMENT_TIMEOUT, get_http_client

PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify/{reference}"
PAYSTACK_CHARGE_URL = "https://api.paystack.co/transaction/charge_authorization"


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

    response: httpx.Response | None = None
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = get_http_client().get(
                PAYSTACK_VERIFY_URL.format(reference=reference),
                headers={"Authorization": f"Bearer {secret}"},
                timeout=PAYMENT_TIMEOUT,
            )
            if response.status_code not in {502, 503, 504}:
                break
        except httpx.TransportError as exc:
            last_error = exc
        if attempt == 0:
            time.sleep(0.15)
    if response is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Paystack verification",
        ) from last_error

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


def charge_authorization(
    *,
    email: str,
    amount_kobo: int,
    authorization_code: str,
    reference: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Charge a saved Paystack authorization.
    Returns the transaction data payload on success.
    """
    secret = os.getenv("PAYSTACK_SECRET_KEY")
    if not secret:
        raise RuntimeError("Missing PAYSTACK_SECRET_KEY environment variable")

    email = (email or "").strip()
    code = (authorization_code or "").strip()
    reference = (reference or "").strip()
    if not email or not code or not reference:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="email, authorization_code, and reference are required",
        )
    if amount_kobo < 10000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be at least ₦100",
        )

    body: dict[str, Any] = {
        "email": email,
        "amount": int(amount_kobo),
        "authorization_code": code,
        "reference": reference,
        "currency": "NGN",
    }
    if metadata:
        body["metadata"] = metadata

    # A charge mutation is never retried here. The caller must verify the stable
    # provider reference before deciding whether to issue another attempt.
    response = get_http_client().post(
        PAYSTACK_CHARGE_URL,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=PAYMENT_TIMEOUT,
    )

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from Paystack",
        ) from exc

    if response.status_code >= 400 or not payload.get("status"):
        message = payload.get("message") or "Could not charge saved card"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    data = payload.get("data") or {}
    status_value = (data.get("status") or "").strip().lower()
    if status_value not in {"success", "ongoing", "pending"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Charge not successful (status: {data.get('status')})",
        )

    # Prefer verify for final success when Paystack returns intermediate status.
    if status_value != "success":
        return verify_transaction(reference)
    return data
