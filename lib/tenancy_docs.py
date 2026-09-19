"""Tenancy document storage and launch gates.

Production capabilities stay off until legal/security approval and explicit
bucket provisioning. This module never creates or changes a bucket at runtime.
"""

from __future__ import annotations

import hashlib
import os
import re
import socket
import struct
import zlib
from datetime import date, timedelta
from pathlib import PurePath
from typing import Any, Iterable

DOCS_BUCKET = "tenancy-docs"
DEFAULT_RETENTION_DAYS = 730  # 2 years
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
SIGNED_URL_SECONDS = 15 * 60

ALLOWED_DOCUMENT_TYPES = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
    }
)
_EXTENSION_BY_TYPE = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_ACK_VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
_SCAN_CHUNK_BYTES = 64 * 1024
_MAX_IMAGE_PIXELS = 40_000_000
_JPEG_SOF_MARKERS = frozenset(
    {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
)


def _flag(name: str) -> bool:
    raw = (os.getenv(name) or "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def docs_read_enabled() -> bool:
    """Emergency read/download kill switch. Server-only and default off."""
    return _flag("DOCS_READ_ENABLED")


def docs_write_enabled() -> bool:
    """Upload/delete/acknowledge gate. Server-only and default off."""
    return _flag("DOCS_UPLOAD_ENABLED")


def docs_retention_purge_enabled() -> bool:
    """Independent destructive-operation gate; default off."""
    return _flag("DOCS_RETENTION_PURGE_ENABLED")


def docs_requests_enabled() -> bool:
    return docs_read_enabled() and _flag("DOC_REQUESTS_ENABLED")


def tenant_doc_submissions_enabled() -> bool:
    return docs_upload_enabled() and _flag("TENANT_DOC_SUBMISSIONS_ENABLED")


def docs_review_enabled() -> bool:
    return docs_read_enabled() and _flag("DOC_REVIEW_ENABLED")


def privacy_cases_enabled() -> bool:
    return _flag("PRIVACY_CASES_ENABLED")


def document_acknowledgment_version() -> str | None:
    """Counsel-approved receipt/read text version; no wording lives here."""
    value = (os.getenv("DOCS_ACK_TEXT_VERSION") or "").strip()
    return value if _ACK_VERSION.fullmatch(value) else None


def docs_upload_enabled() -> bool:
    """Backward-compatible name for callers; upload needs read + write."""
    return docs_read_enabled() and docs_write_enabled()


def document_capabilities() -> dict[str, bool]:
    read = docs_read_enabled()
    write = docs_write_enabled()
    return {
        "read": read,
        "upload": read and write,
        "acknowledge": read and write and bool(document_acknowledgment_version()),
        "delete": read and write,
    }


def collection_capabilities(actor_role: str) -> dict[str, bool]:
    requests = docs_requests_enabled()
    submit = requests and tenant_doc_submissions_enabled()
    review = docs_review_enabled()
    return {
        "request": requests and actor_role == "landlord",
        "cancel_request": requests and actor_role == "landlord",
        "submit_requested": submit and actor_role == "tenant",
        "replace": submit and actor_role == "tenant",
        "review": review and actor_role == "landlord",
        "open": docs_read_enabled(),
        "privacy_request": privacy_cases_enabled() and actor_role == "tenant",
    }


def default_retain_until(*, from_day: date | None = None) -> date:
    start = from_day or date.today()
    return start + timedelta(days=DEFAULT_RETENTION_DAYS)


def safe_document_name(file_name: str, content_type: str) -> str:
    """Display-only filename; object paths never include user-provided names."""
    name = PurePath((file_name or "").replace("\\", "/")).name
    name = _CONTROL_CHARS.sub("", name).strip().strip(".")
    if not name:
        name = f"document{_EXTENSION_BY_TYPE[content_type]}"
    expected_extension = _EXTENSION_BY_TYPE[content_type]
    suffix = PurePath(name).suffix.lower()
    allowed_suffixes = {expected_extension}
    if content_type == "image/jpeg":
        allowed_suffixes.add(".jpeg")
    if suffix not in allowed_suffixes:
        stem = PurePath(name).stem.rstrip(". ") or "document"
        name = f"{stem}{expected_extension}"
    if len(name) > 160:
        stem = PurePath(name).stem[:120].rstrip()
        name = f"{stem or 'document'}{expected_extension}"
    return name


def detected_content_type(file_bytes: bytes) -> str | None:
    if file_bytes.startswith(b"%PDF-"):
        return "application/pdf"
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    return None


def _valid_pdf(file_bytes: bytes) -> bool:
    tail = file_bytes[-2048:]
    if len(file_bytes) < 32 or b"%%EOF" not in tail or b"startxref" not in tail:
        return False
    if b"/Encrypt" in file_bytes:
        return False
    return bool(re.match(rb"%PDF-[12]\.[0-9]", file_bytes[:8]))


def _valid_png(file_bytes: bytes) -> bool:
    if len(file_bytes) < 45:
        return False
    offset = 8
    saw_ihdr = False
    while offset + 12 <= len(file_bytes):
        length = int.from_bytes(file_bytes[offset : offset + 4], "big")
        chunk_type = file_bytes[offset + 4 : offset + 8]
        chunk_end = offset + 12 + length
        if length > MAX_DOCUMENT_BYTES or chunk_end > len(file_bytes):
            return False
        data = file_bytes[offset + 8 : offset + 8 + length]
        expected_crc = int.from_bytes(
            file_bytes[offset + 8 + length : chunk_end],
            "big",
        )
        if zlib.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            return False
        if not saw_ihdr:
            if chunk_type != b"IHDR" or length != 13:
                return False
            width = int.from_bytes(data[:4], "big")
            height = int.from_bytes(data[4:8], "big")
            if width <= 0 or height <= 0 or width * height > _MAX_IMAGE_PIXELS:
                return False
            saw_ihdr = True
        if chunk_type == b"IEND":
            return length == 0 and chunk_end == len(file_bytes)
        offset = chunk_end
    return False


def _valid_jpeg(file_bytes: bytes) -> bool:
    if len(file_bytes) < 16 or not file_bytes.endswith(b"\xff\xd9"):
        return False
    offset = 2
    while offset + 4 <= len(file_bytes):
        if file_bytes[offset] != 0xFF:
            return False
        while offset < len(file_bytes) and file_bytes[offset] == 0xFF:
            offset += 1
        if offset >= len(file_bytes):
            return False
        marker = file_bytes[offset]
        offset += 1
        if marker == 0xDA:
            return False
        if marker in {0x01, 0xD8, 0xD9}:
            continue
        if offset + 2 > len(file_bytes):
            return False
        segment_length = int.from_bytes(file_bytes[offset : offset + 2], "big")
        if segment_length < 2 or offset + segment_length > len(file_bytes):
            return False
        if marker in _JPEG_SOF_MARKERS:
            if segment_length < 7:
                return False
            height = int.from_bytes(file_bytes[offset + 3 : offset + 5], "big")
            width = int.from_bytes(file_bytes[offset + 5 : offset + 7], "big")
            return (
                width > 0
                and height > 0
                and width * height <= _MAX_IMAGE_PIXELS
            )
        offset += segment_length
    return False


def valid_document_structure(content_type: str, file_bytes: bytes) -> bool:
    if content_type == "application/pdf":
        return _valid_pdf(file_bytes)
    if content_type == "image/png":
        return _valid_png(file_bytes)
    if content_type == "image/jpeg":
        return _valid_jpeg(file_bytes)
    return False


def validate_document(
    *,
    file_name: str,
    content_type: str,
    file_bytes: bytes,
) -> tuple[str, str, str]:
    """Return safe display name, detected MIME, and SHA-256."""
    if not file_bytes:
        raise ValueError("Document is empty")
    if len(file_bytes) > MAX_DOCUMENT_BYTES:
        raise ValueError("Document exceeds the 8 MB limit")
    declared = (content_type or "").split(";", 1)[0].strip().lower()
    if declared not in ALLOWED_DOCUMENT_TYPES:
        raise ValueError("Only PDF, JPEG, and PNG documents are allowed")
    detected = detected_content_type(file_bytes)
    if not detected or detected != declared:
        raise ValueError("Document content does not match its file type")
    if not valid_document_structure(detected, file_bytes):
        raise ValueError("Document is malformed or unsupported")
    return (
        safe_document_name(file_name, detected),
        detected,
        hashlib.sha256(file_bytes).hexdigest(),
    )


def scan_document(file_bytes: bytes) -> str:
    """Scan bytes through a private ClamAV daemon; fail closed.

    The daemon must be reachable only from the API network. Documents are
    scanned before Storage upload, so untrusted bytes never enter the bucket.
    """
    host = (os.getenv("DOCS_CLAMAV_HOST") or "").strip()
    if not host:
        raise RuntimeError("Document malware scanner is not configured")
    try:
        port = int((os.getenv("DOCS_CLAMAV_PORT") or "3310").strip())
    except ValueError as exc:
        raise RuntimeError("Invalid DOCS_CLAMAV_PORT") from exc

    try:
        with socket.create_connection((host, port), timeout=10.0) as connection:
            connection.sendall(b"zINSTREAM\0")
            for offset in range(0, len(file_bytes), _SCAN_CHUNK_BYTES):
                chunk = file_bytes[offset : offset + _SCAN_CHUNK_BYTES]
                connection.sendall(struct.pack("!I", len(chunk)))
                connection.sendall(chunk)
            connection.sendall(struct.pack("!I", 0))
            connection.settimeout(20.0)
            response_bytes = b""
            while len(response_bytes) < 4096:
                part = connection.recv(4096 - len(response_bytes))
                if not part:
                    break
                response_bytes += part
                if b"\0" in part or b"\n" in part:
                    break
            response = response_bytes.decode(
                "utf-8", errors="replace"
            ).strip("\0\r\n ")
    except OSError as exc:
        raise RuntimeError("Document malware scanner is unavailable") from exc

    if response.endswith(" FOUND"):
        raise ValueError("Document failed the malware scan")
    if not response.endswith(" OK"):
        raise RuntimeError("Document malware scan returned an unknown result")
    return response


def upload_tenancy_document(
    *,
    tenancy_id: str,
    document_id: str,
    content_type: str,
    file_bytes: bytes,
    sha256: str,
) -> str:
    """Upload to a pre-provisioned private bucket; return private path."""
    from lib.db import create_service_client

    if not docs_upload_enabled():
        raise RuntimeError("Document upload is disabled")
    if not file_bytes:
        raise ValueError("file_bytes is required")

    client = create_service_client()
    extension = _EXTENSION_BY_TYPE[content_type]
    path = f"{tenancy_id}/{document_id}/{sha256}{extension}"
    storage = client.storage.from_(DOCS_BUCKET)
    storage.upload(
        path=path,
        file=file_bytes,
        file_options={
            "content-type": content_type,
            "upsert": "false",
        },
    )
    return path


def delete_document_object(storage_path: str) -> None:
    from lib.db import create_service_client

    if not storage_path:
        return
    create_service_client().storage.from_(DOCS_BUCKET).remove([storage_path])


def signed_document_url(
    storage_path: str,
    *,
    expires_in: int = SIGNED_URL_SECONDS,
) -> str:
    from lib.db import create_service_client

    if not docs_read_enabled():
        raise RuntimeError("Document reads are disabled")
    client = create_service_client()
    storage = client.storage.from_(DOCS_BUCKET)
    ttl = max(60, min(SIGNED_URL_SECONDS, int(expires_in)))
    result = storage.create_signed_url(storage_path, ttl)
    if isinstance(result, dict):
        return str(
            result.get("signedURL")
            or result.get("signedUrl")
            or result.get("signed_url")
            or ""
        ).strip()
    return str(result or "").strip()


def retention_due(
    rows: Iterable[dict[str, Any]],
    *,
    on_day: date | None = None,
) -> list[dict[str, Any]]:
    """Pure selection used by the dry-run-first retention job."""
    today = on_day or date.today()
    due: list[dict[str, Any]] = []
    for row in rows:
        if row.get("legal_hold") or row.get("purged_at"):
            continue
        raw = row.get("retain_until")
        try:
            retain_until = raw if isinstance(raw, date) else date.fromisoformat(str(raw))
        except (TypeError, ValueError):
            continue
        if retain_until <= today:
            due.append(dict(row))
    return due
