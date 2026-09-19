"""Notify diagnostics (OTP delivery checks) — secret + rate limited."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException, Query, Request, status

from lib.rate_limit import client_ip, enforce_rate_limit

router = APIRouter(prefix="/notify", tags=["notify"])
logger = logging.getLogger(__name__)


def _normalize_phone(raw: str) -> str:
    value = (raw or "").strip().removeprefix("whatsapp:")
    if not value.startswith("+"):
        digits = re.sub(r"\D", "", value)
        if digits.startswith("0") and len(digits) >= 10:
            return f"+234{digits.lstrip('0')}"
        if digits.startswith("234"):
            return f"+{digits}"
        return f"+{digits}" if digits else value
    return value


def _require_diag_secret(secret: str | None) -> None:
    expected = (os.getenv("NOTIFY_DIAG_SECRET") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMS delivery diagnostics are disabled",
        )
    if not secret or secret.strip() != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )


@router.get("/sms-delivery")
def sms_delivery_status(
    request: Request,
    phone: str = Query(..., min_length=8, description="E.164 phone that should have received SMS"),
    x_notify_diag_secret: str | None = Header(default=None, alias="X-Notify-Diag-Secret"),
):
    """
    Look up the most recent Twilio outbound SMS to this number.

    Requires NOTIFY_DIAG_SECRET (server-side Next proxy only). Rate-limited.
    Used when Supabase accepts OTP send but Twilio fails silently.
    """
    _require_diag_secret(x_notify_diag_secret)
    to = _normalize_phone(phone)
    ip = client_ip(request)
    enforce_rate_limit(
        f"sms-diag:ip:{ip}",
        limit=10,
        window_seconds=60,
        detail="Too many SMS delivery checks. Try again shortly.",
    )
    enforce_rate_limit(
        f"sms-diag:phone:{to}",
        limit=5,
        window_seconds=60,
        detail="Too many SMS delivery checks for this number.",
    )

    account_sid = (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
    auth_token = (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
    if not account_sid or not auth_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Twilio is not configured on the API",
        )

    if len(re.sub(r"\D", "", to)) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="phone must be a valid E.164 number",
        )

    try:
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        account = client.api.accounts(account_sid).fetch()
        account_type = (getattr(account, "type", None) or "").strip() or None
        is_trial = (account_type or "").lower() == "trial"

        since = datetime.now(timezone.utc) - timedelta(minutes=5)
        messages = client.messages.list(to=to, date_sent_after=since, limit=5)

        if not messages:
            return {
                "phone": to,
                "found": False,
                "account_type": "trial" if is_trial else "live",
                "status": None,
                "error_code": None,
                "error_message": None,
                "hint": (
                    "No SMS in the last 5 minutes on the API Twilio account. "
                    "Login OTP is sent by Supabase Auth Phone provider: update "
                    "Twilio SID/token/From there to match .env. Also verify the "
                    "phone under Twilio Verified Caller IDs if the account is Trial."
                ),
            }

        latest = messages[0]
        err_code = getattr(latest, "error_code", None)
        err_msg = (getattr(latest, "error_message", None) or "").strip() or None
        msg_status = (getattr(latest, "status", None) or "").strip() or None

        hint = None
        if err_code == 21608 or (err_msg and "unverified" in err_msg.lower()):
            hint = (
                "Twilio trial cannot SMS unverified numbers. Verify this phone in "
                "Twilio Console > Phone Numbers > Verified Caller IDs, or upgrade "
                "the Twilio account."
            )
        elif msg_status in {"failed", "undelivered"}:
            hint = err_msg or f"Twilio SMS status={msg_status}."
        elif msg_status in {"queued", "sending", "sent", "delivered", "receiving", "received"}:
            hint = None

        return {
            "phone": to,
            "found": True,
            "account_type": "trial" if is_trial else "live",
            "status": msg_status,
            "error_code": err_code,
            "error_message": err_msg,
            "hint": hint,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("sms-delivery lookup failed for %s", to)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not query Twilio",
        ) from exc
