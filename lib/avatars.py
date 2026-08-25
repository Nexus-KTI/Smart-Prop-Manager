"""Profile avatar uploads (public `avatars` bucket)."""

from __future__ import annotations

import os
from typing import Any

AVATARS_BUCKET = "avatars"
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB
ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _supabase_public_url() -> str:
    return (os.getenv("SUPABASE_URL") or "").rstrip("/")


def _ensure_avatars_bucket(client: Any) -> None:
    try:
        client.storage.get_bucket(AVATARS_BUCKET)
        try:
            client.storage.update_bucket(AVATARS_BUCKET, options={"public": True})
        except TypeError:
            client.storage.update_bucket(AVATARS_BUCKET, {"public": True})
    except Exception:
        try:
            client.storage.create_bucket(AVATARS_BUCKET, options={"public": True})
        except TypeError:
            client.storage.create_bucket(AVATARS_BUCKET, public=True)


def public_avatar_url(storage_path: str) -> str:
    base = _supabase_public_url()
    path = storage_path.lstrip("/")
    if not base:
        return path
    return f"{base}/storage/v1/object/public/{AVATARS_BUCKET}/{path}"


def upload_avatar(
    *,
    user_id: str,
    content_type: str,
    file_bytes: bytes,
) -> str:
    """Upload avatar bytes; return public URL."""
    from lib.db import create_service_client

    if not file_bytes:
        raise ValueError("Empty file")
    if len(file_bytes) > MAX_AVATAR_BYTES:
        raise ValueError("Image must be 2 MB or smaller")

    ext = ALLOWED_TYPES.get((content_type or "").lower().strip())
    if not ext:
        raise ValueError("Use a JPEG, PNG, or WebP image")

    client = create_service_client()
    _ensure_avatars_bucket(client)

    path = f"{user_id}/avatar.{ext}"
    storage = client.storage.from_(AVATARS_BUCKET)
    # Clear prior extensions so only one avatar object remains.
    for old_ext in ("jpg", "png", "webp"):
        old_path = f"{user_id}/avatar.{old_ext}"
        if old_path == path:
            continue
        try:
            storage.remove([old_path])
        except Exception:
            pass

    storage.upload(
        path=path,
        file=file_bytes,
        file_options={
            "content-type": content_type,
            "upsert": "true",
        },
    )
    return public_avatar_url(path)
