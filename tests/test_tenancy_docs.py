"""Document upload feature flag (Phase 3)."""

from __future__ import annotations

from datetime import date

from lib.tenancy_docs import (
    DEFAULT_RETENTION_DAYS,
    default_retain_until,
    docs_upload_enabled,
)


def test_docs_upload_defaults_off(monkeypatch):
    monkeypatch.delenv("DOCS_UPLOAD_ENABLED", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_DOCS_UPLOAD_ENABLED", raising=False)
    assert docs_upload_enabled() is False


def test_docs_upload_flag_on(monkeypatch):
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "true")
    assert docs_upload_enabled() is True


def test_docs_upload_flag_off_explicit(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_DOCS_UPLOAD_ENABLED", "false")
    monkeypatch.delenv("DOCS_UPLOAD_ENABLED", raising=False)
    assert docs_upload_enabled() is False


def test_default_retention_is_two_years():
    assert DEFAULT_RETENTION_DAYS == 730
    assert default_retain_until(from_day=date(2026, 1, 1)) == date(2028, 1, 1)


def test_upload_raises_when_flag_off(monkeypatch):
    monkeypatch.setenv("DOCS_UPLOAD_ENABLED", "false")
    from lib.tenancy_docs import upload_tenancy_document

    try:
        upload_tenancy_document(
            tenancy_id="t1",
            document_id="d1",
            file_name="id.pdf",
            content_type="application/pdf",
            file_bytes=b"%PDF",
        )
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "disabled" in str(exc).lower()
