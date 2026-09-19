"""Tests for transactional email templates + Mailgun html transport."""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from lib.email_templates import (
    format_naira,
    landlord_money_in,
    tenant_due,
    tenant_receipt,
)

NAIRA = "\u20a6"
THIN = "\u00A0"
MDASH = "\u2014"
MIDDOT = "\u00b7"


def test_format_naira():
    assert format_naira(150000) == f"{NAIRA}{THIN}150,000.00"
    assert format_naira("2500.5") == f"{NAIRA}{THIN}2,500.50"
    assert format_naira(None) == f"{NAIRA}{THIN}0.00"


def test_landlord_money_in_includes_view_payment(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    monkeypatch.setenv("EMAIL_FROM_NAME", "Nexora")
    content = landlord_money_in(
        amount=150000,
        tenant_name="Ada Tenant",
        property_name="Palm Court",
        unit_label="Flat 2",
        unit_id="unit-abc",
    )
    assert content.subject.startswith(
        f"Money in: {NAIRA}{THIN}150,000.00 from Ada Tenant"
    )
    assert f"Palm Court {MIDDOT} Flat 2" in content.subject
    assert "View payment: https://app.example.com/payments/unit-abc" in content.text
    assert content.html is not None
    assert "View payment" in content.html
    assert "https://app.example.com/payments/unit-abc" in content.html
    assert 'role="presentation"' in content.html
    assert "#0f6e4f" in content.html
    assert "560" in content.html
    assert "Nexora" in content.html
    assert f"{NAIRA}{THIN}150,000.00" in content.html
    assert "Money in" in content.html


def test_tenant_receipt_subject_and_link(monkeypatch):
    monkeypatch.setenv("EMAIL_FROM_NAME", "Nexora")
    content = tenant_receipt(
        amount=5000,
        property_name="Palm Court",
        unit_label="Flat 2",
        receipt_url="https://cdn.example.com/r.pdf",
        business_name="Acme Lets",
    )
    assert content.subject == f"Payment receipt {MDASH} Palm Court {MIDDOT} Flat 2"
    assert "Acme Lets" in content.text
    assert f"{NAIRA}{THIN}5,000.00" in content.text
    assert "https://cdn.example.com/r.pdf" in content.text
    assert content.html is not None
    assert "Download receipt" in content.html
    assert "#0f6e4f" in content.html
    assert "Receipt" in content.html


def test_tenant_due_subject_and_body(monkeypatch):
    monkeypatch.setenv("EMAIL_FROM_NAME", "Nexora")
    content = tenant_due(
        amount=200000,
        property_name="Palm Court",
        unit_label="Flat 2",
        business_name="Acme Lets",
    )
    assert content.subject == f"Rent reminder {MDASH} Palm Court {MIDDOT} Flat 2"
    assert "Reminder from Acme Lets" in content.text
    assert f"{NAIRA}{THIN}200,000.00" in content.text
    assert content.html is not None
    assert "Rent reminder" in content.html
    assert f"{NAIRA}{THIN}200,000.00" in content.html
    # Due has no CTA button in v1
    assert "Download receipt" not in content.html
    assert "View payment" not in content.html


def test_email_shell_tokens():
    from lib.email_layout import EMAIL_TOKENS, CONTENT_WIDTH, render_email_shell

    assert EMAIL_TOKENS["accent"] == "#0f6e4f"
    assert CONTENT_WIDTH == 560
    html = render_email_shell(
        brand="Nexora",
        eyebrow="Test",
        amount=f"{NAIRA}1.00",
        title="Hello",
        body_html="<p>Body</p>",
        cta_url="https://example.com/x",
        cta_label="Open",
    )
    assert 'role="presentation"' in html
    assert "#0f6e4f" in html
    assert "Open" in html
    assert "https://example.com/x" in html


def test_render_transactional_email_params():
    from lib.email_layout import render_transactional_email

    html = render_transactional_email(
        heading="Confirm your login",
        body_text="Use this code to finish signing in.\n\nIt expires in 10 minutes.",
        code="482913",
        eyebrow="Verification",
        brand="Nexora",
    )
    assert "Confirm your login" in html
    assert "Use this code to finish signing in." in html
    assert "It expires in 10 minutes." in html
    assert "482913" in html
    assert "letter-spacing:0.12em" in html
    assert 'bgcolor="#f7f8f7"' in html
    assert 'bgcolor="#ffffff"' in html
    assert 'name="color-scheme" content="light only"' in html
    assert "#0f6e4f" in html
    assert "560" in html


def test_otp_notice_reuses_template():
    from lib.email_templates import otp_notice

    content = otp_notice(
        heading="Your Nexora code",
        body_text="Enter this code to continue.",
        code="991122",
    )
    assert content.subject == "Your Nexora code"
    assert "991122" in content.text
    assert content.html and "991122" in content.html
    assert "letter-spacing:0.12em" in content.html


def test_mailgun_send_includes_html(monkeypatch):
    from lib.notify import send_email

    monkeypatch.setenv("EMAIL_SERVICE_PROVIDER", "mailgun")
    monkeypatch.setenv("MAILGUN_API_KEY", "test-key")
    monkeypatch.setenv("MAILGUN_DOMAIN", "example.com")
    monkeypatch.setenv("MAILGUN_API_BASE_URL", "https://api.mailgun.net")
    monkeypatch.setenv("MAILGUN_SENDER_EMAIL", "noreply@example.com")
    monkeypatch.delenv("SMTP_HOST", raising=False)

    captured: dict = {}

    class _Resp:
        status_code = 200
        text = "ok"

    def _fake_post(url, *, auth=None, data=None, timeout=None):
        captured["data"] = data
        return _Resp()

    fake_client = type("Client", (), {"post": staticmethod(_fake_post)})()
    monkeypatch.setattr("lib.notify.get_http_client", lambda: fake_client)
    send_email(
        "tenant@example.com",
        "plain body",
        subject=f"Payment receipt {MDASH} Palm Court {MIDDOT} Flat 2",
        html="<p>plain body</p>",
    )
    assert captured["data"]["html"] == "<p>plain body</p>"
    assert captured["data"]["text"] == "plain body"
