"""Admin allowlist helpers — env ADMIN_EMAILS union public.admin_allowlist."""

from __future__ import annotations

import os
import threading
import time

from lib.db import create_anon_client, create_service_client

_CACHE_TTL_SECONDS = 60.0
_cache_lock = threading.Lock()
_cached_admin_emails: tuple[float, set[str]] | None = None


def admin_emails_from_env() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def admin_emails_from_db() -> set[str]:
    """Load a short-lived allowlist cache; failures safely grant nobody."""
    global _cached_admin_emails
    now = time.monotonic()
    with _cache_lock:
        cached = _cached_admin_emails
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return set(cached[1])
    try:
        try:
            client = create_service_client()
        except RuntimeError:
            client = create_anon_client()
        rows = client.table("admin_allowlist").select("email").execute().data or []
        emails = {
            str(row.get("email") or "").strip().lower()
            for row in rows
            if row.get("email")
        }
    except Exception:
        emails = set()
    with _cache_lock:
        _cached_admin_emails = (now, emails)
    return set(emails)


def admin_emails() -> set[str]:
    return admin_emails_from_env() | admin_emails_from_db()


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    return email.strip().lower() in admin_emails()


def clear_admin_email_cache() -> None:
    global _cached_admin_emails
    with _cache_lock:
        _cached_admin_emails = None
