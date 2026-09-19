"""Short-lived HMAC tickets proving a landlord beta invite was validated."""

from __future__ import annotations

import hashlib
import hmac
import os
import time


def _ticket_secret() -> str:
    for key in (
        "SIGNUP_TICKET_SECRET",
        "NOTIFY_DIAG_SECRET",
        "CRON_SECRET",
        "SUPABASE_SERVICE_ROLE_KEY",
    ):
        value = (os.getenv(key) or "").strip()
        if value:
            return value
    return ""


def invite_only_signup_enabled() -> bool:
    raw = (os.getenv("INVITE_ONLY_SIGNUP") or "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    # Fall back to the public web flag when API env is unset (single-compose deploys).
    pub = (os.getenv("NEXT_PUBLIC_INVITE_ONLY_SIGNUP") or "").strip().lower()
    return pub in {"1", "true", "yes", "on"}


def issue_signup_ticket(invite_id: str, *, ttl_seconds: int = 900) -> str | None:
    secret = _ticket_secret()
    invite = (invite_id or "").strip()
    if not secret or not invite:
        return None
    exp = int(time.time()) + max(60, ttl_seconds)
    payload = f"{invite}:{exp}".encode()
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def verify_signup_ticket(invite_id: str, ticket: str | None) -> bool:
    secret = _ticket_secret()
    invite = (invite_id or "").strip()
    raw = (ticket or "").strip()
    if not secret or not invite or not raw:
        return False
    try:
        exp_s, sig = raw.split(".", 1)
        exp = int(exp_s)
    except ValueError:
        return False
    if exp < int(time.time()):
        return False
    payload = f"{invite}:{exp}".encode()
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
