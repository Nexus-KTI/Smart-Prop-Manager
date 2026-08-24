"""Tests for cursor pagination helpers."""

from lib.pagination import (
    apply_desc_cursor,
    decode_cursor,
    encode_cursor,
    paginate_desc,
    page_size,
)


class _FakeQuery:
    def __init__(self):
        self.filters: list[str] = []

    def or_(self, clause: str):
        self.filters.append(clause)
        return self


def test_page_size_defaults_and_caps():
    assert page_size(None) == 20
    assert page_size(5) == 5
    assert page_size(100) == 50


def test_encode_decode_cursor_roundtrip():
    cursor = encode_cursor("2026-01-15T10:00:00+00:00", "abc-123")
    assert decode_cursor(cursor) == ("2026-01-15T10:00:00+00:00", "abc-123")
    assert decode_cursor(None) is None
    assert decode_cursor("not-valid") is None


def test_paginate_desc_trims_and_builds_next_cursor():
    rows = [
        {"id": "3", "created_at": "2026-01-03T00:00:00+00:00"},
        {"id": "2", "created_at": "2026-01-02T00:00:00+00:00"},
        {"id": "1", "created_at": "2026-01-01T00:00:00+00:00"},
    ]
    page, next_cursor = paginate_desc(rows, 2)
    assert len(page) == 2
    assert page[0]["id"] == "3"
    assert next_cursor is not None
    assert decode_cursor(next_cursor) == ("2026-01-02T00:00:00+00:00", "2")


def test_paginate_desc_no_next_when_short_page():
    rows = [{"id": "1", "created_at": "2026-01-01T00:00:00+00:00"}]
    page, next_cursor = paginate_desc(rows, 20)
    assert len(page) == 1
    assert next_cursor is None


def test_apply_desc_cursor_adds_filter():
    query = _FakeQuery()
    cursor = encode_cursor("2026-01-02T00:00:00+00:00", "unit-2")
    result = apply_desc_cursor(query, cursor)
    assert len(result.filters) == 1
    assert "created_at.lt." in result.filters[0]
    assert "unit-2" in result.filters[0]

    unchanged = apply_desc_cursor(_FakeQuery(), None)
    assert unchanged.filters == []
