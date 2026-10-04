"""Daily data retention for the outbox, product events, the reminder log, and the Paystack ledger."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

OUTBOX_DAYS = 30
PRODUCT_EVENT_DAYS = 180
REMINDER_MONTHS = 18
PAYSTACK_LEDGER_MONTHS = 12
PURGE_BATCH = 5000
MAX_ROUNDS = 50

_TABLES = ("outbox", "product_events", "reminders")


def _purge_records(db: Any, batch: int) -> dict[str, int]:
    data = (
        db.rpc(
            "purge_expired_records",
            {
                "p_outbox_days": OUTBOX_DAYS,
                "p_event_days": PRODUCT_EVENT_DAYS,
                "p_reminder_months": REMINDER_MONTHS,
                "p_batch": batch,
            },
        )
        .execute()
        .data
    )
    if isinstance(data, list):
        data = data[0] if data else {}
    return {name: int((data or {}).get(name) or 0) for name in _TABLES}


def _purge_ledger(db: Any, batch: int) -> int:
    data = (
        db.rpc(
            "purge_paystack_events",
            {"p_months": PAYSTACK_LEDGER_MONTHS, "p_batch": batch},
        )
        .execute()
        .data
    )
    if isinstance(data, list):
        data = data[0] if data else 0
    return int(data or 0)


def purge_expired_records(
    db: Any,
    *,
    batch: int = PURGE_BATCH,
    max_rounds: int = MAX_ROUNDS,
) -> dict[str, int]:
    """Delete rows past their window, one short transaction per round."""
    totals = {name: 0 for name in (*_TABLES, "paystack_events")}
    records_done = ledger_done = False
    rounds = 0
    while rounds < max_rounds:
        rounds += 1
        if not records_done:
            counts = _purge_records(db, batch)
            for name, count in counts.items():
                totals[name] += count
            records_done = all(count < batch for count in counts.values())
        if not ledger_done:
            deleted = _purge_ledger(db, batch)
            totals["paystack_events"] += deleted
            ledger_done = deleted < batch
        if records_done and ledger_done:
            break
    else:
        logger.warning("Retention stopped after %s rounds; more rows remain", max_rounds)
    totals["rounds"] = rounds
    return totals
