"""Gate visibility: my-pass-events + portfolio scope."""

from __future__ import annotations

import os
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


class _Query:
    def __init__(self, store: dict[str, list[dict]], table: str):
        self._store = store
        self._table = table
        self._filters: list[tuple[str, str, Any]] = []
        self._limit: int | None = None
        self._op = "select"
        self._order_desc = False

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def eq(self, key: str, value: Any):
        self._filters.append(("eq", key, value))
        return self

    def in_(self, key: str, values: list):
        self._filters.append(("in", key, list(values)))
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
            elif kind == "in":
                rows = [r for r in rows if r.get(key) in value]
        if self._order_desc and rows and "created_at" in rows[0]:
            rows = sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)
        if self._limit is not None:
            rows = rows[: self._limit]
        return SimpleNamespace(data=rows)


class _Svc:
    def __init__(self, store: dict[str, list[dict]]):
        self._store = store

    def table(self, name: str):
        return _Query(self._store, name)


def test_serialize_pass_event_issuer_from_metadata():
    row = access._serialize_pass_event(
        {
            "id": "e1",
            "event_type": "admitted",
            "actor_label": "Gate staff",
            "metadata": {"created_by_label": "Tunde"},
        }
    )
    assert row["issuer_label"] == "Tunde"


def test_serialize_pass_event_created_uses_actor():
    row = access._serialize_pass_event(
        {
            "id": "e2",
            "event_type": "created",
            "actor_label": "Tunde",
            "metadata": {},
        }
    )
    assert row["issuer_label"] == "Tunde"


def test_list_my_pass_events_only_own_passes(monkeypatch):
    store = {
        "access_passes": [
            {"id": "p-mine", "created_by": "tenant-1", "landlord_id": "L1", "property_id": "P1"},
            {"id": "p-other", "created_by": "tenant-2", "landlord_id": "L1", "property_id": "P1"},
        ],
        "access_pass_events": [
            {
                "id": "ev-mine",
                "pass_id": "p-mine",
                "landlord_id": "L1",
                "property_id": "P1",
                "event_type": "admitted",
                "actor_label": "Chinedu",
                "subject_label": "Mama",
                "code": "ABC123",
                "metadata": {"created_by_label": "Tunde"},
                "created_at": "2026-09-23T12:00:00+00:00",
            },
            {
                "id": "ev-other",
                "pass_id": "p-other",
                "landlord_id": "L1",
                "property_id": "P1",
                "event_type": "admitted",
                "actor_label": "Chinedu",
                "metadata": {"created_by_label": "Other"},
                "created_at": "2026-09-23T13:00:00+00:00",
            },
        ],
    }
    monkeypatch.setattr(access, "create_service_client", lambda: _Svc(store))
    monkeypatch.setattr(
        access,
        "_active_tenancy_for_tenant",
        lambda _u: {
            "tenancy_id": "t1",
            "unit_id": "u1",
            "unit_label": "Flat 2B",
            "landlord_id": "L1",
            "property_id": "P1",
            "tenant_name": "Tunde",
        },
    )
    user = MagicMock()
    user.id = "tenant-1"
    out = access.list_my_pass_events(limit=40, user=user)  # type: ignore[arg-type]
    ids = {i["id"] for i in out["items"]}
    assert ids == {"ev-mine"}
    assert out["items"][0]["issuer_label"] == "Tunde"


def test_list_pass_events_portfolio_filters_assigned(monkeypatch):
    store = {
        "access_pass_events": [
            {
                "id": "e1",
                "landlord_id": "owner-1",
                "property_id": "prop-a",
                "event_type": "admitted",
                "actor_label": "Staff",
                "metadata": {"created_by_label": "Ada"},
                "created_at": "2026-09-23T10:00:00+00:00",
            },
            {
                "id": "e2",
                "landlord_id": "owner-1",
                "property_id": "prop-b",
                "event_type": "created",
                "actor_label": "Ada",
                "metadata": {},
                "created_at": "2026-09-23T11:00:00+00:00",
            },
            {
                "id": "e3",
                "landlord_id": "owner-1",
                "property_id": "prop-c",
                "event_type": "admitted",
                "actor_label": "Staff",
                "metadata": {},
                "created_at": "2026-09-23T12:00:00+00:00",
            },
        ]
    }
    ctx = AccessContext(
        user_id="staff-1",
        owner_id="owner-1",
        role="caretaker",
        permissions={PERM_ACCESS_VISITOR_PASSES},
        property_ids={"prop-a", "prop-b"},
    )
    monkeypatch.setattr(access, "create_service_client", lambda: _Svc(store))
    monkeypatch.setattr(
        access, "require_property_access", lambda *a, **k: ctx
    )
    user = MagicMock()
    user.id = "staff-1"
    out = access.list_pass_events(
        property_id="prop-a",
        scope="portfolio",
        limit=40,
        user=user,  # type: ignore[arg-type]
    )
    ids = {i["id"] for i in out["items"]}
    assert ids == {"e1", "e2"}
    assert out["scope"] == "portfolio"


def test_list_pass_events_rejects_bad_scope(monkeypatch):
    ctx = AccessContext(
        user_id="owner-1",
        owner_id="owner-1",
        role="owner",
        permissions=set(),
    )
    monkeypatch.setattr(
        access, "require_property_access", lambda *a, **k: ctx
    )
    user = MagicMock()
    user.id = "owner-1"
    with pytest.raises(HTTPException) as ei:
        access.list_pass_events(
            property_id="prop-a",
            scope="everywhere",
            limit=40,
            user=user,  # type: ignore[arg-type]
        )
    assert ei.value.status_code == 400
