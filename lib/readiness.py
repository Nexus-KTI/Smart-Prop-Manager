"""Readiness probe: can the API reach Postgres, and is the delivery outbox draining?"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

READY_TIMEOUT_SEC = 2.0
# Matches ops-checklist: investigate ready outbox work older than 15 minutes.
OUTBOX_STALE_SEC = 15 * 60

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ready")


def _oldest_ready_outbox(db: Any) -> str | None:
    rows = (
        db.table("delivery_outbox")
        .select("next_attempt_at")
        .in_("status", ["pending", "retry"])
        .lte("next_attempt_at", datetime.now(timezone.utc).isoformat())
        .order("next_attempt_at")
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0].get("next_attempt_at") if rows else None


def _age_seconds(value: str | None) -> int | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - parsed).total_seconds()))


def check_readiness(db_factory=None) -> tuple[bool, dict]:
    """Return (ready, body). Not ready only when the database is unreachable."""
    if db_factory is None:
        from lib.db import create_service_client as db_factory

    try:
        oldest = _executor.submit(
            lambda: _oldest_ready_outbox(db_factory())
        ).result(timeout=READY_TIMEOUT_SEC)
    except FutureTimeout:
        logger.warning("Readiness: database check exceeded %ss", READY_TIMEOUT_SEC)
        return False, {"status": "not_ready", "database": "timeout"}
    except Exception:
        logger.exception("Readiness: database check failed")
        return False, {"status": "not_ready", "database": "error"}

    age = _age_seconds(oldest)
    return True, {
        "status": "ready",
        "database": "ok",
        "outbox_oldest_ready_seconds": age,
        "outbox": "stale" if age is not None and age > OUTBOX_STALE_SEC else "ok",
    }
