"""Tenant self-serve guest gate codes."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from routers import access


class _User:
    id = "tenant-1"
    db = None


class _Query:
    def __init__(self, store: dict[str, list[dict]], table: str):
        self._store = store
        self._table = table
        self._filters: list[tuple[str, str, Any]] = []
        self._payload: dict | None = None
        self._limit: int | None = None
        self._op = "select"

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, row: dict):
        self._op = "insert"
        self._payload = dict(row)
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
        if self._op == "insert":
            assert self._payload is not None
            row = {"id": f"pass-{len(self._store.setdefault(self._table, [])) + 1}"}
            row.update(self._payload)
            self._store.setdefault(self._table, []).append(row)
            return SimpleNamespace(data=[row])
        if self._op == "update":
            assert self._payload is not None
            updated = []
            for i, row in enumerate(self._store.get(self._table, [])):
                match = True
                for kind, key, value in self._filters:
                    if kind == "eq" and row.get(key) != value:
                        match = False
                        break
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


def _future(hours: float = 12) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _past(hours: float = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


@pytest.fixture
def store():
    return {
        "tenancies": [
            {
                "id": "ten-1",
                "unit_id": "unit-1",
                "landlord_id": "landlord-1",
                "tenant_user_id": "tenant-1",
                "tenant_name": "Ada",
                "status": "active",
            }
        ],
        "units": [
            {"id": "unit-1", "property_id": "prop-1", "label": "Flat 2"},
        ],
        "access_passes": [],
    }


@pytest.fixture
def svc(store, monkeypatch):
    client = _Svc(store)
    monkeypatch.setattr(access, "create_service_client", lambda: client)
    return client


def test_create_guest_requires_active_tenancy(store, svc):
    store["tenancies"] = []
    with pytest.raises(HTTPException) as ei:
        access.create_my_guest_pass(
            {"subject_label": "Visitor", "duration_hours": 2},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 403


def test_create_guest_rejects_invalid_duration(store, svc):
    with pytest.raises(HTTPException) as ei:
        access.create_my_guest_pass(
            {"subject_label": "Visitor", "duration_hours": 24},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 400
    assert "1, 2, 4, or 6" in str(ei.value.detail)


def test_create_guest_rejects_over_6h_legacy_until(store, svc):
    with pytest.raises(HTTPException) as ei:
        access.create_my_guest_pass(
            {"subject_label": "Visitor", "valid_until": _future(hours=12)},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 400
    assert "6" in str(ei.value.detail)


def test_create_guest_ok(store, svc):
    result = access.create_my_guest_pass(
        {"subject_label": "Cousin visit", "duration_hours": 2},
        _User(),  # type: ignore[arg-type]
    )
    item = result["item"]
    assert item["subject_type"] == "guest"
    assert item["source_type"] == "tenant_self"
    assert item["created_by"] == "tenant-1"
    assert item["subject_user_id"] == "tenant-1"
    assert item["unit_id"] == "unit-1"
    assert item["max_uses"] == 1
    assert item["uses_count"] == 0
    assert len(item["code"]) == 6


def test_create_guest_caps_active(store, svc):
    until = _future(hours=3)
    for i in range(2):
        store["access_passes"].append(
            {
                "id": f"g-{i}",
                "landlord_id": "landlord-1",
                "unit_id": "unit-1",
                "subject_type": "guest",
                "created_by": "tenant-1",
                "status": "active",
                "valid_until": until,
            }
        )
    with pytest.raises(HTTPException) as ei:
        access.create_my_guest_pass(
            {"subject_label": "One more", "duration_hours": 1},
            _User(),  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 400
    assert "2" in str(ei.value.detail)


def test_revoke_own_guest(store, svc):
    store["access_passes"].append(
        {
            "id": "g-1",
            "landlord_id": "landlord-1",
            "property_id": "prop-1",
            "unit_id": "unit-1",
            "subject_type": "guest",
            "created_by": "tenant-1",
            "status": "active",
            "valid_until": _future(),
            "code": "ABC123",
            "subject_label": "Guest",
        }
    )
    result = access.revoke_my_guest_pass("g-1", _User())  # type: ignore[arg-type]
    assert result["item"]["status"] == "revoked"


def test_cannot_revoke_landlord_tenant_pass(store, svc):
    store["access_passes"].append(
        {
            "id": "t-1",
            "landlord_id": "landlord-1",
            "property_id": "prop-1",
            "unit_id": "unit-1",
            "subject_type": "tenant",
            "created_by": "landlord-1",
            "status": "active",
            "valid_until": _future(hours=720),
            "code": "MOVEIN",
            "subject_label": "Ada move-in",
        }
    )
    with pytest.raises(HTTPException) as ei:
        access.revoke_my_guest_pass("t-1", _User())  # type: ignore[arg-type]
    assert ei.value.status_code == 403


def test_expired_guest_does_not_count_toward_cap(store, svc):
    store["access_passes"].append(
        {
            "id": "g-old",
            "landlord_id": "landlord-1",
            "unit_id": "unit-1",
            "subject_type": "guest",
            "created_by": "tenant-1",
            "status": "active",
            "valid_until": _past(hours=2),
        }
    )
    result = access.create_my_guest_pass(
        {"subject_label": "Fresh", "duration_hours": 1},
        _User(),  # type: ignore[arg-type]
    )
    assert result["item"]["subject_label"] == "Fresh"
    assert result["item"]["max_uses"] == 1
