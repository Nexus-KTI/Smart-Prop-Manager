"""Shared bounded HTTP transport for stateless outbound provider calls."""

from __future__ import annotations

import threading

import httpx

_lock = threading.Lock()
_client: httpx.Client | None = None

DEFAULT_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=20.0,
    write=15.0,
    pool=5.0,
)
PAYMENT_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=40.0,
    write=20.0,
    pool=5.0,
)


def get_http_client() -> httpx.Client:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = httpx.Client(
                    timeout=DEFAULT_TIMEOUT,
                    limits=httpx.Limits(
                        max_connections=50,
                        max_keepalive_connections=20,
                        keepalive_expiry=30.0,
                    ),
                    follow_redirects=False,
                )
    return _client


def close_http_client() -> None:
    global _client
    with _lock:
        if _client is not None:
            _client.close()
            _client = None
