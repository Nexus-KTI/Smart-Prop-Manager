"""Application submit/decide notify."""

from __future__ import annotations

from unittest.mock import MagicMock

from lib.application_notify import (
    notify_application_decided,
    notify_application_submitted,
)


def test_notify_submitted_enqueues(monkeypatch):
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
        lambda *_a, **_k: "landlord@example.com",
    )
    sent = {}

    def _enqueue(_db, **kwargs):
        sent.update(kwargs)
        return {"channel": "email"}

    monkeypatch.setattr("lib.delivery_outbox.enqueue_notification", _enqueue)
    out = notify_application_submitted(
        MagicMock(),
        landlord_id="L1",
        application_id="app-1",
        applicant_name="Tunde",
        property_name="Palm Court",
        unit_label="Flat 2",
    )
    assert out["sent"] is True
    assert sent["idempotency_key"] == "application-submit:app-1"
    assert sent["event"] == "messages"
    assert "Review applications" in (sent.get("email_html") or "")


def test_notify_decided_skips_without_contact():
    out = notify_application_decided(
        MagicMock(),
        application_id="app-1",
        status="rejected",
        applicant_email=None,
        applicant_phone=None,
    )
    assert out["sent"] is False
    assert out["error"] == "no_contact"


def test_notify_decided_email(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    sent = {}

    def _enqueue(_db, **kwargs):
        sent.update(kwargs)
        return {"channel": "email"}

    monkeypatch.setattr("lib.delivery_outbox.enqueue_notification", _enqueue)
    out = notify_application_decided(
        MagicMock(),
        application_id="app-9",
        status="approved",
        applicant_email="tunde@example.com",
        applicant_phone="+234800",
        property_name="Palm Court",
        unit_label="Flat 2",
        next_url="https://app.example.com/tenant/claim?token=abc",
    )
    assert out["sent"] is True
    assert sent["contact"] == "tunde@example.com"
    assert sent["idempotency_key"] == "application-decide:app-9:approved"
    assert sent["channel"] == "email"
    assert "Claim this unit" in (sent.get("email_html") or "")
