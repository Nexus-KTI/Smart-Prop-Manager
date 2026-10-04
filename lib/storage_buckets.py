"""Public Storage bucket setup, done once per process instead of on every upload."""

from __future__ import annotations

import threading
from typing import Any

_ENSURED: set[str] = set()
_LOCK = threading.Lock()


def ensure_public_bucket(client: Any, bucket: str) -> None:
    """Create `bucket` as public if missing, or keep it public. Cached after success."""
    if bucket in _ENSURED:
        return
    with _LOCK:
        if bucket in _ENSURED:
            return
        try:
            client.storage.get_bucket(bucket)
            try:
                client.storage.update_bucket(bucket, options={"public": True})
            except TypeError:
                client.storage.update_bucket(bucket, {"public": True})
        except Exception:
            try:
                client.storage.create_bucket(bucket, options={"public": True})
            except TypeError:
                client.storage.create_bucket(bucket, public=True)
        _ENSURED.add(bucket)
