"""Client Idempotency-Key header parsing shared by send/admit routes."""

from __future__ import annotations

import re

from fastapi import HTTPException, status

_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


def optional_request_key(raw: object) -> str | None:
    """Return the trimmed key, None when absent, or 400 when malformed."""
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value:
        return None
    if not _KEY_RE.match(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key must be 8-128 letters, digits, or . _ : -",
        )
    return value
