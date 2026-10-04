"""Per-request memo for repeated read-only lookups (access checks run several per request)."""

from __future__ import annotations

import contextvars
from typing import Any, Callable, Hashable, TypeVar

T = TypeVar("T")

_cache: contextvars.ContextVar[dict[Hashable, Any] | None] = contextvars.ContextVar(
    "request_cache", default=None
)


def start_request_cache() -> contextvars.Token:
    return _cache.set({})


def end_request_cache(token: contextvars.Token) -> None:
    _cache.reset(token)


def memo(key: Hashable, load: Callable[[], T]) -> T:
    """Return the cached value for key in this request; outside a request, always load."""
    cache = _cache.get()
    if cache is None:
        return load()
    if key not in cache:
        cache[key] = load()
    return cache[key]
