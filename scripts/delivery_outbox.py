"""Render cron entry point for the durable delivery outbox."""

from __future__ import annotations

import logging

from dotenv import load_dotenv

load_dotenv()

from lib.delivery_outbox import process_delivery_outbox
from lib.db import create_service_client


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db = create_service_client()
    result = process_delivery_outbox(db=db)
    try:
        result["expired_rate_limits_purged"] = (
            db.rpc("purge_rate_limit_buckets").execute().data or 0
        )
    except Exception:
        logging.exception("Rate-limit cleanup failed")
        result["expired_rate_limits_purged"] = 0
    print(result)
