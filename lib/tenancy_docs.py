"""Tenancy document storage (private bucket, signed URLs, 2-year default retention)."""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any

DOCS_BUCKET = "tenancy-docs"
DEFAULT_RETENTION_DAYS = 730  # 2 years


def docs_upload_enabled() -> bool:
    """Server flag; mirrors NEXT_PUBLIC_DOCS_UPLOAD_ENABLED (default off)."""
    raw = (
        os.getenv("DOCS_UPLOAD_ENABLED")
        or os.getenv("NEXT_PUBLIC_DOCS_UPLOAD_ENABLED")
        or "false"
    ).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def default_retain_until(*, from_day: date | None = None) -> date:
    start = from_day or date.today()
    return start + timedelta(days=DEFAULT_RETENTION_DAYS)


def _ensure_docs_bucket(client: Any) -> None:
    """Private bucket; Supabase encrypts at rest by default."""
    try:
        client.storage.get_bucket(DOCS_BUCKET)
        try:
            client.storage.update_bucket(DOCS_BUCKET, options={"public": False})
        except TypeError:
            client.storage.update_bucket(DOCS_BUCKET, {"public": False})
    except Exception:
        try:
            client.storage.create_bucket(DOCS_BUCKET, options={"public": False})
        except TypeError:
            client.storage.create_bucket(DOCS_BUCKET, public=False)


def upload_tenancy_document(
    *,
    tenancy_id: str,
    document_id: str,
    file_name: str,
    content_type: str,
    file_bytes: bytes,
) -> str:
    """Upload bytes; return storage_path (not a public URL)."""
    from lib.db import create_service_client

    if not docs_upload_enabled():
        raise RuntimeError("Document upload is disabled")
    if not file_bytes:
        raise ValueError("file_bytes is required")

    client = create_service_client()
    _ensure_docs_bucket(client)

    safe_name = (file_name or "document.pdf").replace("/", "_").strip() or "document.pdf"
    path = f"{tenancy_id}/{document_id}_{safe_name}"
    storage = client.storage.from_(DOCS_BUCKET)
    storage.upload(
        path=path,
        file=file_bytes,
        file_options={
            "content-type": content_type or "application/pdf",
            "upsert": "true",
        },
    )
    return path


def signed_document_url(storage_path: str, *, expires_in: int = 3600) -> str:
    from lib.db import create_service_client

    client = create_service_client()
    storage = client.storage.from_(DOCS_BUCKET)
    result = storage.create_signed_url(storage_path, expires_in)
    if isinstance(result, dict):
        return str(
            result.get("signedURL")
            or result.get("signedUrl")
            or result.get("signed_url")
            or ""
        ).strip()
    return str(result or "").strip()
