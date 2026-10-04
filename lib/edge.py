"""API edge: security headers and an opt-in Host allowlist (pure ASGI)."""

from __future__ import annotations

import json
import os
from typing import Any

# FastAPI's Swagger/ReDoc pages load scripts from a CDN; everything else is JSON.
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
_API_CSP = b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
_BASE_HEADERS = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
)
_HSTS = (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
# Render's health checker may not send the public hostname.
_HOST_EXEMPT_PATHS = frozenset({"/health"})


def _on_render() -> bool:
    return bool((os.getenv("RENDER") or "").strip())


def _is_docs(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in _DOCS_PATHS)


class SecurityHeadersMiddleware:
    def __init__(self, app: Any, *, hsts: bool | None = None) -> None:
        self.app = app
        self.hsts = _on_render() if hsts is None else hsts

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        extra = list(_BASE_HEADERS)
        if not _is_docs(scope.get("path") or ""):
            extra.append((b"content-security-policy", _API_CSP))
        if self.hsts:
            extra.append(_HSTS)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                present = {name.lower() for name, _ in headers}
                headers.extend(h for h in extra if h[0] not in present)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


def allowed_hosts_from_env() -> list[str]:
    """ALLOWED_HOSTS (comma list, `*.example.com` wildcards). Empty = not enforced."""
    raw = os.getenv("ALLOWED_HOSTS") or ""
    return [h.strip().lower() for h in raw.split(",") if h.strip()]


def host_allowed(host: str, allowed: list[str]) -> bool:
    name = host.lower()
    if name.startswith("["):
        name = name.split("]", 1)[0] + "]"
    else:
        name = name.rsplit(":", 1)[0] if name.count(":") == 1 else name
    for pattern in allowed:
        if pattern == "*" or pattern == name:
            return True
        if pattern.startswith("*.") and name.endswith(pattern[1:]):
            return True
    return False


class TrustedHostMiddleware:
    """400 for a Host header outside ALLOWED_HOSTS; pass-through when unset."""

    def __init__(self, app: Any, *, allowed: list[str] | None = None) -> None:
        self.app = app
        self.allowed = allowed_hosts_from_env() if allowed is None else allowed

    async def __call__(self, scope, receive, send) -> None:
        if (
            not self.allowed
            or scope["type"] not in ("http", "websocket")
            or (scope.get("path") or "") in _HOST_EXEMPT_PATHS
        ):
            await self.app(scope, receive, send)
            return
        host = ""
        for name, value in scope.get("headers") or []:
            if name == b"host":
                host = value.decode("latin-1")
                break
        if host and host_allowed(host, self.allowed):
            await self.app(scope, receive, send)
            return
        body = json.dumps({"detail": "Invalid host header"}).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 400,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
