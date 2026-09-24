"""Unit tests for tenant to-do assign notify helper."""

from __future__ import annotations

from lib.tasks_notify import notify_tenant_task_assigned


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _FakeDb:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeQuery(self._rows)


def test_notify_skips_without_tenancy():
    out = notify_tenant_task_assigned(
        _FakeDb([]),
        landlord_id="ll1",
        tenancy_id=None,
        title="Pay service charge",
        due_on=None,
    )
    assert out["sent"] is False
    assert out["error"] == "no_tenancy"


def test_notify_skips_without_contact():
    out = notify_tenant_task_assigned(
        _FakeDb([{"id": "t1", "tenant_contact": "", "tenant_user_id": "u1"}]),
        landlord_id="ll1",
        tenancy_id="t1",
        title="Pay service charge",
        due_on="2026-09-20",
    )
    assert out["sent"] is False
    assert out["error"] == "no_contact"


def test_notify_sends_when_contact_present(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(
        "lib.notify.get_owner_notification_channel",
        lambda _db, _lid: "sms",
    )
    monkeypatch.setattr(
        "lib.notify.normalize_e164",
        lambda c: c if c.startswith("+") else f"+234{c[-10:]}",
    )
    monkeypatch.setattr(
        "lib.notification_prefs.load_profile_notification_prefs",
        lambda *_a, **_k: {},
    )
    sent = {}

    def _fake_enqueue(_db, **kwargs):
        sent.update(kwargs)
        return {"channel": "sms"}

    monkeypatch.setattr(
        "lib.delivery_outbox.enqueue_notification",
        _fake_enqueue,
    )

    out = notify_tenant_task_assigned(
        _FakeDb(
            [
                {
                    "id": "t1",
                    "tenant_contact": "+2348012345678",
                    "tenant_user_id": "u1",
                    "tenant_name": "Ada",
                }
            ]
        ),
        landlord_id="ll1",
        tenancy_id="t1",
        title="Send meter photo",
        due_on="2026-09-20",
    )
    assert out["sent"] is True
    assert out["queued"] is True
    assert out["channel"] == "sms"
    assert "Send meter photo" in sent["message"]
    assert "https://app.example.com/tenant/tasks" in sent["message"]
    assert sent["event"] == "messages"
    assert sent["email_html"] and "Open tasks" in sent["email_html"]
    assert "Send meter photo" in sent["email_subject"]


def test_notify_queues_html_on_email_channel(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(
        "lib.notify.get_owner_notification_channel",
        lambda _db, _lid: "email",
    )
    monkeypatch.setattr(
        "lib.notification_prefs.load_profile_notification_prefs",
        lambda *_a, **_k: {},
    )
    sent = {}

    def _fake_enqueue(_db, **kwargs):
        sent.update(kwargs)
        return {"channel": "email"}

    monkeypatch.setattr(
        "lib.delivery_outbox.enqueue_notification",
        _fake_enqueue,
    )

    out = notify_tenant_task_assigned(
        _FakeDb(
            [
                {
                    "id": "t1",
                    "tenant_contact": "tenant@example.com",
                    "tenant_user_id": "u1",
                    "tenant_name": "Ada",
                }
            ]
        ),
        landlord_id="ll1",
        tenancy_id="t1",
        title="Pay service charge",
        due_on=None,
    )
    assert out["sent"] is True
    assert out["channel"] == "email"
    assert sent["contact"] == "tenant@example.com"
    assert sent["email_html"] and "#0f6e4f" in sent["email_html"]
    assert "Open tasks" in sent["email_html"]
