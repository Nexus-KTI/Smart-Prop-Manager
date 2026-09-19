"""Tenancy-document launch gates, file safety, and retention."""

from __future__ import annotations

import asyncio
import os
import zlib
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest
import httpx
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("DOCS_ACK_TEXT_VERSION", "test-receipt-v1")

import lib.tenancy_docs_retention as retention_lib
from lib.tenancy_docs import (
    DEFAULT_RETENTION_DAYS,
    MAX_DOCUMENT_BYTES,
    default_retain_until,
    collection_capabilities,
    document_capabilities,
    docs_read_enabled,
    docs_upload_enabled,
    docs_write_enabled,
    retention_due,
    safe_document_name,
    scan_document,
    signed_document_url,
    upload_tenancy_document,
    validate_document,
)
from lib.tenancy_docs_retention import retention_block_reason, run_retention
from lib.request_limits import (
    DOCUMENT_REQUEST_BYTES,
    DocumentUploadLimitMiddleware,
)
from routers import tenancies

PDF_BYTES = (
    b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
    b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\n"
    b"startxref\n45\n%%EOF\n"
)
JPEG_BYTES = (
    b"\xff\xd8\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xd9"
)


def _png_chunk(kind, data=b""):
    return (
        len(data).to_bytes(4, "big")
        + kind
        + data
        + (zlib.crc32(kind + data) & 0xFFFFFFFF).to_bytes(4, "big")
    )


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    + _png_chunk(
        b"IHDR",
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00",
    )
    + _png_chunk(b"IEND")
)


class FakeQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.filters = []
        self.limit_count = None
        self.operation = "select"
        self.payload = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters.append((key, "eq", value))
        return self

    def is_(self, key, value):
        self.filters.append((key, "is", value))
        return self

    def in_(self, key, values):
        self.filters.append((key, "in", values))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = dict(payload)
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = dict(payload)
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def _matches(self, row):
        for key, op, value in self.filters:
            if op == "eq" and row.get(key) != value:
                return False
            if op == "is" and value == "null" and row.get(key) is not None:
                return False
            if op == "in" and row.get(key) not in value:
                return False
        return True

    def execute(self):
        if self.client.fail_event_insert and (
            self.table_name == "tenancy_document_events"
            and self.operation == "insert"
        ):
            raise RuntimeError("event persistence failed")
        rows = self.client.rows.setdefault(self.table_name, [])
        if (
            self.client.ack_insert_race
            and self.table_name == "tenancy_document_acknowledgments"
            and self.operation == "insert"
        ):
            self.client.ack_insert_race = False
            rows.append({"id": "raced", **self.payload})
            raise RuntimeError("duplicate key")
        if (
            self.client.hold_on_next_document_update
            and self.table_name == "tenancy_documents"
            and self.operation == "update"
        ):
            self.client.hold_on_next_document_update = False
            document_id = next(
                (
                    value
                    for key, op, value in self.filters
                    if key == "id" and op == "eq"
                ),
                None,
            )
            for row in rows:
                if row.get("id") == document_id:
                    row["legal_hold"] = True
        matching = [row for row in rows if self._matches(row)]
        if self.limit_count is not None:
            matching = matching[: self.limit_count]
        if self.operation == "insert":
            rows.append(dict(self.payload))
            return SimpleNamespace(data=[dict(self.payload)])
        if self.operation == "update":
            for row in matching:
                row.update(self.payload)
            return SimpleNamespace(data=[dict(row) for row in matching])
        if self.operation == "delete":
            self.client.rows[self.table_name] = [
                row for row in rows if not self._matches(row)
            ]
            return SimpleNamespace(data=[dict(row) for row in matching])
        return SimpleNamespace(data=[dict(row) for row in matching])


class FakeClient:
    def __init__(
        self,
        rows=None,
        *,
        fail_event_insert=False,
        hold_on_next_document_update=False,
        ack_insert_race=False,
    ):
        self.rows = rows or {}
        self.fail_event_insert = fail_event_insert
        self.hold_on_next_document_update = hold_on_next_document_update
        self.ack_insert_race = ack_insert_race

    def table(self, name):
        return FakeQuery(self, name)


class FakeRpcQuery:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return SimpleNamespace(data=self.data)


class FakeRpcClient(FakeClient):
    def __init__(self, rows=None, rpc_results=None):
        super().__init__(rows)
        self.rpc_results = rpc_results or {}
        self.rpc_calls = []

    def rpc(self, name, params):
        self.rpc_calls.append((name, dict(params)))
        return FakeRpcQuery(self.rpc_results.get(name))


class FakeBucket:
    def __init__(self):
        self.uploads = []
        self.signed_expiry = None

    def upload(self, **kwargs):
        self.uploads.append(kwargs)

    def create_signed_url(self, path, expires_in):
        self.signed_expiry = (path, expires_in)
        return {"signedURL": "https://signed.example/document"}


class FakeStorage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, name):
        assert name == "tenancy-docs"
        return self.bucket


class FakeStorageClient:
    def __init__(self, bucket):
        self.storage = FakeStorage(bucket)


class FakeScanConnection:
    def __init__(self, response):
        self.response = response
        self.sent = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def sendall(self, payload):
        self.sent.append(payload)

    def settimeout(self, _seconds):
        return None

    def recv(self, _size):
        response, self.response = self.response, b""
        return response


def test_docs_upload_defaults_off(monkeypatch):
    monkeypatch.delenv("DOCS_READ_ENABLED", raising=False)
    monkeypatch.delenv("DOCS_UPLOAD_ENABLED", raising=False)
    assert docs_upload_enabled() is False


def test_server_flags_are_authoritative(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.delenv("DOCS_READ_ENABLED", raising=False)
    monkeypatch.delenv("DOCS_UPLOAD_ENABLED", raising=False)
    assert docs_read_enabled() is False
    assert docs_write_enabled() is False
    assert docs_upload_enabled() is False


def test_docs_upload_needs_read_and_write(monkeypatch):
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.setenv("DOCS_ACK_TEXT_VERSION", "test-receipt-v1")
    assert docs_upload_enabled() is True
    assert document_capabilities() == {
        "read": True,
        "upload": True,
        "acknowledge": True,
        "delete": True,
    }

    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "false")
    assert docs_upload_enabled() is False
    assert document_capabilities()["read"] is True
    assert document_capabilities()["upload"] is False

    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.delenv("DOCS_ACK_TEXT_VERSION", raising=False)
    assert document_capabilities()["upload"] is True
    assert document_capabilities()["acknowledge"] is False


def test_default_retention_is_two_years():
    assert DEFAULT_RETENTION_DAYS == 730
    assert default_retain_until(from_day=date(2026, 1, 1)) == date(2028, 1, 1)


def test_upload_storage_raises_when_flag_off(monkeypatch):
    monkeypatch.setenv("DOCS_READ_ENABLED", "false")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "false")
    from lib.tenancy_docs import upload_tenancy_document

    with pytest.raises(RuntimeError, match="disabled"):
        upload_tenancy_document(
            tenancy_id="t1",
            document_id="d1",
            content_type="application/pdf",
            file_bytes=b"%PDF",
            sha256="a" * 64,
        )


def test_storage_path_is_generated_and_bucket_is_not_created(monkeypatch):
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    bucket = FakeBucket()
    monkeypatch.setattr(
        "lib.db.create_service_client",
        lambda: FakeStorageClient(bucket),
    )
    path = upload_tenancy_document(
        tenancy_id="t1",
        document_id="d1",
        content_type="application/pdf",
        file_bytes=b"%PDF-1.7",
        sha256="a" * 64,
    )
    assert path == f"t1/d1/{'a' * 64}.pdf"
    assert bucket.uploads[0]["file_options"]["upsert"] == "false"


def test_signed_links_use_short_expiry_and_respect_read_gate(monkeypatch):
    monkeypatch.setenv("DOCS_READ_ENABLED", "false")
    with pytest.raises(RuntimeError, match="reads are disabled"):
        signed_document_url("t1/d1/file.pdf")

    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    bucket = FakeBucket()
    monkeypatch.setattr(
        "lib.db.create_service_client",
        lambda: FakeStorageClient(bucket),
    )
    assert signed_document_url(
        "t1/d1/file.pdf", expires_in=3600
    ).startswith("https://signed")
    assert bucket.signed_expiry == ("t1/d1/file.pdf", 900)


@pytest.mark.parametrize(
    ("name", "content_type", "body"),
    [
        ("lease.pdf", "application/pdf", PDF_BYTES),
        ("id.jpeg", "image/jpeg", JPEG_BYTES),
        ("id.png", "image/png", PNG_BYTES),
    ],
)
def test_validate_document_accepts_supported_signatures(name, content_type, body):
    safe_name, detected, checksum = validate_document(
        file_name=name,
        content_type=content_type,
        file_bytes=body,
    )
    assert safe_name == name
    assert detected == content_type
    assert len(checksum) == 64


@pytest.mark.parametrize(
    ("content_type", "body", "message"),
    [
        ("application/pdf", b"", "empty"),
        ("text/plain", b"hello", "Only PDF"),
        ("image/png", b"%PDF-1.7", "does not match"),
        ("application/pdf", b"%PDF-1.7", "malformed"),
        ("image/jpeg", b"\xff\xd8\xff", "malformed"),
        ("image/png", b"\x89PNG\r\n\x1a\n", "malformed"),
    ],
)
def test_validate_document_rejects_file_attacks(content_type, body, message):
    with pytest.raises(ValueError, match=message):
        validate_document(
            file_name="../../bad.exe",
            content_type=content_type,
            file_bytes=body,
        )


def test_validate_document_rejects_oversize():
    with pytest.raises(ValueError, match="8 MB"):
        validate_document(
            file_name="large.pdf",
            content_type="application/pdf",
            file_bytes=b"%PDF-" + (b"x" * MAX_DOCUMENT_BYTES),
        )


@pytest.mark.parametrize(
    "path",
    [
        "/tenancies/t1/documents",
        "/tenancies/t1/document-requests/r1/submissions",
    ],
)
def test_document_request_limit_rejects_before_multipart_parser(path):
    called = False
    sent = []

    async def app(_scope, _receive, _send):
        nonlocal called
        called = True

    async def receive():
        raise AssertionError("Content-Length rejection should not read the body")

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [
            (b"content-length", str(DOCUMENT_REQUEST_BYTES + 1).encode("ascii"))
        ],
    }
    asyncio.run(DocumentUploadLimitMiddleware(app)(scope, receive, send))
    assert called is False
    assert sent[0]["status"] == 413


@pytest.mark.parametrize(
    "path",
    [
        "/tenancies/t1/documents",
        "/tenancies/t1/document-requests/r1/submissions",
    ],
)
def test_document_request_limit_bounds_chunked_bodies(path):
    called = False
    sent = []
    messages = [
        {
            "type": "http.request",
            "body": b"x" * DOCUMENT_REQUEST_BYTES,
            "more_body": True,
        },
        {"type": "http.request", "body": b"x", "more_body": False},
    ]

    async def app(_scope, _receive, _send):
        nonlocal called
        called = True

    async def receive():
        return messages.pop(0)

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [],
    }
    asyncio.run(DocumentUploadLimitMiddleware(app)(scope, receive, send))
    assert called is False
    assert sent[0]["status"] == 413


def test_safe_document_name_removes_path_and_control_characters():
    assert safe_document_name("../../tenant\x00.exe", "application/pdf") == "tenant.pdf"


def test_past_expiry_is_rejected():
    with pytest.raises(HTTPException) as exc:
        tenancies._parse_expiry((date.today() - timedelta(days=1)).isoformat())
    assert exc.value.status_code == 400


def test_scanner_fails_closed_when_unconfigured(monkeypatch):
    monkeypatch.delenv("DOCS_CLAMAV_HOST", raising=False)
    with pytest.raises(RuntimeError, match="not configured"):
        scan_document(b"%PDF-1.7")


def test_scanner_accepts_clean_and_rejects_malware(monkeypatch):
    monkeypatch.setenv("DOCS_CLAMAV_HOST", "clamav.internal")
    clean = FakeScanConnection(b"stream: OK\0")
    monkeypatch.setattr(
        "lib.tenancy_docs.socket.create_connection",
        lambda *_args, **_kwargs: clean,
    )
    assert scan_document(b"%PDF-1.7") == "stream: OK"
    assert clean.sent[0] == b"zINSTREAM\0"

    infected = FakeScanConnection(b"stream: Eicar-Test-Signature FOUND\0")
    monkeypatch.setattr(
        "lib.tenancy_docs.socket.create_connection",
        lambda *_args, **_kwargs: infected,
    )
    with pytest.raises(ValueError, match="failed the malware scan"):
        scan_document(b"%PDF-1.7")


def test_retention_due_skips_legal_hold_and_future_rows():
    today = date(2026, 9, 16)
    rows = [
        {"id": "due", "retain_until": today.isoformat(), "legal_hold": False},
        {
            "id": "held",
            "retain_until": (today - timedelta(days=1)).isoformat(),
            "legal_hold": True,
        },
        {
            "id": "future",
            "retain_until": (today + timedelta(days=1)).isoformat(),
            "legal_hold": False,
        },
        {
            "id": "purged",
            "retain_until": (today - timedelta(days=1)).isoformat(),
            "purged_at": "already",
        },
    ]
    assert [row["id"] for row in retention_due(rows, on_day=today)] == ["due"]


def test_retention_job_is_dry_run_by_default():
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "due",
                    "tenancy_id": "t1",
                    "storage_path": "t1/due/file.pdf",
                    "retain_until": "2026-09-15",
                    "legal_hold": False,
                    "purged_at": None,
                },
                {
                    "id": "held",
                    "tenancy_id": "t1",
                    "storage_path": "t1/held/file.pdf",
                    "retain_until": "2026-09-15",
                    "legal_hold": True,
                    "purged_at": None,
                },
            ]
        }
    )
    result = run_retention(
        client=client,
        on_day=date(2026, 9, 16),
    )
    assert result["dry_run"] is True
    assert result["document_ids"] == ["due"]
    assert result["purged"] == 0
    assert client.rows["tenancy_documents"][0]["purged_at"] is None


def test_retention_commit_requires_independent_gate(monkeypatch):
    monkeypatch.setenv("DOCS_RETENTION_PURGE_ENABLED", "false")
    with pytest.raises(RuntimeError, match="disabled"):
        run_retention(dry_run=False, client=FakeClient())


def test_retention_commit_purges_due_object_and_writes_event(monkeypatch):
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "due",
                    "tenancy_id": "t1",
                    "storage_path": "t1/due/file.pdf",
                    "retain_until": "2026-09-15",
                    "legal_hold": False,
                    "deleted_at": None,
                    "purged_at": None,
                }
            ]
        }
    )
    removed = []
    monkeypatch.setenv("DOCS_RETENTION_PURGE_ENABLED", "true")
    monkeypatch.setattr(retention_lib, "delete_document_object", removed.append)
    result = run_retention(
        dry_run=False,
        client=client,
        on_day=date(2026, 9, 16),
    )
    assert result["purged"] == 1
    assert result["failed"] == []
    assert removed == ["t1/due/file.pdf"]
    assert client.rows["tenancy_documents"][0]["purged_at"]
    assert [
        event["event_type"] for event in client.rows["tenancy_document_events"]
    ] == ["purge_started", "purged"]


def test_retention_hold_race_skips_before_object_removal(monkeypatch):
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "due",
                    "tenancy_id": "t1",
                    "storage_path": "t1/due/file.pdf",
                    "retain_until": "2026-09-15",
                    "legal_hold": False,
                    "deleted_at": None,
                    "purged_at": None,
                }
            ]
        },
        hold_on_next_document_update=True,
    )
    removed = []
    monkeypatch.setenv("DOCS_RETENTION_PURGE_ENABLED", "true")
    monkeypatch.setattr(retention_lib, "delete_document_object", removed.append)
    result = run_retention(
        dry_run=False,
        client=client,
        on_day=date(2026, 9, 16),
    )
    assert result["purged"] == 0
    assert result["skipped"] == 1
    assert removed == []


def _user(user_id, db=None):
    return SimpleNamespace(id=user_id, db=db or FakeClient())


@pytest.mark.parametrize("actor_id", ["intruder", "staff-user"])
def test_document_access_denies_cross_tenancy_and_staff(monkeypatch, actor_id):
    client = FakeClient(
        {"tenancies": [{"id": "t1", "landlord_id": "owner", "status": "active"}]}
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    with pytest.raises(HTTPException) as exc:
        tenancies._load_tenancy_for_document_access(_user(actor_id), "t1")
    assert exc.value.status_code == 403


def test_document_route_rejects_anonymous_request():
    from main import app

    async def request():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.get("/tenancies/t1/documents")

    response = asyncio.run(request())
    assert response.status_code in {401, 403}


@pytest.mark.parametrize("tenancy_status", ["pending", "ended"])
def test_document_access_denies_inactive_tenant(monkeypatch, tenancy_status):
    client = FakeClient(
        {
            "tenancies": [
                {
                    "id": "t1",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": tenancy_status,
                }
            ]
        }
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    with pytest.raises(HTTPException) as exc:
        tenancies._load_tenancy_for_document_access(_user("tenant"), "t1")
    assert exc.value.status_code == 403
    assert "Active occupancy" in str(exc.value.detail)


def test_flag_off_list_is_honest_after_authorization(monkeypatch):
    client = FakeClient(
        {"tenancies": [{"id": "t1", "landlord_id": "owner", "status": "pending"}]}
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setenv("DOCS_READ_ENABLED", "false")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "false")
    result = tenancies.list_documents("t1", _user("owner"))
    assert result["items"] == []
    assert result["capabilities"]["read"] is False
    assert "awaiting legal" in result["message"]


def test_active_tenant_lists_only_clean_documents_with_role_capabilities(
    monkeypatch,
):
    client = FakeClient(
        {
            "tenancies": [
                {
                    "id": "t1",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": "active",
                }
            ],
            "tenancy_documents": [
                {
                    "id": "clean",
                    "tenancy_id": "t1",
                    "file_name": "lease.pdf",
                    "storage_path": "t1/clean/file.pdf",
                    "scan_status": "clean",
                    "deleted_at": None,
                },
                {
                    "id": "pending",
                    "tenancy_id": "t1",
                    "file_name": "pending.pdf",
                    "storage_path": "t1/pending/file.pdf",
                    "scan_status": "pending",
                    "deleted_at": None,
                },
            ],
            "tenancy_document_acknowledgments": [],
        }
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(
        tenancies,
        "signed_document_url",
        lambda path: f"https://signed.example/{path}",
    )
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    result = tenancies.list_documents("t1", _user("tenant"))
    assert [item["id"] for item in result["items"]] == ["clean"]
    assert result["capabilities"] == {
        "read": True,
        "upload": False,
        "acknowledge": True,
        "delete": False,
    }


def test_acknowledgment_requires_active_tenant_and_required_document(monkeypatch):
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "d1",
                    "tenancy_id": "t1",
                    "requires_ack": False,
                    "deleted_at": None,
                    "scan_status": "clean",
                }
            ]
        }
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(
        tenancies,
        "_load_tenancy_for_document_access",
        lambda *_args: ({"id": "t1"}, "tenant"),
    )
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    request = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
    with pytest.raises(HTTPException) as exc:
        tenancies.acknowledge_document("t1", "d1", request, _user("tenant"))
    assert exc.value.status_code == 409


def test_acknowledgment_is_idempotent(monkeypatch):
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "d1",
                    "tenancy_id": "t1",
                    "requires_ack": True,
                    "deleted_at": None,
                    "scan_status": "clean",
                }
            ],
            "tenancy_document_acknowledgments": [
                {
                    "id": "a1",
                    "document_id": "d1",
                    "actor_id": "tenant",
                    "acknowledged_at": "2026-09-16T12:00:00Z",
                }
            ],
        }
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(
        tenancies,
        "_load_tenancy_for_document_access",
        lambda *_args: ({"id": "t1"}, "tenant"),
    )
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    request = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
    result = tenancies.acknowledge_document(
        "t1", "d1", request, _user("tenant")
    )
    assert result["already"] is True
    assert len(client.rows["tenancy_document_acknowledgments"]) == 1


def test_concurrent_acknowledgment_returns_winning_evidence(monkeypatch):
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "d1",
                    "tenancy_id": "t1",
                    "requires_ack": True,
                    "deleted_at": None,
                    "scan_status": "clean",
                }
            ],
            "tenancy_document_acknowledgments": [],
        },
        ack_insert_race=True,
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(
        tenancies,
        "_load_tenancy_for_document_access",
        lambda *_args: ({"id": "t1"}, "tenant"),
    )
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    request = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
    result = tenancies.acknowledge_document(
        "t1", "d1", request, _user("tenant")
    )
    assert result["already"] is True
    assert result["acknowledgment"]["id"] == "raced"


def test_upload_cleans_object_when_evidence_write_fails(monkeypatch):
    client = FakeClient(fail_event_insert=True)
    cleaned = []
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.setattr(
        tenancies,
        "_load_tenancy_for_landlord",
        lambda *_args: {"id": "t1", "landlord_id": "owner"},
    )
    monkeypatch.setattr(tenancies, "enforce_rate_limit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(tenancies, "scan_document", lambda _body: "stream: OK")
    monkeypatch.setattr(
        tenancies,
        "upload_tenancy_document",
        lambda **_kwargs: "t1/d1/checksum.pdf",
    )
    monkeypatch.setattr(tenancies, "delete_document_object", cleaned.append)
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    upload = UploadFile(
        file=BytesIO(PDF_BYTES),
        filename="../../lease.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            tenancies.upload_document(
                "t1",
                upload,
                "agreement",
                None,
                True,
                _user("owner"),
            )
        )
    assert exc.value.status_code == 503
    assert cleaned == ["t1/d1/checksum.pdf"]
    assert client.rows["tenancy_documents"] == []


def test_delete_refuses_legal_hold_without_removing_object(monkeypatch):
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "d1",
                    "tenancy_id": "t1",
                    "landlord_id": "owner",
                    "storage_path": "t1/d1/file.pdf",
                    "legal_hold": True,
                    "deleted_at": None,
                }
            ]
        }
    )
    removed = []
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.setattr(
        tenancies,
        "_load_tenancy_for_landlord",
        lambda *_args: {"id": "t1", "landlord_id": "owner"},
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(tenancies, "delete_document_object", removed.append)
    with pytest.raises(HTTPException) as exc:
        tenancies.delete_document("t1", "d1", _user("owner"))
    assert exc.value.status_code == 409
    assert removed == []


def test_delete_hold_race_stops_before_object_removal(monkeypatch):
    client = FakeClient(
        {
            "tenancy_documents": [
                {
                    "id": "d1",
                    "tenancy_id": "t1",
                    "landlord_id": "owner",
                    "storage_path": "t1/d1/file.pdf",
                    "legal_hold": False,
                    "deleted_at": None,
                }
            ]
        },
        hold_on_next_document_update=True,
    )
    removed = []
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.setattr(
        tenancies,
        "_load_tenancy_for_landlord",
        lambda *_args: {"id": "t1", "landlord_id": "owner"},
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(tenancies, "delete_document_object", removed.append)
    with pytest.raises(HTTPException) as exc:
        tenancies.delete_document("t1", "d1", _user("owner"))
    assert exc.value.status_code == 409
    assert removed == []


def test_no_pii_document_lifecycle_with_test_storage(monkeypatch):
    client = FakeClient(
        {
            "tenancies": [
                {
                    "id": "t1",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": "active",
                }
            ],
            "tenancy_documents": [],
            "tenancy_document_acknowledgments": [],
            "tenancy_document_events": [],
        }
    )
    removed = []
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(tenancies, "enforce_rate_limit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(tenancies, "scan_document", lambda _body: "stream: OK")
    monkeypatch.setattr(
        tenancies,
        "upload_tenancy_document",
        lambda **kwargs: (
            f"{kwargs['tenancy_id']}/{kwargs['document_id']}/{kwargs['sha256']}.pdf"
        ),
    )
    monkeypatch.setattr(
        tenancies,
        "signed_document_url",
        lambda path: f"https://signed.example/{path}",
    )
    monkeypatch.setattr(tenancies, "delete_document_object", removed.append)

    owner = _user("owner", client)
    tenant = _user("tenant", client)
    upload = UploadFile(
        file=BytesIO(PDF_BYTES),
        filename="synthetic-agreement.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    created = asyncio.run(
        tenancies.upload_document(
            "t1",
            upload,
            "agreement",
            (date.today() + timedelta(days=30)).isoformat(),
            True,
            owner,
        )
    )
    document_id = created["document"]["id"]

    listed = tenancies.list_documents("t1", tenant)
    assert [item["id"] for item in listed["items"]] == [document_id]
    assert listed["items"][0]["url"] is None
    assert listed["items"][0]["can_open"] is True
    opened = tenancies.open_document("t1", document_id, tenant)
    assert opened["url"].startswith("https://signed.example/")
    assert opened["expires_in"] == 900
    assert any(
        event.get("event_type") == "document_opened"
        for event in client.rows["tenancy_document_events"]
    )

    request = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
    acknowledged = tenancies.acknowledge_document(
        "t1", document_id, request, tenant
    )
    assert acknowledged["already"] is False
    repeated = tenancies.acknowledge_document(
        "t1", document_id, request, tenant
    )
    assert repeated["already"] is True

    assert tenancies.delete_document("t1", document_id, owner) == {"ok": True}
    assert removed and document_id in removed[0]
    assert tenancies.list_documents("t1", owner)["items"] == []


def test_collection_capabilities_are_role_specific_and_default_off(monkeypatch):
    flags = (
        "DOCS_READ_ENABLED",
        "DOCS_UPLOAD_ENABLED",
        "DOC_REQUESTS_ENABLED",
        "TENANT_DOC_SUBMISSIONS_ENABLED",
        "DOC_REVIEW_ENABLED",
        "PRIVACY_CASES_ENABLED",
    )
    for name in flags:
        monkeypatch.delenv(name, raising=False)
    assert not any(collection_capabilities("landlord").values())
    assert not any(collection_capabilities("tenant").values())

    for name in flags:
        monkeypatch.setenv(name, "true")
    landlord = collection_capabilities("landlord")
    tenant = collection_capabilities("tenant")
    assert landlord["request"] is True
    assert landlord["review"] is True
    assert landlord["submit_requested"] is False
    assert tenant["submit_requested"] is True
    assert tenant["replace"] is True
    assert tenant["review"] is False
    assert tenant["privacy_request"] is True


def test_collection_authorization_is_claimed_pending_only(monkeypatch):
    client = FakeClient(
        {
            "tenancies": [
                {
                    "id": "pending",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": "pending_verification",
                },
                {
                    "id": "active",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": "active",
                },
            ]
        }
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    assert tenancies._load_tenancy_for_collection(
        _user("owner", client), "active"
    )[1] == "landlord"
    assert tenancies._load_tenancy_for_collection(
        _user("tenant", client), "pending"
    )[1] == "tenant"
    with pytest.raises(HTTPException) as active:
        tenancies._load_tenancy_for_collection(_user("tenant", client), "active")
    assert active.value.status_code == 403
    with pytest.raises(HTTPException) as unrelated:
        tenancies._load_tenancy_for_collection(_user("other", client), "pending")
    assert unrelated.value.status_code == 403


def test_general_document_upload_rejects_id_scope(monkeypatch):
    client = FakeClient(
        {
            "tenancies": [
                {
                    "id": "t1",
                    "landlord_id": "owner",
                    "tenant_user_id": None,
                    "status": "draft",
                }
            ]
        }
    )
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    upload = UploadFile(
        file=BytesIO(PDF_BYTES),
        filename="id.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            tenancies.upload_document(
                "t1",
                upload,
                "id",
                None,
                False,
                _user("owner", client),
            )
        )
    assert exc.value.status_code == 400


def test_landlord_request_uses_locked_idempotent_rpc(monkeypatch):
    client = FakeRpcClient(
        {
            "tenancies": [
                {
                    "id": "t1",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": "pending_verification",
                }
            ],
            "tenancy_document_transition_keys": [],
            "tenancy_document_request_events": [],
        },
        {
            "create_tenancy_document_request": [
                {
                    "id": "r1",
                    "tenancy_id": "t1",
                    "landlord_id": "owner",
                    "doc_type": "agreement",
                    "status": "open",
                }
            ]
        },
    )
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOC_REQUESTS_ENABLED", "true")
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(
        tenancies,
        "notify_tenancy_document_event",
        lambda *_args, **_kwargs: {
            "sent": False,
            "channel": None,
            "error": "disabled",
        },
    )
    result = tenancies.create_document_request(
        "t1",
        SimpleNamespace(headers={"idempotency-key": "request-key-001"}),
        {
            "doc_type": "agreement",
            "processing_policy_version": "agreement-v1",
            "title": "Signed agreement",
        },
        _user("owner", client),
    )
    assert result["item"]["id"] == "r1"
    rpc_name, params = client.rpc_calls[0]
    assert rpc_name == "create_tenancy_document_request"
    assert params["p_landlord_id"] == "owner"
    assert params["p_doc_type"] == "agreement"
    assert params["p_idempotency_key"] == "request-key-001"


def test_review_uses_current_submission_and_idempotency(monkeypatch):
    client = FakeRpcClient(
        {
            "tenancies": [
                {
                    "id": "t1",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": "pending_verification",
                }
            ],
            "tenancy_document_submissions": [
                {"id": "s1", "request_id": "r1", "document_id": "d1"}
            ],
            "tenancy_document_requests": [
                {"id": "r1", "tenancy_id": "t1", "landlord_id": "owner"}
            ],
            "tenancy_document_transition_keys": [],
            "tenancy_document_request_events": [],
        },
        {
            "decide_tenancy_document_submission": [
                {
                    "id": "s1",
                    "request_id": "r1",
                    "document_id": "d1",
                    "review_status": "accepted",
                }
            ]
        },
    )
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOC_REVIEW_ENABLED", "true")
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(
        tenancies,
        "notify_tenancy_document_event",
        lambda *_args, **_kwargs: {
            "sent": False,
            "channel": None,
            "error": "disabled",
        },
    )
    result = tenancies.decide_requested_document(
        "t1",
        "d1",
        SimpleNamespace(headers={"idempotency-key": "review-key-001"}),
        {"decision": "accepted"},
        _user("owner", client),
    )
    assert result["submission"]["review_status"] == "accepted"
    rpc_name, params = client.rpc_calls[0]
    assert rpc_name == "decide_tenancy_document_submission"
    assert params["p_submission_id"] == "s1"
    assert params["p_idempotency_key"] == "review-key-001"


def test_concurrent_submission_loser_cleans_its_uploaded_object(monkeypatch):
    client = FakeRpcClient(
        {
            "tenancies": [
                {
                    "id": "t1",
                    "landlord_id": "owner",
                    "tenant_user_id": "tenant",
                    "status": "pending_verification",
                }
            ],
            "tenancy_document_submissions": [],
            "tenancy_document_requests": [
                {
                    "id": "r1",
                    "tenancy_id": "t1",
                    "landlord_id": "owner",
                    "doc_type": "agreement",
                    "status": "open",
                    "processing_policy_version": "agreement-v1",
                    "current_submission_id": None,
                }
            ],
            "tenancy_document_processing_policies": [
                {
                    "version": "agreement-v1",
                    "privacy_notice_version": "notice-v1",
                }
            ],
            "tenancy_documents": [],
        },
        {
            "create_tenancy_document_submission": [
                {
                    "id": "winner",
                    "request_id": "r1",
                    "document_id": "winner-document",
                    "submitted_by": "tenant",
                    "idempotency_key": "same-upload-key",
                }
            ]
        },
    )
    removed = []
    for name in (
        "DOCS_READ_ENABLED",
        "DOCS_UPLOAD_ENABLED",
        "DOC_REQUESTS_ENABLED",
        "TENANT_DOC_SUBMISSIONS_ENABLED",
    ):
        monkeypatch.setenv(name, "true")
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    monkeypatch.setattr(tenancies, "enforce_rate_limit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(tenancies, "scan_document", lambda _body: "stream: OK")
    monkeypatch.setattr(
        tenancies,
        "upload_tenancy_document",
        lambda **kwargs: f"t1/{kwargs['document_id']}/{kwargs['sha256']}.pdf",
    )
    monkeypatch.setattr(tenancies, "delete_document_object", removed.append)
    upload = UploadFile(
        file=BytesIO(PDF_BYTES),
        filename="agreement.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    result = asyncio.run(
        tenancies.submit_requested_document(
            "t1",
            "r1",
            SimpleNamespace(headers={"idempotency-key": "same-upload-key"}),
            upload,
            "notice-v1",
            None,
            _user("tenant", client),
        )
    )
    assert result["already"] is True
    assert result["submission"]["document_id"] == "winner-document"
    assert len(removed) == 1
    assert client.rows["tenancy_documents"] == []


def test_unresolved_document_request_blocks_activation(monkeypatch):
    client = FakeClient(
        {
            "tenancy_document_requests": [
                {"id": "r1", "tenancy_id": "t1", "status": "submitted"}
            ]
        }
    )
    tenancy = {
        "id": "t1",
        "unit_id": "u1",
        "landlord_id": "owner",
        "status": "pending_verification",
        "checklist_id_collected": True,
        "checklist_agreement_signed": True,
        "checklist_references_checked": True,
    }
    monkeypatch.setenv("DOCS_READ_ENABLED", "true")
    monkeypatch.setenv("DOC_REQUESTS_ENABLED", "true")
    monkeypatch.setattr(
        tenancies,
        "_load_tenancy_for_landlord",
        lambda *_args, **_kwargs: tenancy,
    )
    monkeypatch.setattr(tenancies, "create_service_client", lambda: client)
    with pytest.raises(HTTPException) as exc:
        tenancies.activate_tenancy("t1", _user("owner", client))
    assert exc.value.status_code == 409


@pytest.mark.parametrize(
    ("extra_rows", "expected"),
    [
        (
            {"tenancy_document_holds": [{"id": "h1", "document_id": "d1"}]},
            "active_legal_hold",
        ),
        ({"tenancies": [{"id": "t1", "status": "active"}]}, "active_tenancy"),
        (
            {
                "tenancy_document_submissions": [
                    {"document_id": "d1", "request_id": "r1"}
                ],
                "tenancy_document_requests": [{"id": "r1", "status": "submitted"}],
            },
            "open_document_request",
        ),
        (
            {
                "tenancy_privacy_request_documents": [
                    {
                        "document_id": "d1",
                        "privacy_request_id": "p1",
                        "relation_type": "restricted",
                    }
                ],
                "tenancy_privacy_requests": [{"id": "p1", "status": "in_review"}],
            },
            "open_privacy_request",
        ),
    ],
)
def test_policy_retention_blockers(extra_rows, expected):
    client = FakeClient(extra_rows)
    reason = retention_block_reason(
        client,
        {"id": "d1", "tenancy_id": "t1", "legal_hold": False},
    )
    assert reason == expected


def test_029_schema_has_preflight_privilege_and_evidence_guards():
    sql = (
        Path(__file__).parents[1]
        / "sql"
        / "029_tenancy_document_collection_review.sql"
    ).read_text(encoding="utf-8")
    assert "029 requires the complete 028 tenancy document baseline" in sql
    assert "prevent_tenancy_evidence_mutation" in sql
    assert "create_tenancy_document_submission" in sql
    assert "decide_tenancy_document_submission" in sql
    assert "apply_tenancy_document_hold" in sql
    assert "create_tenancy_privacy_request" in sql
    assert "claim_tenancy_document_purge" in sql
    assert "claim_tenancy_document_deletion" in sql
    assert "complete_tenancy_document_storage_operation" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "privacy_notice_sha256" in sql
    assert "allow_policy_retirement_only" in sql
    assert "anchor_tenancy_document_retention_on_end" in sql
    assert "tenancy_document_transition_keys" in sql
    assert "Idempotency key was used for another transition" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "government" not in sql.lower()


def test_030_removes_direct_browser_document_privileges():
    sql = (
        Path(__file__).parents[1]
        / "sql"
        / "030_tenancy_document_remote_security_hardening.sql"
    ).read_text(encoding="utf-8")
    assert "revoke execute on function" in sql
    assert "revoke all privileges" in sql
    assert "from public, anon, authenticated" in sql
    assert "tenancy_workflow_notification_deliveries" in sql
