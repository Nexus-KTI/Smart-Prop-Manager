"""Slice 3: single-statement deletes, atomic claims, message paging, bounded reads, access cache."""

from __future__ import annotations

import inspect
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from lib import access, reminder_job, request_cache
from lib.pagination import decode_cursor


def _rpc_client(result, calls):
    def rpc(name, params):
        calls.append((name, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=result))

    return rpc


# --- Deletes ---------------------------------------------------------------


def test_unit_and_property_delete_is_one_statement():
    from routers import properties

    unit_src = inspect.getsource(properties.delete_unit)
    prop_src = inspect.getsource(properties.delete_property)
    for src in (unit_src, prop_src):
        assert 'table("reminders")' not in src
        assert 'table("transactions")' not in src
        assert src.count(".delete()") == 1
    assert "Unit not found" in unit_src
    assert "Property not found" in prop_src


class _DeleteQuery:
    def __init__(self, rows):
        self.rows = rows

    def delete(self):
        return self

    def eq(self, *_a):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


def test_delete_unit_404_when_nothing_deleted(monkeypatch):
    from routers import properties

    monkeypatch.setattr(
        properties, "require_unit_access", lambda *_a, **_k: SimpleNamespace(role="owner")
    )
    user = SimpleNamespace(id="o1", db=SimpleNamespace(table=lambda _n: _DeleteQuery([])))
    with pytest.raises(HTTPException) as exc:
        properties.delete_unit("u1", user)  # type: ignore[arg-type]
    assert exc.value.status_code == 404
    user.db = SimpleNamespace(table=lambda _n: _DeleteQuery([{"id": "u1"}]))
    assert properties.delete_unit("u1", user) == {"ok": True, "id": "u1"}  # type: ignore[arg-type]


# --- Claims ----------------------------------------------------------------


class _TokenQuery:
    def __init__(self, row):
        self.row = row

    def select(self, *_a):
        return self

    def eq(self, *_a):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return SimpleNamespace(data=[self.row] if self.row else [])


def _tenancy_svc(rpc_result, calls):
    return SimpleNamespace(
        table=lambda _n: _TokenQuery({"id": "t1", "tenant_contact": "+2348000000000"}),
        rpc=_rpc_client(rpc_result, calls),
    )


@pytest.mark.parametrize(
    "outcome,status_code",
    [("already_claimed", 409), ("not_found", 404)],
)
def test_tenancy_claim_maps_rpc_refusals(monkeypatch, outcome, status_code):
    from routers import tenancies

    calls: list = []
    monkeypatch.setattr(tenancies, "enforce_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(tenancies, "require_invite_contact_match", lambda *a, **k: None)
    monkeypatch.setattr(
        tenancies, "create_service_client", lambda: _tenancy_svc({"outcome": outcome}, calls)
    )
    user = SimpleNamespace(id="u1", access_token="jwt")
    with pytest.raises(HTTPException) as exc:
        tenancies.claim_tenancy({"token": "tok"}, user)  # type: ignore[arg-type]
    assert exc.value.status_code == status_code
    assert calls[0] == (
        "claim_tenancy_invite",
        {"p_tenancy_id": "t1", "p_token": "tok", "p_user_id": "u1"},
    )


def test_tenancy_claim_returns_rpc_row(monkeypatch):
    from routers import tenancies

    calls: list = []
    claimed = {"id": "t1", "tenant_user_id": "u1", "invite_token": None, "status": "draft"}
    monkeypatch.setattr(tenancies, "enforce_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(tenancies, "require_invite_contact_match", lambda *a, **k: None)
    monkeypatch.setattr(
        tenancies,
        "create_service_client",
        lambda: _tenancy_svc({"outcome": "claimed", "tenancy": claimed}, calls),
    )
    out = tenancies.claim_tenancy({"token": "tok"}, SimpleNamespace(id="u1", access_token="jwt"))  # type: ignore[arg-type]
    assert out["tenancy"]["tenant_user_id"] == "u1"
    assert len(calls) == 1


def test_artisan_claim_is_one_rpc(monkeypatch):
    from routers import artisans

    calls: list = []
    svc = SimpleNamespace(
        table=lambda _n: _TokenQuery({"id": "inv1", "invite_contact": "+234", "status": "invited"}),
        rpc=_rpc_client(
            {"outcome": "claimed", "link": {"id": "inv1", "status": "active"}, "profile": {"user_id": "u1"}},
            calls,
        ),
    )
    monkeypatch.setattr(artisans, "enforce_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(artisans, "require_invite_contact_match", lambda *a, **k: None)
    monkeypatch.setattr(artisans, "create_service_client", lambda: svc)
    out = artisans.claim_invite(
        {"token": "tok", "display_name": "Bode", "trades": "plumbing, electrical"},
        SimpleNamespace(id="u1", access_token="jwt"),  # type: ignore[arg-type]
    )
    assert out["item"]["status"] == "active"
    name, params = calls[0]
    assert name == "claim_artisan_invite"
    assert params["p_trades"] == ["plumbing", "electrical"]


def test_staff_claim_is_conditional_on_token_and_not_revoked():
    from routers import staff

    src = inspect.getsource(staff.claim_staff_invite)
    assert '.eq("invite_token", token)' in src
    assert '.neq("status", "revoked")' in src
    assert "Invite no longer available" in src


# --- Messages --------------------------------------------------------------


class _PageQuery:
    def __init__(self, rows):
        self.rows = rows
        self.cursor_filter = None
        self.n = None

    def select(self, *_a):
        return self

    def eq(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def or_(self, expr):
        self.cursor_filter = expr
        return self

    def limit(self, n):
        self.n = n
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows[: self.n])


def test_messages_load_newest_page_first(monkeypatch):
    from routers import messages

    newest_first = [
        {"id": f"m{i:03d}", "thread_id": "t1", "sender_id": "u1", "body": str(i), "created_at": f"2026-10-03T10:{i:02d}:00+00:00"}
        for i in range(59, -1, -1)
    ]
    query = _PageQuery(newest_first)
    user = SimpleNamespace(id="u1", db=SimpleNamespace(table=lambda _n: query))
    monkeypatch.setattr(messages, "_load_thread", lambda *_a: {"id": "t1"})
    monkeypatch.setattr(messages, "_svc_or_user", lambda _u: user.db)
    monkeypatch.setattr(messages, "_peer_last_read_at", lambda *_a: None)
    monkeypatch.setattr("lib.message_media.present_message", lambda row: row)
    out = messages.list_messages("t1", user)  # type: ignore[arg-type]
    bodies = [m["body"] for m in out["items"]]
    assert len(bodies) == messages.MESSAGES_PAGE
    assert bodies[-1] == "59" and bodies[0] == "10"
    assert decode_cursor(out["next_before"]) == ("2026-10-03T10:10:00+00:00", "m010")

    query2 = _PageQuery(newest_first[50:])
    user.db = SimpleNamespace(table=lambda _n: query2)
    older = messages.list_messages("t1", user, before=out["next_before"])  # type: ignore[arg-type]
    assert [m["body"] for m in older["items"]][-1] == "9"
    assert older["next_before"] is None
    assert query2.cursor_filter is not None


def test_chat_send_writes_preview_through_rpc():
    from routers import messages
    from tests.test_send_hardening import _MsgDb

    db = _MsgDb()
    messages._store_user_message(db, {"id": "t1"}, "u1", "", {"media_kind": "image", "media_path": "t1/x.jpg"})
    assert db.messages[0]["media_path"] == "t1/x.jpg"
    assert db.previews["t1"]


# --- Bounded reads ---------------------------------------------------------


class _UnitsQuery:
    def __init__(self, total, calls):
        self.total = total
        self.calls = calls
        self.span = (0, 0)

    def order(self, column):
        assert column == "id"
        return self

    def range(self, start, end):
        self.span = (start, end)
        self.calls.append((start, end))
        return self

    def execute(self):
        start, end = self.span
        stop = min(end + 1, self.total)
        return SimpleNamespace(data=[{"id": i} for i in range(start, stop)])


def test_reminder_job_pages_past_the_row_cap():
    calls: list = []
    rows = reminder_job._select_all_units(lambda: _UnitsQuery(1201, calls))
    assert len(rows) == 1201
    assert calls == [(0, 499), (500, 999), (1000, 1499)]


def test_ops_and_urgent_read_the_capped_snapshot():
    from lib import urgent_actions
    from routers import staff

    root = Path(__file__).resolve().parents[1]
    sql = (root / "sql" / "055_portfolio_unit_snapshot.sql").read_text(encoding="utf-8")
    assert f"limit {urgent_actions.RECENT_TXN_LIMIT}" in sql
    assert '"portfolio_unit_snapshot"' in inspect.getsource(urgent_actions.load_portfolio_snapshot)
    assert "load_portfolio_snapshot(" in inspect.getsource(staff.portfolio_overdue_ops)


# --- Access cache ----------------------------------------------------------


class _CountingSvc:
    def __init__(self):
        self.queries = 0

    def table(self, _name):
        return self

    def select(self, *_a):
        return self

    def eq(self, *_a):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        self.queries += 1
        return SimpleNamespace(data=[{"id": "p1", "owner_id": "o1"}])


def test_access_lookups_are_cached_within_a_request(monkeypatch):
    svc = _CountingSvc()
    monkeypatch.setattr(access, "_svc", lambda: svc)
    access.list_owned_property_ids("o1")
    access.list_owned_property_ids("o1")
    assert svc.queries == 2

    token = request_cache.start_request_cache()
    try:
        first = access.list_owned_property_ids("o1")
        first.add("mutated")
        assert access.list_owned_property_ids("o1") == {"p1"}
        access._property_owner_id("p1")
        access._property_owner_id("p1")
    finally:
        request_cache.end_request_cache(token)
    assert svc.queries == 4


def test_request_cache_reaches_sync_routes():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from lib.observability import RequestIdMiddleware

    app = FastAPI()
    loads: list[int] = []

    @app.get("/twice")
    def twice():
        for _ in range(2):
            request_cache.memo("k", lambda: loads.append(1) or 1)
        return {"ok": True}

    app.add_middleware(RequestIdMiddleware)
    client = TestClient(app)
    client.get("/twice")
    client.get("/twice")
    assert len(loads) == 2
