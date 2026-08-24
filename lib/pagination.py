"""Cursor pagination helpers (timestamp + id keyset)."""

from __future__ import annotations

import base64
import json
from typing import Any

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50


def page_size(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_PAGE_SIZE
    return max(1, min(int(limit), MAX_PAGE_SIZE))


def encode_cursor(timestamp: str, row_id: str) -> str:
    payload = json.dumps({"t": timestamp, "i": row_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str | None) -> tuple[str, str] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        data = json.loads(raw)
        timestamp = data.get("t")
        row_id = data.get("i")
        if not timestamp or not row_id:
            return None
        return str(timestamp), str(row_id)
    except (ValueError, json.JSONDecodeError, KeyError, TypeError):
        return None


def apply_desc_cursor(
    query: Any,
    cursor: str | None,
    column: str = "created_at",
) -> Any:
    """Restrict to rows before the cursor when ordering by column desc, id desc."""
    decoded = decode_cursor(cursor)
    if not decoded:
        return query
    timestamp, row_id = decoded
    return query.or_(
        f"{column}.lt.{timestamp},and({column}.eq.{timestamp},id.lt.{row_id})"
    )


def paginate_desc(
    rows: list[dict[str, Any]],
    size: int,
    column: str = "created_at",
) -> tuple[list[dict[str, Any]], str | None]:
    """Trim a limit+1 fetch and build the next cursor from the last kept row."""
    if len(rows) <= size:
        return rows, None
    page = rows[:size]
    last = page[-1]
    timestamp = last.get(column)
    row_id = last.get("id")
    if not timestamp or not row_id:
        return page, None
    return page, encode_cursor(str(timestamp), str(row_id))
