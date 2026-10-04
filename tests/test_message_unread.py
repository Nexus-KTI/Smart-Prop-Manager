"""Unread thread badge and thread list read markers without per-thread queries."""

from __future__ import annotations

import os
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from routers import messages  # noqa: E402


class _Query:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.filters: dict = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, values):
        self.filters[column] = list(values)
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a):
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        self.db.queries.append((self.table, dict(self.filters)))
        if self.table == "message_thread_reads":
            ids = set(self.filters["thread_id"])
            return SimpleNamespace(data=[r for r in self.db.reads if r["thread_id"] in ids])
        if self.filters.get("landlord_id"):
            return SimpleNamespace(data=self.db.threads)
        return SimpleNamespace(data=[])


class _Db:
    def __init__(self, threads, reads, rpc_result=None, rpc_error=None):
        self.threads = threads
        self.reads = reads
        self.rpc_result = rpc_result
        self.rpc_error = rpc_error
        self.queries: list = []

    def table(self, name):
        return _Query(self, name)

    def rpc(self, name, _params):
        assert name == "unread_thread_count"
        if self.rpc_error:
            raise self.rpc_error
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=self.rpc_result))


def _user(db):
    return SimpleNamespace(id="u1", db=db)


THREADS = [
    {"id": f"t{i}", "landlord_id": "u1", "last_message_at": "2026-10-03T10:00:00+00:00"}
    for i in range(150)
]
READS = [
    {"thread_id": "t0", "last_read_at": "2026-10-03T11:00:00+00:00"},
    {"thread_id": "t1", "last_read_at": "2026-10-03T09:00:00+00:00"},
]


def test_unread_count_uses_one_rpc_call():
    db = _Db(THREADS, READS, rpc_result=7)
    assert messages.unread_count(_user(db))["unread_threads"] == 7
    assert db.queries == []


def test_unread_count_fallback_batches_read_markers():
    db = _Db(THREADS, READS, rpc_error=RuntimeError("function missing"))
    assert messages.unread_count(_user(db))["unread_threads"] == 149
    marker_queries = [q for q in db.queries if q[0] == "message_thread_reads"]
    assert len(marker_queries) == 2


def test_is_unread_compares_times_not_strings():
    markers = {"t": "2026-10-03T10:00:00.5+00:00"}
    assert not messages._is_unread(
        {"id": "t", "last_message_at": "2026-10-03T10:00:00+00:00"}, markers
    )
    assert messages._is_unread({"id": "x", "last_message_at": "2026-10-03T10:00:00Z"}, markers)
    assert not messages._is_unread({"id": "x", "last_message_at": None}, markers)


def test_unread_migration_is_security_invoker():
    from pathlib import Path

    sql = (Path(__file__).resolve().parents[1] / "sql" / "045_unread_thread_count.sql").read_text(
        encoding="utf-8"
    )
    assert "security invoker" in sql
    assert "left join public.message_thread_reads" in sql
