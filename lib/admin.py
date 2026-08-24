"""Admin allowlist helpers — env ADMIN_EMAILS union public.admin_allowlist."""

from __future__ import annotations

import os
from functools import lru_cache

from lib.db import create_anon_client, create_service_client


def admin_emails_from_env() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


@lru_cache(maxsize=1)
def admin_emails_from_db() -> set[str]:
    """Load allowlist emails from Supabase (service role preferred)."""
    try:
        try:
            client = create_service_client()
        except RuntimeError:
            client = create_anon_client()
        rows = client.table("admin_allowlist").select("email").execute().data or []
        return {
            str(row.get("email") or "").strip().lower()
            for row in rows
            if row.get("email")
        }
    except Exception:
        return set()


def admin_emails() -> set[str]:
    return admin_emails_from_env() | admin_emails_from_db()


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    return email.strip().lower() in admin_emails()


def clear_admin_email_cache() -> None:
    admin_emails_from_db.cache_clear()
