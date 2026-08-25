"""Notification helpers (WhatsApp / SMS / email) with landlord channel preference."""

from __future__ import annotations

import logging
import os
import re
import smtplib
from email.message import EmailMessage
from typing import Any, Literal
from dataclasses import dataclass

from twilio.rest import Client

from lib.brand import BRAND_NAME

logger = logging.getLogger(__name__)

NotificationChannel = Literal["whatsapp", "sms", "email"]
# SMS is the reliable default for NG (WhatsApp needs a production sender/template).
DEFAULT_CHANNEL: NotificationChannel = "sms"
VALID_CHANNELS = frozenset({"whatsapp", "sms", "email"})


def resolve_channel(channel: str | None) -> NotificationChannel:
    """Normalize a channel preference; fall back to SMS if unset/invalid."""
    if not channel:
        return DEFAULT_CHANNEL
    value = str(channel).strip().lower()
    if value in VALID_CHANNELS:
        return value  # type: ignore[return-value]
    return DEFAULT_CHANNEL


def get_owner_notification_channel(db: Any, owner_id: str | None) -> NotificationChannel:
    """Read profiles.notification_channel for a landlord; default SMS."""
    if not owner_id:
        return DEFAULT_CHANNEL
    try:
        rows = (
            db.table("profiles")
            .select("notification_channel")
            .eq("id", owner_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        logger.exception("Failed to load notification_channel for %s", owner_id)
        return DEFAULT_CHANNEL
    if not rows:
        return DEFAULT_CHANNEL
    return resolve_channel(rows[0].get("notification_channel"))


def get_owner_email(owner_id: str | None) -> str | None:
    """
    Load the landlord's email from auth.users (Settings profile email).
    Returns None when unset/invalid — callers should skip silently.
    """
    if not owner_id:
        return None
    try:
        from lib.db import create_service_client

        result = create_service_client().auth.admin.get_user_by_id(owner_id)
        user = getattr(result, "user", None) or result
        email = (getattr(user, "email", None) or "").strip()
        if email and looks_like_email(email):
            return email
    except Exception:
        logger.exception("Failed to load email for owner %s", owner_id)
    return None


def format_payment_amount(amount: Any) -> str:
    """Alias for shared naira formatting (emails + notices)."""
    from lib.email_templates import format_naira

    return format_naira(amount)


LandlordNotifyStatus = Literal["sent", "skipped", "failed"]


@dataclass(frozen=True)
class LandlordNotifyResult:
    """Outcome of landlord money-in email; compares equal to status string for tests."""

    status: LandlordNotifyStatus
    detail: str | None = None

    def __eq__(self, other: object) -> bool:
        if isinstance(other, str):
            return self.status == other
        if isinstance(other, LandlordNotifyResult):
            return self.status == other.status and self.detail == other.detail
        return NotImplemented



def mailgun_configured() -> bool:
    """True when Mailgun API key, domain, and a From address are present."""
    key = (os.getenv("MAILGUN_API_KEY") or "").strip()
    domain = (os.getenv("MAILGUN_DOMAIN") or "").strip()
    from_addr = (
        os.getenv("MAILGUN_SENDER_EMAIL")
        or os.getenv("FROM_EMAIL")
        or os.getenv("SMTP_FROM")
        or ""
    ).strip()
    return bool(key and domain and from_addr)


def smtp_configured() -> bool:
    """True when SMTP_HOST and a From address are present."""
    host = (os.getenv("SMTP_HOST") or "").strip()
    from_addr = (os.getenv("SMTP_FROM") or os.getenv("SMTP_USERNAME") or "").strip()
    return bool(host and from_addr)


def email_transport_configured() -> bool:
    """True when either Mailgun or SMTP can send."""
    return mailgun_configured() or smtp_configured()


def _email_from_header() -> str:
    """Build From header: optional display name + address."""
    addr = (
        os.getenv("MAILGUN_SENDER_EMAIL")
        or os.getenv("FROM_EMAIL")
        or os.getenv("SMTP_FROM")
        or os.getenv("SMTP_USERNAME")
        or ""
    ).strip()
    name = (os.getenv("EMAIL_FROM_NAME") or "").strip() or BRAND_NAME
    if not addr:
        return name
    # Avoid injecting newlines into headers.
    name = name.replace("\r", "").replace("\n", "")
    addr = addr.replace("\r", "").replace("\n", "")
    return f"{name} <{addr}>"


def landlord_payment_notice_detail(status: LandlordNotifyStatus) -> str | None:
    """Short UI/error_detail for a landlord notice outcome (fallback if no richer detail)."""
    if status == "skipped":
        return "No email on landlord profile"
    if status == "failed":
        if not email_transport_configured():
            return "Email not configured (set MAILGUN_* or SMTP_HOST/SMTP_FROM)"
        return "Email send failed"
    return None


def notify_landlord_payment_received(
    owner_id: str | None,
    *,
    amount: Any,
    unit_label: str | None,
    property_name: str | None,
    tenant_name: str | None = None,
    unit_id: str | None = None,
) -> LandlordNotifyResult:
    """
    Email the landlord that a payment was received.

    Returns LandlordNotifyResult (status + detail). Compares equal to status
    strings ("sent" | "skipped" | "failed") for backward-compatible tests.

    Never raises — payment marking must not be blocked.
    """
    from lib.email_templates import landlord_money_in

    email = get_owner_email(owner_id)
    if not email:
        logger.info(
            "Landlord payment email skipped: no email on profile for owner %s",
            owner_id,
        )
        return LandlordNotifyResult("skipped", "No email on landlord profile")

    content = landlord_money_in(
        amount=amount,
        tenant_name=tenant_name,
        property_name=property_name,
        unit_label=unit_label,
        unit_id=unit_id,
    )

    try:
        send_email(
            email,
            content.text,
            subject=content.subject,
            html=content.html,
        )
        return LandlordNotifyResult("sent", None)
    except Exception as exc:
        logger.exception(
            "Landlord payment email failed for owner %s (%s)", owner_id, email
        )
        reason = str(exc).strip() or "Email send failed"
        if len(reason) > 180:
            reason = reason[:177] + "…"
        if not email_transport_configured():
            reason = "Email not configured (set MAILGUN_* or SMTP_HOST/SMTP_FROM)"
        return LandlordNotifyResult("failed", reason)


def looks_like_email(contact: str) -> bool:
    return "@" in (contact or "") and "." in (contact or "").split("@")[-1]


def normalize_e164(contact: str, default_cc: str = "234") -> str:
    """Normalize NG-friendly phone numbers to E.164 (+...)."""
    raw = (contact or "").strip()
    if not raw or looks_like_email(raw):
        return raw
    cleaned = raw.removeprefix("whatsapp:").strip()
    digits = re.sub(r"\D", "", cleaned)
    if not digits:
        return cleaned
    if cleaned.startswith("+"):
        return f"+{digits}"
    if digits.startswith("0") and len(digits) >= 10:
        return f"+{default_cc}{digits.lstrip('0')}"
    if digits.startswith(default_cc):
        return f"+{digits}"
    if len(digits) == 10:
        return f"+{default_cc}{digits}"
    return f"+{digits}"


def contact_matches_channel(channel: NotificationChannel, contact: str) -> bool:
    contact = (contact or "").strip()
    if not contact:
        return False
    if channel == "email":
        return looks_like_email(contact)
    return not looks_like_email(contact)


def send_whatsapp(contact: str, message: str):
    """Send a WhatsApp message via Twilio."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM")

    if not account_sid or not auth_token or not from_number:
        raise RuntimeError(
            "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM"
        )

    phone = normalize_e164(contact)
    to = phone if phone.startswith("whatsapp:") else f"whatsapp:{phone}"
    client = Client(account_sid, auth_token)
    return client.messages.create(from_=from_number, to=to, body=message)


def send_sms(contact: str, message: str):
    """Send an SMS via Twilio."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_SMS_FROM") or os.getenv("TWILIO_FROM")

    if not account_sid or not auth_token or not from_number:
        raise RuntimeError(
            "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_SMS_FROM"
        )

    to = normalize_e164(contact)
    client = Client(account_sid, auth_token)
    return client.messages.create(from_=from_number, to=to, body=message)


def _send_email_mailgun(
    to: str, message: str, *, subject: str, html: str | None = None
) -> None:
    """Send via Mailgun Messages API (HTTP)."""
    import httpx

    api_key = (os.getenv("MAILGUN_API_KEY") or "").strip()
    domain = (os.getenv("MAILGUN_DOMAIN") or "").strip()
    base = (os.getenv("MAILGUN_API_BASE_URL") or "https://api.mailgun.net").rstrip("/")
    if not api_key or not domain:
        raise RuntimeError("Missing MAILGUN_API_KEY or MAILGUN_DOMAIN")

    from_header = _email_from_header()
    url = f"{base}/v3/{domain}/messages"
    data: dict[str, Any] = {
        "from": from_header,
        "to": [to],
        "subject": subject,
        "text": message,
    }
    if html:
        data["html"] = html
    response = httpx.post(
        url,
        auth=("api", api_key),
        data=data,
        timeout=20.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Mailgun send failed ({response.status_code}): {response.text[:200]}"
        )


def _send_email_smtp(
    to: str, message: str, *, subject: str, html: str | None = None
) -> None:
    """Send via SMTP when SMTP_* env vars are configured."""
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT") or "587")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    from_header = _email_from_header()
    # Need a bare address for SMTP envelope; header may include display name.
    from_addr = (
        os.getenv("SMTP_FROM")
        or os.getenv("MAILGUN_SENDER_EMAIL")
        or os.getenv("FROM_EMAIL")
        or username
        or ""
    ).strip()

    if not host or not from_addr:
        raise RuntimeError("Missing SMTP_HOST or SMTP_FROM for email notifications")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_header if "<" in from_header else from_addr
    msg["To"] = to
    msg.set_content(message)
    if html:
        msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.starttls()
        if username and password:
            smtp.login(username, password)
        smtp.send_message(msg)


def send_email(
    contact: str,
    message: str,
    *,
    subject: str = f"{BRAND_NAME} notice",
    html: str | None = None,
):
    """
    Send email via Mailgun (preferred when configured) or SMTP.

    Mailgun: MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_SENDER_EMAIL / FROM_EMAIL
    SMTP: SMTP_HOST, SMTP_FROM (optional SMTP_USERNAME / SMTP_PASSWORD)
    """
    to = contact.removeprefix("mailto:").strip()
    if not looks_like_email(to):
        raise RuntimeError("Email channel requires a valid email contact")

    provider = (os.getenv("EMAIL_SERVICE_PROVIDER") or "").strip().lower()
    prefer_mailgun = provider == "mailgun" or mailgun_configured()

    if prefer_mailgun and mailgun_configured():
        _send_email_mailgun(to, message, subject=subject, html=html)
        return
    if smtp_configured():
        _send_email_smtp(to, message, subject=subject, html=html)
        return
    if mailgun_configured():
        _send_email_mailgun(to, message, subject=subject, html=html)
        return
    raise RuntimeError(
        "Email not configured (set MAILGUN_API_KEY/MAILGUN_DOMAIN/FROM or SMTP_HOST/SMTP_FROM)"
    )


def send_notification(
    channel: str | None,
    contact: str,
    message: str,
    *,
    email_subject: str = f"{BRAND_NAME} notice",
    email_html: str | None = None,
) -> NotificationChannel:
    """
    Send via the preferred channel (WhatsApp / SMS / email).
    Falls back to SMS when channel is unset or invalid.
    Returns the channel actually used.
    """
    resolved = resolve_channel(channel)
    contact = (contact or "").strip()
    if not contact:
        raise RuntimeError("contact is required")
    if not contact_matches_channel(resolved, contact):
        raise RuntimeError(
            f"Contact does not match {resolved} channel "
            "(use a phone for WhatsApp/SMS, or an email for Email)."
        )

    if resolved == "sms":
        send_sms(contact, message)
    elif resolved == "email":
        send_email(
            contact, message, subject=email_subject, html=email_html
        )
    else:
        send_whatsapp(contact, message)
    return resolved
