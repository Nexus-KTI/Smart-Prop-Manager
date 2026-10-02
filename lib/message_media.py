"""Private chat media: photos, short videos, voice notes, and documents."""

from __future__ import annotations

import uuid
from typing import Any

MEDIA_BUCKET = "message-media"
SIGNED_URL_SECONDS = 60 * 60
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
MAX_VIDEO_BYTES = 25 * 1024 * 1024
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MAX_DURATION_MS = 10 * 60 * 1000
MAX_VOICE_MS = 3 * 60 * 1000

_IMAGE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
_VIDEO = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
}
_AUDIO = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
}
_DOCUMENT = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    DOCX_MIME: "docx",
}
_ALIASES = {
    "image/jpg": "image/jpeg",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/mp4a-latm": "audio/mp4",
    "application/x-pdf": "application/pdf",
    "application/vnd.ms-word": "application/msword",
}
_NAME_MIME = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
    "mp4": "video/mp4",
    "mov": "video/quicktime",
    "webm": "video/webm",
    "ogg": "audio/ogg",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": DOCX_MIME,
}
_LABELS = {
    "image": "Photo",
    "video": "Video",
    "audio": "Voice note",
    "document": "Document",
}


def normalize_mime(content_type: str | None) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def _mime_from_name(file_name: str | None) -> str:
    name = (file_name or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return _NAME_MIME.get(ext, "")


def kind_for_mime(mime: str) -> str | None:
    if mime in _IMAGE:
        return "image"
    if mime in _VIDEO:
        return "video"
    if mime in _AUDIO:
        return "audio"
    if mime in _DOCUMENT:
        return "document"
    return None


def _limit_for(kind: str) -> int:
    if kind == "image":
        return MAX_IMAGE_BYTES
    if kind == "audio":
        return MAX_AUDIO_BYTES
    if kind == "document":
        return MAX_DOCUMENT_BYTES
    return MAX_VIDEO_BYTES


def _limit_message(kind: str) -> str:
    if kind == "image":
        return "Photos must be 8 MB or smaller"
    if kind == "audio":
        return "Voice notes must be 8 MB or smaller"
    if kind == "document":
        return "Documents must be 8 MB or smaller"
    return "Videos must be 25 MB or smaller"


def classify_message_media(
    content_type: str | None,
    size: int,
    file_name: str | None = None,
) -> tuple[str, str, str]:
    """Return kind, canonical mime, and extension. Raise ValueError when refused."""
    mime = normalize_mime(content_type)
    if mime in ("", "application/octet-stream"):
        mime = _mime_from_name(file_name)
    mime = _ALIASES.get(mime, mime)
    kind = kind_for_mime(mime)
    if not kind:
        raise ValueError("Use a photo, video, voice note, or document")
    if size <= 0:
        raise ValueError("Empty file")
    if size > _limit_for(kind):
        raise ValueError(_limit_message(kind))
    tables = {"image": _IMAGE, "video": _VIDEO, "audio": _AUDIO, "document": _DOCUMENT}
    return kind, mime, tables[kind][mime]


def assert_image_bytes(data: bytes, mime: str) -> None:
    ok = False
    if mime == "image/jpeg":
        ok = data.startswith(b"\xff\xd8\xff")
    elif mime == "image/png":
        ok = data.startswith(b"\x89PNG\r\n\x1a\n")
    elif mime == "image/gif":
        ok = data.startswith((b"GIF87a", b"GIF89a"))
    elif mime == "image/webp":
        ok = len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if not ok:
        raise ValueError("That photo could not be read")


def assert_document_bytes(data: bytes, mime: str) -> None:
    if data.startswith(b"MZ"):
        raise ValueError("That document could not be read")
    ok = False
    if mime == "application/pdf":
        ok = data.startswith(b"%PDF")
    elif mime == "application/msword":
        ok = data.startswith(b"\xd0\xcf\x11\xe0")
    elif mime == DOCX_MIME:
        ok = data.startswith(b"PK\x03\x04")
    if not ok:
        raise ValueError("That document could not be read")


def document_display_name(file_name: str | None, ext: str) -> str:
    raw = (file_name or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    cleaned = "".join(ch for ch in raw if ch.isprintable() and ch not in "/\\").strip().lstrip(".")
    if not cleaned:
        cleaned = f"document.{ext}"
    if "." not in cleaned:
        cleaned = f"{cleaned}.{ext}"
    if len(cleaned) > 120:
        suffix = cleaned.rsplit(".", 1)[-1][:8]
        stem = cleaned.rsplit(".", 1)[0]
        cleaned = f"{stem[: 119 - len(suffix) - 1]}.{suffix}"
    return cleaned


def clamp_duration_ms(value: Any, *, kind: str) -> int | None:
    if value is None or value == "":
        return None
    try:
        ms = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid duration") from exc
    if ms < 0 or ms > MAX_DURATION_MS:
        raise ValueError("Recording is too long")
    if kind == "audio" and ms > MAX_VOICE_MS:
        raise ValueError("Voice notes can be up to 3 minutes")
    if kind == "image":
        return None
    return ms


def preview_for(body: str, media_kind: str | None) -> str:
    caption = (body or "").strip()
    label = _LABELS.get(media_kind or "")
    if label:
        text = f"{label}: {caption}" if caption else label
    else:
        text = caption
    if len(text) <= 140:
        return text
    return text[:137] + "…"


def _ensure_bucket(client: Any) -> None:
    options = {
        "public": False,
        "file_size_limit": MAX_VIDEO_BYTES,
        "allowed_mime_types": [
            *list(_IMAGE),
            *list(_VIDEO),
            *list(_AUDIO),
            *list(_DOCUMENT),
        ],
    }
    try:
        client.storage.get_bucket(MEDIA_BUCKET)
        try:
            client.storage.update_bucket(MEDIA_BUCKET, options=options)
        except TypeError:
            client.storage.update_bucket(MEDIA_BUCKET, options)
    except Exception:
        try:
            client.storage.create_bucket(MEDIA_BUCKET, options=options)
        except TypeError:
            client.storage.create_bucket(MEDIA_BUCKET, public=False)


def upload_message_media(
    *,
    thread_id: str,
    content_type: str | None,
    file_name: str | None,
    file_bytes: bytes,
) -> dict[str, Any]:
    """Upload bytes to the private bucket. Return columns for the message row."""
    from lib.db import create_service_client

    kind, mime, ext = classify_message_media(content_type, len(file_bytes), file_name)
    if kind == "image":
        assert_image_bytes(file_bytes, mime)
    if kind == "document":
        assert_document_bytes(file_bytes, mime)

    client = create_service_client()
    _ensure_bucket(client)
    path = f"{thread_id}/{uuid.uuid4().hex}.{ext}"
    client.storage.from_(MEDIA_BUCKET).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": mime, "upsert": "false"},
    )
    row = {
        "media_kind": kind,
        "media_path": path,
        "media_mime": mime,
        "media_bytes": len(file_bytes),
    }
    if kind == "document":
        row["media_name"] = document_display_name(file_name, ext)
    return row


def delete_message_media(storage_path: str) -> None:
    from lib.db import create_service_client

    if not storage_path:
        return
    create_service_client().storage.from_(MEDIA_BUCKET).remove([storage_path])


def signed_message_media_url(storage_path: str, *, expires_in: int = SIGNED_URL_SECONDS) -> str:
    from lib.db import create_service_client

    client = create_service_client()
    ttl = max(60, min(SIGNED_URL_SECONDS, int(expires_in)))
    result = client.storage.from_(MEDIA_BUCKET).create_signed_url(storage_path, ttl)
    if isinstance(result, dict):
        return str(
            result.get("signedURL")
            or result.get("signedUrl")
            or result.get("signed_url")
            or ""
        ).strip()
    return str(result or "").strip()


def present_message(row: dict) -> dict:
    """Copy a message row and replace the private path with a signed URL."""
    item = dict(row)
    path = str(item.pop("media_path", None) or "").strip()
    if not path:
        return item
    try:
        url = signed_message_media_url(path)
    except Exception:
        url = ""
    item["media_url"] = url or None
    return item
