"""HTTP cron entrypoints for Free-tier / external schedulers."""

from __future__ import annotations

import hmac
import logging
import os

from fastapi import APIRouter, Header, HTTPException, status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["cron"])


def secret_matches(provided: str | None, expected: str) -> bool:
    """Constant-time compare so response timing does not leak the secret."""
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def require_cron_secret(
    authorization: str | None,
    x_cron_secret: str | None,
) -> None:
    secret = (os.getenv("CRON_SECRET") or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRON_SECRET is not configured",
        )
    provided = (x_cron_secret or "").strip()
    if not provided and authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if not secret_matches(provided, secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid cron secret",
        )


@router.post("/jobs/delivery-outbox")
def run_delivery_outbox_job(
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
):
    """
    Drain durable notification outbox + purge expired rate-limit buckets.
    Auth with CRON_SECRET via Authorization: Bearer <secret> or X-Cron-Secret.
    Use when Render Cron Job is unavailable (e.g. Free web without billing).
    """
    require_cron_secret(authorization, x_cron_secret)
    from lib.db import create_service_client
    from lib.delivery_outbox import process_delivery_outbox

    db = create_service_client()
    result = process_delivery_outbox(db=db)
    try:
        result["expired_rate_limits_purged"] = (
            db.rpc("purge_rate_limit_buckets").execute().data or 0
        )
    except Exception:
        logger.exception("Rate-limit cleanup failed")
        result["expired_rate_limits_purged"] = 0
    return result


@router.post("/jobs/retention")
def run_retention_job(
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
):
    """Delete finished outbox rows, old product events, and old reminder logs."""
    require_cron_secret(authorization, x_cron_secret)
    from lib.db import create_service_client
    from lib.retention import purge_expired_records

    return purge_expired_records(create_service_client())
