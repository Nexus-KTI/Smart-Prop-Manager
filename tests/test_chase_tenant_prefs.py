"""Tenant notification prefs for chase / unit resolution."""

from __future__ import annotations

from lib.notification_prefs import (
    event_channel_enabled,
    is_prefs_opt_out_error,
    load_tenant_prefs_for_unit,
    tenant_user_id_for_unit,
)
from lib.notify import send_notification


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def neq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _FakeDb:
    def __init__(self, tables: dict):
        self._tables = tables

    def table(self, name):
        return _FakeQuery(self._tables.get(name, []))


def test_tenant_user_id_for_unit_found():
    db = _FakeDb(
        {
            "tenancies": [
                {"tenant_user_id": "tenant-1"},
            ]
        }
    )
    assert (
        tenant_user_id_for_unit(db, unit_id="u1", landlord_id="ll1") == "tenant-1"
    )


def test_load_tenant_prefs_none_without_linked_user():
    db = _FakeDb({"tenancies": [{"tenant_user_id": None}]})
    assert load_tenant_prefs_for_unit(db, unit_id="u1", landlord_id="ll1") is None


def test_load_tenant_prefs_from_profile():
    db = _FakeDb(
        {
            "tenancies": [{"tenant_user_id": "tenant-1"}],
            "profiles": [
                {
                    "notification_prefs": {
                        "rent_due": {
                            "email": True,
                            "sms": False,
                            "whatsapp": True,
                            "feed": True,
                        }
                    }
                }
            ],
        }
    )
    prefs = load_tenant_prefs_for_unit(db, unit_id="u1", landlord_id="ll1")
    assert prefs is not None
    assert event_channel_enabled(prefs, "rent_due", "sms") is False
    assert event_channel_enabled(prefs, "rent_due", "email") is True


def test_send_notification_respects_rent_due_opt_out(monkeypatch):
    monkeypatch.setattr(
        "lib.notify.resolve_channel",
        lambda _c: "sms",
    )
    monkeypatch.setattr(
        "lib.notify.contact_matches_channel",
        lambda *_a, **_k: True,
    )

    called = {"sms": False}

    def _boom(*_a, **_k):
        called["sms"] = True

    monkeypatch.setattr("lib.notify.send_sms", _boom)

    prefs = {
        "rent_due": {
            "email": True,
            "sms": False,
            "whatsapp": True,
            "feed": True,
        }
    }
    try:
        send_notification(
            "sms",
            "+2348012345678",
            "Pay rent",
            event="rent_due",
            notification_prefs=prefs,
        )
        raised = False
    except RuntimeError as exc:
        raised = True
        assert is_prefs_opt_out_error(exc)

    assert raised is True
    assert called["sms"] is False
