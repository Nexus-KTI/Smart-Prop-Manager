"""Maintenance request photo uploads (public `maintenance-photos` bucket)."""

from __future__ import annotations

import os
import uuid
from typing import Any

PHOTOS_BUCKET = "maintenance-photos"
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _supabase_public_url() -> str:
    return (os.getenv("SUPABASE_URL") or "").rstrip("/")


def _ensure_photos_bucket(client: Any) -> None:
    try:
        client.storage.get_bucket(PHOTOS_BUCKET)
        try:
            client.storage.update_bucket(PHOTOS_BUCKET, options={"public": True})
        except TypeError:
            client.storage.update_bucket(PHOTOS_BUCKET, {"public": True})
    except Exception:
        try:
            client.storage.create_bucket(PHOTOS_BUCKET, options={"public": True})
        except TypeError:
            client.storage.create_bucket(PHOTOS_BUCKET, public=True)


def public_photo_url(storage_path: str) -> str:
    base = _supabase_public_url()
    path = storage_path.lstrip("/")
    if not base:
        return path
    return f"{base}/storage/v1/object/public/{PHOTOS_BUCKET}/{path}"


def upload_maintenance_photo(
    *,
    user_id: str,
    content_type: str,
    file_bytes: bytes,
) -> str:
    """Upload maintenance photo bytes; return public URL."""
    from lib.db import create_service_client

    if not file_bytes:
        raise ValueError("Empty file")
    if len(file_bytes) > MAX_PHOTO_BYTES:
        raise ValueError("Image must be 5 MB or smaller")

    ext = ALLOWED_TYPES.get((content_type or "").lower().strip())
    if not ext:
        raise ValueError("Use a JPEG, PNG, or WebP image")

    client = create_service_client()
    _ensure_photos_bucket(client)

    path = f"{user_id}/{uuid.uuid4().hex}.{ext}"
    storage = client.storage.from_(PHOTOS_BUCKET)
    storage.upload(
        path=path,
        file=file_bytes,
        file_options={
            "content-type": content_type,
            "upsert": "false",
        },
    )
    return public_photo_url(path)
