"""Server-side session length backstop (see sql/040_session_policy.sql)."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def revoke_stale_sessions(db: Any | None = None) -> dict[str, Any]:
    """Delete auth sessions past their idle / absolute limit. Never raises."""
    try:
        if db is None:
            from lib.db import create_service_client

            db = create_service_client()
        data = db.rpc("revoke_stale_sessions", {}).execute().data
        revoked = int(data or 0)
        return {"revoked": revoked}
    except Exception:
        logger.exception("revoke_stale_sessions failed")
        return {"revoked": 0, "error": "revoke_failed"}
