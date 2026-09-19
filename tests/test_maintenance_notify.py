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
