"""Cross-owner boundary: Manager on A cannot resolve portfolio B."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException

from lib import access


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._filters: list[tuple] = []

    def select(self, *_a, **_k):
        return self

    def eq(self, key: str, value: Any):
        self._filters.append(("eq", key, value))
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = list(self._rows)
        for kind, key, value in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(key) == value]
        return type("R", (), {"data": rows})()


class _FakeDb:
    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables

    def table(self, name: str):
        return _FakeQuery(self._tables.get(name, []))


def test_manager_cannot_access_other_owner_portfolio(monkeypatch):
    db = _FakeDb(
        {
            "staff_memberships": [
                {
                    "id": "M1",
                    "owner_id": "OWNER_A",
                    "user_id": "PM1",
                    "role": "manager",
                    "status": "active",
                    "can_money": True,
                    "can_money_log_cash": True,
                    "can_chase": True,
                    "can_docs_view": True,
                    "can_docs_upload": True,
                    "can_access_visitor_passes": True,
                    "can_team_invite": True,
                    "scope_all_properties": True,
                }
            ],
            "properties": [
                {"id": "PA", "owner_id": "OWNER_A"},
                {"id": "PB", "owner_id": "OWNER_B"},
            ],
            "staff_membership_properties": [],
            "units": [],
        }
    )
    monkeypatch.setattr("lib.access._svc", lambda: db)

    ctx_a = access.resolve_portfolio("PM1", "OWNER_A")
    assert ctx_a.role == "manager"
    assert ctx_a.owner_id == "OWNER_A"

    with pytest.raises(HTTPException) as exc:
        access.resolve_portfolio("PM1", "OWNER_B")
    assert exc.value.status_code == 403
