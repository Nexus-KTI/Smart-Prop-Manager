"""ASGI request limits for bounded tenancy-document multipart uploads."""

from __future__ import annotations

import json
import re
from typing import Any

from lib.tenancy_docs import MAX_DOCUMENT_BYTES

DOCUMENT_MULTIPART_OVERHEAD_BYTES = 256 * 1024
DOCUMENT_REQUEST_BYTES = MAX_DOCUMENT_BYTES + DOCUMENT_MULTIPART_OVERHEAD_BYTES
_DOCUMENT_UPLOAD_PATH = re.compile(
    r"^/tenancies/[^/]+/(?:documents|document-requests/[^/]+/submissions)/?$"
)


class DocumentUploadLimitMiddleware:
    """Reject oversized document requests before multipart parsing."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or not _DOCUMENT_UPLOAD_PATH.fullmatch(scope.get("path") or "")
        ):
            await self.app(scope, receive, send)
            return

        headers = {
            key.lower(): value
            for key, value in scope.get("headers", [])
        }
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                if int(raw_length) > DOCUMENT_REQUEST_BYTES:
                    await self._reject(send)
                    return
            except ValueError:
                await self._reject(send)
                return

        body = bytearray()
        while True:
            message = await receive()
            if message.get("type") == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > DOCUMENT_REQUEST_BYTES:
                await self._reject(send)
                return
            if not message.get("more_body", False):
                break

        delivered = False

        async def replay():
            nonlocal delivered
            if delivered:
                return {"type": "http.request", "body": b"", "more_body": False}
            delivered = True
            return {
                "type": "http.request",
                "body": bytes(body),
                "more_body": False,
            }

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(send) -> None:
        payload = json.dumps(
            {"detail": "Document request exceeds the 8 MB file limit"}
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": payload})
