"""Tests for landlord payment-received email + reminder log wiring."""

import inspect
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from lib.notify import format_payment_amount, notify_landlord_payment_received
from routers import payments  # noqa: E402

NAIRA = "\u20a6"
THIN = "\u00A0"
MIDDOT = "\u00b7"


def test_format_payment_amount():
    assert format_payment_amount(150000) == f"{NAIRA}{THIN}150,000.00"
    assert format_payment_amount("2500.5") == f"{NAIRA}{THIN}2,500.50"
    assert format_payment_amount(None) == f"{NAIRA}{THIN}0.00"


def test_notify_skips_when_no_owner_email(monkeypatch):
    monkeypatch.setattr("lib.notify.get_owner_email", lambda _owner_id: None)
    sent = {"called": False}

    def _fake_send(*_args, **_kwargs):
        sent["called"] = True

    monkeypatch.setattr("lib.notify.send_email", _fake_send)
    assert (
        notify_landlord_payment_received(
            "owner-1",
            amount=5000,
            unit_label="Flat 2",
            property_name="Palm Court",
        )
        == "skipped"
    )
    assert sent["called"] is False


def test_notify_sends_expected_message(monkeypatch):
    monkeypatch.setattr(
        "lib.notify.get_owner_email", lambda _owner_id: "landlord@example.com"
    )
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    captured: dict = {}

    def _fake_send(contact, message, *, subject="Nexora notice", html=None):
        captured["contact"] = contact
        captured["message"] = message
        captured["subject"] = subject
        captured["html"] = html

    monkeypatch.setattr("lib.notify.send_email", _fake_send)
    assert (
        notify_landlord_payment_received(
            "owner-1",
            amount=150000,
            unit_label="Flat 2",
            property_name="Palm Court",
            tenant_name="Ada Tenant",
            unit_id="unit-1",
        )
        == "sent"
    )
    expected_subject = (
        f"Money in: {NAIRA}{THIN}150,000.00 from Ada Tenant (Palm Court {MIDDOT} Flat 2)."
    )
    assert captured["contact"] == "landlord@example.com"
    assert captured["subject"] == expected_subject
    assert expected_subject in captured["message"]
    assert "View payment: https://app.example.com/payments/unit-1" in captured["message"]
    assert captured["html"] and "View payment" in captured["html"]


def test_notify_swallows_smtp_errors(monkeypatch):
    monkeypatch.setattr(
        "lib.notify.get_owner_email", lambda _owner_id: "landlord@example.com"
    )
    monkeypatch.setenv("MAILGUN_API_KEY", "test-key")
    monkeypatch.setenv("MAILGUN_DOMAIN", "example.com")

    def _boom(*_args, **_kwargs):
        raise RuntimeError("SMTP down")

    monkeypatch.setattr("lib.notify.send_email", _boom)
    result = notify_landlord_payment_received(
        "owner-1",
        amount=1000,
        unit_label="A",
        property_name="B",
    )
    assert result == "failed"
    assert result.detail and "SMTP down" in result.detail


def test_manual_and_webhook_paths_call_deliver_payment_receipt():
    """Both paid paths must invoke the shared receipt/landlord-email helper."""
    manual_src = inspect.getsource(payments.record_manual_payment)
    webhook_src = inspect.getsource(payments.paystack_webhook)
    confirm_src = inspect.getsource(payments.confirm_paystack_payment)
    assert "deliver_payment_receipt" in manual_src
    assert "deliver_payment_receipt" in webhook_src
    assert "deliver_payment_receipt" in confirm_src


def test_deliver_payment_receipt_logs_landlord_notice(monkeypatch):
    """Landlord email outcome is written to reminders (UI-visible)."""
    logged: list[dict] = []

    monkeypatch.setattr(
        payments,
        "_load_unit_context",
        lambda _db, _unit_id: (
            {"label": "Flat 2", "tenant_name": "Ada", "tenant_contact": ""},
            "Palm Court",
            "owner-1",
        ),
    )
    monkeypatch.setattr(payments, "_business_name_for_owner", lambda _db, _oid: None)
    monkeypatch.setattr(
        payments,
        "notify_landlord_payment_received",
        lambda *_a, **_k: "sent",
    )
    monkeypatch.setattr(
        payments,
        "get_owner_notification_channel",
        lambda *_a, **_k: "sms",
    )
    monkeypatch.setattr(payments, "generate_receipt", lambda _payload: b"%PDF")
    monkeypatch.setattr(
        payments, "upload_receipt", lambda _txn_id, _pdf: "https://example.com/r.pdf"
    )
    monkeypatch.setattr(
        payments,
        "_log_reminder",
        lambda _db, unit_id, *, kind, channel, reminder_status, error_detail=None: logged.append(
            {
                "unit_id": unit_id,
                "kind": kind,
                "channel": channel,
                "status": reminder_status,
                "error_detail": error_detail,
            }
        ),
    )

    url = payments.deliver_payment_receipt(
        db=object(),
        transaction={"id": "txn-1", "unit_id": "unit-1", "amount": 5000},
    )
    assert url == "https://example.com/r.pdf"
    assert any(
        row["kind"] == "landlord_payment"
        and row["channel"] == "email"
        and row["status"] == "sent"
        for row in logged
    )


def test_deliver_payment_receipt_logs_skipped_when_no_email(monkeypatch):
    logged: list[dict] = []

    monkeypatch.setattr(
        payments,
        "_load_unit_context",
        lambda _db, _unit_id: (
            {"label": "A", "tenant_name": None, "tenant_contact": None},
            "Prop",
            "owner-1",
        ),
    )
    monkeypatch.setattr(payments, "_business_name_for_owner", lambda *_a: None)
    monkeypatch.setattr(
        payments,
        "notify_landlord_payment_received",
        lambda *_a, **_k: "skipped",
    )
    monkeypatch.setattr(
        payments, "get_owner_notification_channel", lambda *_a, **_k: "sms"
    )
    monkeypatch.setattr(payments, "generate_receipt", lambda _p: b"%PDF")
    monkeypatch.setattr(
        payments, "upload_receipt", lambda *_a: "https://example.com/r.pdf"
    )
    monkeypatch.setattr(
        payments,
        "_log_reminder",
        lambda _db, unit_id, *, kind, channel, reminder_status, error_detail=None: logged.append(
            {
                "kind": kind,
                "status": reminder_status,
                "channel": channel,
                "error_detail": error_detail,
            }
        ),
    )

    payments.deliver_payment_receipt(
        db=object(),
        transaction={"id": "txn-2", "unit_id": "unit-2", "amount": 100},
    )
    assert any(
        row["kind"] == "landlord_payment"
        and row["status"] == "skipped"
        and row["error_detail"]
        for row in logged
    )


def test_deliver_payment_receipt_logs_failed_smtp_without_raising(monkeypatch):
    logged: list[dict] = []

    monkeypatch.setattr(
        payments,
        "_load_unit_context",
        lambda _db, _unit_id: (
            {"label": "A", "tenant_name": None, "tenant_contact": None},
            "Prop",
            "owner-1",
        ),
    )
    monkeypatch.setattr(payments, "_business_name_for_owner", lambda *_a: None)
    monkeypatch.setattr(
        payments,
        "notify_landlord_payment_received",
        lambda *_a, **_k: "failed",
    )
    monkeypatch.setattr(
        payments, "get_owner_notification_channel", lambda *_a, **_k: "sms"
    )
    monkeypatch.setattr(payments, "generate_receipt", lambda _p: b"%PDF")
    monkeypatch.setattr(
        payments, "upload_receipt", lambda *_a: "https://example.com/r.pdf"
    )
    monkeypatch.setattr(
        payments,
        "_log_reminder",
        lambda _db, unit_id, *, kind, channel, reminder_status, error_detail=None: logged.append(
            {
                "kind": kind,
                "status": reminder_status,
                "error_detail": error_detail,
            }
        ),
    )

    url = payments.deliver_payment_receipt(
        db=object(),
        transaction={"id": "txn-3", "unit_id": "unit-3", "amount": 100},
    )
    assert url == "https://example.com/r.pdf"
    assert any(
        row["kind"] == "landlord_payment"
        and row["status"] == "failed"
        and row["error_detail"]
        for row in logged
    )


def test_landlord_payment_notice_detail_email_unconfigured(monkeypatch):
    from lib.notify import landlord_payment_notice_detail

    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM", raising=False)
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("MAILGUN_API_KEY", raising=False)
    monkeypatch.delenv("MAILGUN_DOMAIN", raising=False)
    monkeypatch.delenv("MAILGUN_SENDER_EMAIL", raising=False)
    monkeypatch.delenv("FROM_EMAIL", raising=False)
    detail = landlord_payment_notice_detail("failed")
    assert detail is not None
    assert "Email not configured" in detail


def test_mailgun_configured_and_send(monkeypatch):
    from lib.notify import email_transport_configured, mailgun_configured, send_email

    monkeypatch.setenv("EMAIL_SERVICE_PROVIDER", "mailgun")
    monkeypatch.setenv("MAILGUN_API_KEY", "test-key")
    monkeypatch.setenv("MAILGUN_DOMAIN", "example.com")
    monkeypatch.setenv("MAILGUN_API_BASE_URL", "https://api.mailgun.net")
    monkeypatch.setenv("MAILGUN_SENDER_EMAIL", "noreply@example.com")
    monkeypatch.setenv("EMAIL_FROM_NAME", "Nexora")
    monkeypatch.delenv("SMTP_HOST", raising=False)

    assert mailgun_configured() is True
    assert email_transport_configured() is True

    captured: dict = {}

    class _Resp:
        status_code = 200
        text = "ok"

    def _fake_post(url, *, auth=None, data=None, timeout=None):
        captured["url"] = url
        captured["auth"] = auth
        captured["data"] = data
        return _Resp()

    monkeypatch.setattr("httpx.post", _fake_post)
    send_email("landlord@example.com", "body", subject="Money in: test")
    assert captured["url"] == "https://api.mailgun.net/v3/example.com/messages"
    assert captured["auth"] == ("api", "test-key")
    assert captured["data"]["to"] == ["landlord@example.com"]
    assert captured["data"]["subject"] == "Money in: test"
    assert "Nexora" in captured["data"]["from"]
    assert "noreply@example.com" in captured["data"]["from"]


def test_get_owner_email_failure_is_treated_as_skip(monkeypatch):
    """Lookup errors inside get_owner_email must not propagate."""

    def _boom():
        raise RuntimeError("auth admin down")

    monkeypatch.setattr("lib.db.create_service_client", _boom)
    from lib.notify import get_owner_email

    assert get_owner_email("owner-1") is None
    assert (
        notify_landlord_payment_received(
            "owner-1", amount=1, unit_label="u", property_name="p"
        )
        == "skipped"
    )
