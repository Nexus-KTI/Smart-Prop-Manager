"""Transactional email (and shared plain-text) copy for Nexora events."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from lib.brand import BRAND_NAME
from lib.email_layout import email_brand_name, render_transactional_email


@dataclass(frozen=True)
class EmailContent:
    subject: str
    text: str
    html: str | None = None


def format_naira(amount: Any) -> str:
    """Single money format for notices (landlord + tenant).

    Non-breaking space (U+00A0) after ₦ keeps a clear gap and prevents a line
    break between the symbol and the amount.
    """
    gap = "\u00A0"
    try:
        return f"₦{gap}{float(amount):,.2f}"
    except (TypeError, ValueError):
        text = str(amount or "").strip()
        return text or f"₦{gap}0.00"


def frontend_base_url() -> str:
    import os

    return (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")


def unit_payments_url(unit_id: str | None) -> str | None:
    uid = (unit_id or "").strip()
    if not uid:
        return None
    return f"{frontend_base_url()}/payments/{uid}"


def _place(property_name: str | None, unit_label: str | None) -> str:
    prop = (property_name or "").strip() or "property"
    unit = (unit_label or "").strip() or "unit"
    return f"{prop} · {unit}"


def landlord_money_in(
    *,
    amount: Any,
    tenant_name: str | None,
    property_name: str | None,
    unit_label: str | None,
    unit_id: str | None = None,
) -> EmailContent:
    amount_str = format_naira(amount)
    tenant = (tenant_name or "").strip() or "tenant"
    place = _place(property_name, unit_label)
    headline = f"Money in: {amount_str} from {tenant} ({place})."
    view_url = unit_payments_url(unit_id)
    lines = [
        headline,
        "A payment was recorded for your records.",
    ]
    if view_url:
        lines.append(f"View payment: {view_url}")
    text = "\n\n".join(lines)

    body_text = (
        f"From {tenant}\n\n"
        f"For {place}\n\n"
        "A payment was recorded for your records."
    )
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Money in",
        heading=f"Payment from {tenant}",
        body_text=body_text,
        code=amount_str,
        cta_url=view_url,
        cta_label="View payment" if view_url else None,
        footer=f"You are receiving this because a payment was logged on your {BRAND_NAME} account.",
    )
    return EmailContent(subject=headline, text=text, html=html_body)


def tenant_receipt(
    *,
    amount: Any,
    property_name: str | None,
    unit_label: str | None,
    receipt_url: str,
    business_name: str | None = None,
) -> EmailContent:
    place = _place(property_name, unit_label)
    amount_str = format_naira(amount)
    issuer = (business_name or "").strip() or "your landlord"
    subject = f"Payment receipt — {place}"
    text = (
        f"Payment received from {issuer}.\n\n"
        f"Amount: {amount_str}\n"
        f"For: {place}\n\n"
        f"Receipt: {receipt_url}"
    )
    body_text = (
        f"Payment received from {issuer}.\n\n"
        f"For {place}\n\n"
        "Keep this receipt for your records."
    )
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Receipt",
        heading="Payment receipt",
        body_text=body_text,
        code=amount_str,
        cta_url=receipt_url,
        cta_label="Download receipt",
        footer=f"This receipt was sent by your landlord via {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def tenant_due(
    *,
    amount: Any,
    property_name: str | None,
    unit_label: str | None,
    business_name: str | None = None,
) -> EmailContent:
    place = _place(property_name, unit_label)
    amount_str = format_naira(amount)
    issuer = (business_name or "").strip() or "your landlord"
    subject = f"Rent reminder — {place}"
    text = (
        f"Reminder from {issuer}: rent of {amount_str} for {place} is due. "
        "Please pay at your earliest convenience."
    )
    body_text = (
        f"Reminder from {issuer}.\n\n"
        f"Rent for {place} is due.\n\n"
        "Please pay at your earliest convenience."
    )
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Rent reminder",
        heading="Rent is due",
        body_text=body_text,
        code=amount_str,
        footer=f"This reminder was sent by your landlord via {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def tenant_due_subject(property_name: str | None, unit_label: str | None) -> str:
    return f"Rent reminder — {_place(property_name, unit_label)}"


def landlord_renewal(
    *,
    property_name: str | None,
    unit_label: str | None,
    term_end: Any,
    days_left: int,
    tenant_name: str | None = None,
    unit_id: str | None = None,
) -> EmailContent:
    """Landlord notice that a unit term end / renewal is approaching."""
    place = _place(property_name, unit_label)
    tenant = (tenant_name or "").strip() or "your tenant"
    try:
        end_str = str(term_end)
        if hasattr(term_end, "strftime"):
            end_str = term_end.strftime("%d %b %Y")
    except Exception:
        end_str = str(term_end or "—")

    if days_left < 0:
        when = f"ended on {end_str}"
        heading = "Renewal overdue"
        eyebrow = "Renewal overdue"
    elif days_left == 0:
        when = f"ends today ({end_str})"
        heading = "Renewal due today"
        eyebrow = "Renewal due"
    else:
        when = f"ends in {days_left} day{'s' if days_left != 1 else ''} ({end_str})"
        heading = "Renewal coming up"
        eyebrow = "Renewal reminder"

    subject = f"Renewal — {place}"
    text = (
        f"Reminder: tenancy for {tenant} at {place} {when}. "
        f"Open the unit in {BRAND_NAME} to follow up."
    )
    body_text = (
        f"Tenancy for {tenant} at {place} {when}.\n\n"
        "Open the unit to record a renewal or chase the tenant."
    )
    payments = unit_payments_url(unit_id)
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow=eyebrow,
        heading=heading,
        body_text=body_text,
        code=end_str,
        cta_url=payments,
        cta_label="Open unit payments" if payments else None,
        footer=f"This reminder was sent by {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def otp_notice(
    *,
    heading: str,
    body_text: str,
    code: str,
    subject: str | None = None,
) -> EmailContent:
    """Generic OTP / verification email using the shared transactional template."""
    code_str = (code or "").strip()
    subj = (subject or "").strip() or heading
    text = f"{heading}\n\n{body_text}\n\nCode: {code_str}"
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Verification",
        heading=heading,
        body_text=body_text,
        code=code_str,
        footer="If you did not request this, you can ignore this email.",
    )
    return EmailContent(subject=subj, text=text, html=html_body)
