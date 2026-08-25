"""Bulk chase should log channel mismatches (not silent skip)."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from routers.reminders import send_bulk_reminders


class _FakeExecute:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table_name = table
        self._filters = {}
        self._payload = None
        self._op = "select"

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, row):
        self._op = "insert"
        self._payload = row
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._op == "insert" and self.table_name == "reminders":
            self.db.inserted.append(dict(self._payload))
            return _FakeExecute([self._payload])
        if self.table_name == "units":
            unit_id = self._filters.get("id")
            row = self.db.units.get(unit_id)
            return _FakeExecute([row] if row else [])
        if self.table_name == "profiles":
            return _FakeExecute(
                [{"notification_channel": "sms", "business_name": "Test Co"}]
            )
        return _FakeExecute([])


class _FakeDb:
    def __init__(self, units: dict):
        self.units = units
        self.inserted: list[dict] = []

    def table(self, name):
        return _FakeQuery(self, name)


class _FakeUser:
    def __init__(self, db):
        self.id = "owner-1"
        self.db = db


def test_bulk_logs_channel_mismatch_as_failed(monkeypatch):
    db = _FakeDb(
        {
            "u1": {
                "id": "u1",
                "label": "Flat 1",
                "rent_amount": 1000,
                "tenant_contact": "not-a-phone@example.com",
                "properties": {"name": "Palm", "owner_id": "owner-1"},
            }
        }
    )
    user = _FakeUser(db)

    class _Ctx:
        role = "owner"
        owner_id = "owner-1"

    monkeypatch.setattr(
        "lib.access.require_unit_access",
        lambda *_a, **_k: _Ctx(),
    )
    monkeypatch.setattr(
        "lib.db.create_service_client",
        lambda: db,
    )
    monkeypatch.setattr(
        "routers.reminders.get_owner_notification_channel",
        lambda _db, _oid: "sms",
    )
    monkeypatch.setattr(
        "routers.reminders.contact_matches_channel",
        lambda _channel, _contact: False,
    )

    stats = send_bulk_reminders({"unit_ids": ["u1"]}, user)  # type: ignore[arg-type]

    assert stats["failed"] == 1
    assert stats["sent"] == 0
    assert stats["skipped"] == 0
    assert stats["errors"]
    assert "u1" in stats["failed_unit_ids"]
    assert "Palm" in stats["errors"][0]["label"]
    assert "contact" in stats["errors"][0]["detail"].lower()
    assert db.inserted
    assert db.inserted[0]["status"] == "failed"
    assert db.inserted[0]["kind"] == "due"
    assert db.inserted[0].get("error_detail")
