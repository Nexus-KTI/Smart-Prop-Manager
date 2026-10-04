"""Long-running worker: drains the delivery outbox and runs the daily jobs.

Started by scripts/worker.py (Render background worker). Every job it calls is
idempotent, so it can overlap with the GitHub Actions schedule during cutover.
"""

from __future__ import annotations

import logging
import signal
import threading
import time
from datetime import date, datetime, timezone
from typing import Any, Callable

from lib.reminder_job import LAGOS

logger = logging.getLogger(__name__)

DRAIN_INTERVAL_SEC = 10.0
DRAIN_BATCH = 25
RATE_LIMIT_PURGE_SEC = 3600.0
DAILY_HOUR_LAGOS = 7
# consume_rate_limit caps windows at one day; the date in the key covers the rest.
DAILY_GUARD_WINDOW_SEC = 86400


def daily_due(now: datetime, last_run: date | None) -> date | None:
    """The Lagos date to run the daily jobs for, or None if not yet / already done."""
    local = now.astimezone(LAGOS)
    if local.hour < DAILY_HOUR_LAGOS or last_run == local.date():
        return None
    return local.date()


def claim_daily_run(day: date) -> bool:
    """True for the first claim of a Lagos day across restarts and instances."""
    from lib.rate_limit import consume_rate_limit

    allowed, _ = consume_rate_limit(
        f"worker-daily:{day.isoformat()}",
        limit=1,
        window_seconds=DAILY_GUARD_WINDOW_SEC,
    )
    return allowed


def _service_db() -> Any:
    from lib.db import create_service_client

    return create_service_client()


def _drain(db: Any) -> dict[str, int]:
    from lib.delivery_outbox import process_delivery_outbox

    return process_delivery_outbox(db=db, batch_size=DRAIN_BATCH)


def _purge_rate_limits(db: Any) -> int:
    return int(db.rpc("purge_rate_limit_buckets").execute().data or 0)


def _reminder_jobs() -> dict[str, Any]:
    from lib.reminder_job import run_reminder_jobs

    return run_reminder_jobs()


def _retention(db: Any) -> dict[str, int]:
    from lib.retention import purge_expired_records

    return purge_expired_records(db)


class Worker:
    def __init__(
        self,
        *,
        db_factory: Callable[[], Any] = _service_db,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        monotonic: Callable[[], float] = time.monotonic,
    ):
        self._db_factory = db_factory
        self._clock = clock
        self._monotonic = monotonic
        self._stop = threading.Event()
        self.last_daily: date | None = None
        self._last_rate_limit_purge: float | None = None

    def stop(self, *_: Any) -> None:
        self._stop.set()

    @property
    def stopping(self) -> bool:
        return self._stop.is_set()

    def tick(self) -> float:
        """One pass; returns seconds to wait before the next pass."""
        claimed = 0
        try:
            stats = _drain(self._db_factory())
            claimed = int(stats.get("claimed") or 0)
            if claimed:
                logger.info("Outbox drained", extra={"outbox": stats})
        except Exception:
            logger.exception("Outbox drain failed")

        self._maybe_purge_rate_limits()
        self._maybe_run_daily()
        return 0.0 if claimed >= DRAIN_BATCH else DRAIN_INTERVAL_SEC

    def _maybe_purge_rate_limits(self) -> None:
        now = self._monotonic()
        last = self._last_rate_limit_purge
        if last is not None and now - last < RATE_LIMIT_PURGE_SEC:
            return
        self._last_rate_limit_purge = now
        try:
            _purge_rate_limits(self._db_factory())
        except Exception:
            logger.exception("Rate-limit cleanup failed")

    def _maybe_run_daily(self) -> None:
        day = daily_due(self._clock(), self.last_daily)
        if day is None:
            return
        try:
            claimed = claim_daily_run(day)
        except Exception:
            logger.exception("Daily job guard unavailable; retrying next pass")
            return
        self.last_daily = day
        if not claimed:
            logger.info("Daily jobs already ran for %s", day.isoformat())
            return

        logger.info("Daily jobs starting for %s", day.isoformat())
        try:
            logger.info("Reminder jobs done", extra={"jobs": _reminder_jobs()})
        except Exception:
            logger.exception("Reminder jobs failed for %s", day.isoformat())
        try:
            logger.info("Retention done", extra={"retention": _retention(self._db_factory())})
        except Exception:
            logger.exception("Retention failed for %s", day.isoformat())

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        logger.info("Worker started")
        while not self.stopping:
            delay = self.tick()
            if delay:
                self._stop.wait(delay)
        logger.info("Worker stopped")
