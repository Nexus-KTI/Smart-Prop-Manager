"""Request IDs and structured logging for the API."""

from __future__ import annotations

import contextvars
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from lib.request_cache import end_request_cache, start_request_cache

REQUEST_ID_HEADER = "X-Request-ID"
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)
access_logger = logging.getLogger("nexora.access")

# LogRecord attributes that are not user-supplied `extra` fields.
_RESERVED = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "request_id"}


def current_request_id() -> str | None:
    return request_id_var.get()


def accept_request_id(raw: str | None) -> str:
    """Echo a caller's ID only when it is a short safe token; otherwise mint one."""
    value = (raw or "").strip()
    return value if _SAFE_ID.match(value) else uuid.uuid4().hex


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        for key, value in vars(record).items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _json_logs_enabled() -> bool:
    fmt = (os.getenv("LOG_FORMAT") or "").strip().lower()
    if fmt:
        return fmt == "json"
    return bool((os.getenv("RENDER") or "").strip())


def configure_logging() -> None:
    """Root handler for app loggers (uvicorn leaves root unconfigured). Idempotent."""
    root = logging.getLogger()
    if any(getattr(h, "_nexora", False) for h in root.handlers):
        return
    handler = logging.StreamHandler()
    handler._nexora = True  # type: ignore[attr-defined]
    handler.addFilter(RequestIdFilter())
    if _json_logs_enabled():
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(levelname)s [%(request_id)s] %(name)s: %(message)s")
        )
    root.addHandler(handler)
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    # nexora.access replaces uvicorn's access line (which has no request ID).
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


class RequestIdMiddleware:
    """Pure ASGI: assign the request ID, echo it, and write one access line."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        raw = None
        for name, value in scope.get("headers") or []:
            if name == b"x-request-id":
                raw = value.decode("latin-1")
                break
        request_id = accept_request_id(raw)
        token = request_id_var.set(request_id)
        cache_token = start_request_cache()
        _tag_sentry(request_id)
        started = time.perf_counter()
        status_code = 500

        async def send_with_id(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = list(message.get("headers") or [])
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            access_logger.info(
                "%s %s %s",
                scope.get("method"),
                scope.get("path"),
                status_code,
                extra={
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            end_request_cache(cache_token)
            request_id_var.reset(token)


def init_sentry() -> None:
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        return
    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE") or "0.1"),
        send_default_pii=False,
    )


def _tag_sentry(request_id: str) -> None:
    try:
        import sentry_sdk

        sentry_sdk.set_tag("request_id", request_id)
    except Exception:
        pass
