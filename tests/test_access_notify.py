"""Unit tests for gate admit notify."""

from __future__ import annotations

from lib.access_notify import notify_guest_admitted


class _FakeQuery:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self._filters.append((key, value))
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = list(self._store.get(self._table, []))
        for key, value in self._filters:
            rows = [r for r in rows if r.get(key) == value]
        return type("R", (), {"data": rows})()


class _FakeDb:
    def __init__(self, store):
        self._store = store

    def table(self, name):
        return _FakeQuery(self._store, name)


def test_notify_queues_landlord_and_issuer(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(
        "lib.notify.get_owner_notification_channel",
        lambda _db, _uid: "email",
    )
    monkeypatch.setattr(
        "lib.notification_prefs.load_profile_notification_prefs",
        lambda *_a, **_k: {},
    )

    contacts = {
        "ll1": "landlord@example.com",
        "tenant1": "tenant@example.com",
    }

    def _fake_auth(user_id, channel):
        if channel != "email":
            return None
        return contacts.get(user_id)

    monkeypatch.setattr("lib.access_notify._auth_contact", _fake_auth)

    sent = []

    def _fake_enqueue(_db, **kwargs):
        sent.append(kwargs)
        return {"channel": "email"}

    monkeypatch.setattr(
        "lib.delivery_outbox.enqueue_notification",
        _fake_enqueue,
    )

    db = _FakeDb(
        {
            "properties": [{"id": "p1", "name": "Palm Court"}],
            "units": [{"id": "u1", "label": "Flat 2"}],
        }
    )
    out = notify_guest_admitted(
        db,
        landlord_id="ll1",
        property_id="p1",
        unit_id="u1",
        pass_id="pass1",
        event_id="evt1",
        code="AB12CD",
        subject_label="Uncle Bola",
        admitter_user_id="staff1",
        admitter_label="Chinedu",
        issuer_user_id="tenant1",
        issuer_label="Tunde",
        admitted_at="2026-09-24T15:00:00+00:00",
        uses_count=1,
    )
    assert out["landlord"]["sent"] is True
    assert out["issuer"]["sent"] is True
    assert len(sent) == 2
    keys = {s["idempotency_key"] for s in sent}
    assert "gate-admit:evt1:landlord" in keys
    assert "gate-admit:evt1:issuer" in keys
    assert any("Open gate activity" in (s.get("email_html") or "") for s in sent)
    assert any("Open my codes" in (s.get("email_html") or "") for s in sent)
    assert any(s["contact"] == "landlord@example.com" for s in sent)
    assert any(s["contact"] == "tenant@example.com" for s in sent)


def test_notify_skips_landlord_when_they_admit(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(
        "lib.notify.get_owner_notification_channel",
        lambda *_a, **_k: "email",
    )
    monkeypatch.setattr(
        "lib.notification_prefs.load_profile_notification_prefs",
        lambda *_a, **_k: {},
    )
    monkeypatch.setattr(
        "lib.access_notify._auth_contact",
        lambda uid, _ch: f"{uid}@example.com",
    )
    sent = []
    monkeypatch.setattr(
        "lib.delivery_outbox.enqueue_notification",
        lambda _db, **kwargs: sent.append(kwargs) or {"channel": "email"},
    )

    out = notify_guest_admitted(
        _FakeDb({"properties": [{"id": "p1", "name": "Palm"}], "units": []}),
        landlord_id="ll1",
        property_id="p1",
        unit_id=None,
        pass_id="pass1",
        event_id="evt2",
        code="XY99",
        subject_label=None,
        admitter_user_id="ll1",
        admitter_label="Ada",
        issuer_user_id="tenant1",
        issuer_label="Tunde",
        admitted_at=None,
        uses_count=2,
    )
    assert out["landlord"] is None
    assert out["issuer"]["sent"] is True
    assert len(sent) == 1
    assert sent[0]["idempotency_key"] == "gate-admit:evt2:issuer"


def test_guest_admitted_template(monkeypatch):
    monkeypatch.setenv("EMAIL_FROM_NAME", "Nexora")
    from lib.email_templates import guest_admitted

    mail = guest_admitted(
        audience="landlord",
        code="AB12CD",
        place="Palm Court · Flat 2",
        admitter_label="Chinedu",
        issuer_label="Tunde",
        subject_label="Uncle Bola",
        when_label="2026-09-24T15:00:00Z",
        access_url="https://app.example.com/access",
    )
    assert "Guest admitted" in mail.subject
    assert mail.html and "AB12CD" in mail.html
    assert "Open gate activity" in mail.html
    assert "Chinedu" in mail.html
