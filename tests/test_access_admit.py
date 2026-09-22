"""Gate Admit — typed code / QR payload."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from lib.access import AccessContext, PERM_ACCESS_VISITOR_PASSES
from routers import access


class _User:
    id = "owner-1"
    db = None


class _Query:
    def __init__(self, store: dict[str, list[dict]], table: str):
        self._store = store
        self._table = table
        self._filters: list[tuple[str, str, Any]] = []
        self._payload: dict | None = None
        self._limit: int | None = None
        self._op = "select"
        self._order_desc = False

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def update(self, patch: dict):
        self._op = "update"
        self._payload = dict(patch)
        return self

    def eq(self, key: str, value: Any):
        self._filters.append(("eq", key, value))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def order(self, *_a, **_k):
        self._order_desc = bool(_k.get("desc"))
        return self

    def execute(self):
        rows = list(self._store.get(self._table, []))
        for kind, key, value in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(key) == value]
        if self._op == "select":
            if self._limit is not None:
                rows = rows[: self._limit]
            return SimpleNamespace(data=rows)
        if self._op == "update":
            assert self._payload is not None
            updated = []
            for i, row in enumerate(self._store.get(self._table, [])):
                match = all(
                    kind != "eq" or row.get(key) == value
                    for kind, key, value in self._filters
                )
                if match:
                    merged = {**row, **self._payload}
                    self._store[self._table][i] = merged
                    updated.append(merged)
            return SimpleNamespace(data=updated)
        raise AssertionError(self._op)


class _Svc:
    def __init__(self, store: dict[str, list[dict]]):
        self._store = store

    def table(self, name: str):
        return _Query(self._store, name)


def _future(hours: float = 4) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _past(hours: float = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


@pytest.fixture
def store():
    return {
        "access_passes": [
            {
                "id": "pass-1",
                "landlord_id": "owner-1",
                "property_id": "prop-1",
                "subject_type": "guest",
                "subject_label": "Mama",
                "code": "ABC123",
                "valid_from": _past(hours=0.5),
                "valid_until": _future(hours=3),
                "status": "active",
                "uses_count": 0,
                "max_uses": None,
            }
        ]
    }


@pytest.fixture
def svc(store, monkeypatch):
    client = _Svc(store)
    monkeypatch.setattr(access, "create_service_client", lambda: client)
    monkeypatch.setattr(
        access,
        "_resolve_actor_label",
        lambda uid, role_hint="User": f"{role_hint}-label",
    )
    monkeypatch.setattr(access, "_log_pass_event", lambda **_k: None)
    ctx = AccessContext(
        user_id="owner-1",
        owner_id="owner-1",
        role="owner",
        permissions=set(),
    )
    monkeypatch.setattr(
        access,
        "require_property_access",
        lambda *a, **k: ctx,
    )
    return client


def test_parse_admit_raw_bare_and_qr():
    assert access._parse_admit_raw("abc123") == (None, "ABC123")
    assert access._parse_admit_raw("nexora-pass:pass-1:AbC123") == (
        "pass-1",
        "ABC123",
    )
    assert access._parse_admit_raw("nexora-pass:XYZ999") == (None, "XYZ999")


def test_admit_ok(store, svc):
    result = access.admit_pass(
        {"property_id": "prop-1", "raw": "ABC123"},
        _User(),  # type: ignore[arg-type]
    )
    assert result["admitted"] is True
    assert result["uses_count"] == 1
    assert result["item"]["uses_count"] == 1
    assert result["admitted_by_label"] == "owner-label"
    assert store["access_passes"][0]["uses_count"] == 1
    assert store["access_passes"][0]["last_admitted_by"] == "owner-1"


def test_admit_qr_payload(store, svc):
    result = access.admit_pass(
        {"property_id": "prop-1", "raw": "nexora-pass:pass-1:ABC123"},
        _User(),  # type: ignore[arg-type]
    )
    assert result["admitted"] is True
    assert result["uses_count"] == 1


def test_admit_wrong_code(store, svc):
    with pytest.raises(HTTPException) as ei:
        access.admit_pass(
            {"property_id": "prop-1", "raw": "NOPE00"},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 404


def test_admit_scheduled_denied(store, svc):
    store["access_passes"][0]["valid_from"] = _future(hours=2)
    store["access_passes"][0]["valid_until"] = _future(hours=4)
    with pytest.raises(HTTPException) as ei:
        access.admit_pass(
            {"property_id": "prop-1", "raw": "ABC123"},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 400
    assert "scheduled" in str(ei.value.detail).lower()


def test_admit_expired_denied(store, svc):
    store["access_passes"][0]["valid_from"] = _past(hours=5)
    store["access_passes"][0]["valid_until"] = _past(hours=1)
    with pytest.raises(HTTPException) as ei:
        access.admit_pass(
            {"property_id": "prop-1", "raw": "ABC123"},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 400
    assert "expired" in str(ei.value.detail).lower()


def test_admit_max_uses_denied(store, svc):
    store["access_passes"][0]["max_uses"] = 1
    store["access_passes"][0]["uses_count"] = 1
    with pytest.raises(HTTPException) as ei:
        access.admit_pass(
            {"property_id": "prop-1", "raw": "ABC123"},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 400
    assert "limit" in str(ei.value.detail).lower()


def test_list_passes_uses_owner_id(store, svc, monkeypatch):
    """Staff list filters by portfolio owner, not staff user id."""
    staff = MagicMock()
    staff.id = "staff-1"
    staff.db = _Svc(store)

    ctx = AccessContext(
        user_id="staff-1",
        owner_id="owner-1",
        role="caretaker",
        membership_id="m1",
        permissions={PERM_ACCESS_VISITOR_PASSES},
    )
    monkeypatch.setattr(
        access,
        "require_property_access",
        lambda *a, **k: ctx,
    )

    result = access.list_passes(property_id="prop-1", user=staff)  # type: ignore[arg-type]
    assert len(result["items"]) == 1
    assert result["items"][0]["code"] == "ABC123"
