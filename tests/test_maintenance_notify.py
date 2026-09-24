"""Unit tests for artisan assign notify helper."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from lib.maintenance_notify import notify_artisan_assigned


def test_notify_artisan_assigned_no_roster():
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = (
        []
    )
    out = notify_artisan_assigned(
        db, landlord_id="L1", artisan_user_id="A1", title="Leak"
    )
    assert out["sent"] is False
    assert out["error"] == "roster_not_found"


def test_notify_artisan_assigned_sent():
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"invite_contact": "+2348012345678"}
    ]
    with (
        patch("lib.email_templates.frontend_base_url", return_value="https://app.test"),
        patch(
            "lib.delivery_outbox.enqueue_notification",
            return_value={"channel": "sms"},
        ) as enqueue,
    ):
        out = notify_artisan_assigned(
            db, landlord_id="L1", artisan_user_id="A1", title="Leak"
        )
    assert out["sent"] is True
    assert out["queued"] is True
    assert out["channel"] == "sms"
    assert out["error"] is None
    enqueue.assert_called_once()


def test_notify_landlord_tenant_request_sent(monkeypatch):
    from lib.maintenance_notify import notify_landlord_tenant_request

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

    out = notify_landlord_tenant_request(
        MagicMock(),
        landlord_id="L1",
        request_id="req-1",
        title="Leaking tap",
        priority="urgent",
        property_name="Palm Court",
        unit_label="Flat 2",
        tenant_name="Tunde",
    )
    assert out["sent"] is True
    assert sent["idempotency_key"] == "tenant-maintenance:req-1"
    assert sent["event"] == "maintenance_update"
    assert sent["email_html"] and "Open work orders" in sent["email_html"]
    assert "Urgent" in sent["email_html"] or "urgent" in sent["email_html"].lower()


def test_tenant_maintenance_submitted_template(monkeypatch):
    monkeypatch.setenv("EMAIL_FROM_NAME", "Nexora")
    from lib.email_templates import tenant_maintenance_submitted

    mail = tenant_maintenance_submitted(
        title="Leaking tap",
        work_orders_url="https://app.example.com/work-orders",
        priority="urgent",
        property_name="Palm Court",
        unit_label="Flat 2",
        tenant_name="Tunde",
    )
    assert "Leaking tap" in mail.subject
    assert mail.html and "Open work orders" in mail.html
    assert "Tunde" in mail.html
