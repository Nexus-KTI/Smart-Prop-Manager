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
    subject = f"Payment receipt: {place}"
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
    subject = f"Rent reminder: {place}"
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
    return f"Rent reminder: {_place(property_name, unit_label)}"


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
        end_str = str(term_end or "-")

    if days_left < 0:
        when = f"ended on {end_str}"
        heading = "Renewal overdue"
        eyebrow = "Renewal overdue"
        alert = "This tenancy term has already ended. Follow up or record a renewal."
    elif days_left == 0:
        when = f"ends today ({end_str})"
        heading = "Renewal due today"
        eyebrow = "Renewal due"
        alert = "Term ends today."
    else:
        when = f"ends in {days_left} day{'s' if days_left != 1 else ''} ({end_str})"
        heading = "Renewal coming up"
        eyebrow = "Renewal reminder"
        alert = None

    subject = f"Renewal: {place}"
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
        alert=alert,
        details=[("Tenant", tenant), ("Unit", place)],
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


def staff_invite(
    *,
    role: str,
    claim_url: str,
    inviter_label: str | None = None,
) -> EmailContent:
    role_clean = (role or "").strip() or "staff"
    who = (inviter_label or "").strip() or "your landlord"
    subject = f"Staff invite: {role_clean}"
    text = (
        f"You've been invited as {role_clean} on {BRAND_NAME} by {who}.\n\n"
        f"Sign in, then open: {claim_url}"
    )
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Staff invite",
        heading=f"You're invited as {role_clean}",
        body_text=(
            f"{who} invited you to help manage properties on {BRAND_NAME}.\n\n"
            "Sign in with this phone or email, then open the claim link."
        ),
        details=[("Role", role_clean), ("From", who)],
        cta_url=claim_url,
        cta_label="Claim invite",
        footer=f"This invite was sent via {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def tenancy_invite(
    *,
    claim_url: str,
    property_name: str | None = None,
    unit_label: str | None = None,
    landlord_label: str | None = None,
) -> EmailContent:
    place = _place(property_name, unit_label)
    who = (landlord_label or "").strip() or "your landlord"
    subject = f"Tenancy invite: {place}"
    text = (
        f"You're invited to view rent and pay on {BRAND_NAME} for {place}.\n\n"
        f"From {who}. Open: {claim_url}"
    )
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Tenancy invite",
        heading="You're invited to your unit",
        body_text=(
            f"{who} invited you to view rent, receipts, and pay on {BRAND_NAME}.\n\n"
            "Open the link, then sign in with this phone or email."
        ),
        details=[("Unit", place), ("From", who)],
        cta_url=claim_url,
        cta_label="Claim invite",
        footer=f"This invite was sent by your landlord via {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def artisan_invite(*, claim_url: str, landlord_label: str | None = None) -> EmailContent:
    who = (landlord_label or "").strip() or "a landlord"
    subject = f"Artisan invite — {BRAND_NAME}"
    text = (
        f"You've been invited as an artisan on {BRAND_NAME} by {who}.\n\n"
        f"Claim your jobs link: {claim_url}"
    )
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Artisan invite",
        heading="You're invited to take jobs",
        body_text=(
            f"{who} invited you to receive repair jobs on {BRAND_NAME}.\n\n"
            "Open the claim link to connect your account."
        ),
        details=[("From", who)],
        cta_url=claim_url,
        cta_label="Claim invite",
        footer=f"This invite was sent via {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def tenant_task_assigned(
    *,
    title: str,
    tasks_url: str,
    due_on: str | None = None,
) -> EmailContent:
    job = (title or "").strip() or "To-do"
    due = (due_on or "").strip() or None
    subject = f"New to-do: {job[:80]}"
    due_bit = f" Due {due}." if due else ""
    text = (
        f"Your landlord assigned a to-do on {BRAND_NAME}: {job[:120]}.{due_bit}\n\n"
        f"Open: {tasks_url}"
    )
    details: list[tuple[str, str]] = [("Task", job[:120])]
    if due:
        details.append(("Due", due))
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="To-do",
        heading="New to-do from your landlord",
        body_text="Open your tasks list to mark it done when finished.",
        details=details,
        cta_url=tasks_url,
        cta_label="Open tasks",
        footer=f"This notice was sent by your landlord via {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def guest_admitted(
    *,
    audience: str,
    code: str,
    place: str,
    admitter_label: str,
    access_url: str,
    issuer_label: str | None = None,
    subject_label: str | None = None,
    when_label: str | None = None,
) -> EmailContent:
    """Notify landlord or issuing tenant that a guest code was admitted."""
    gate_code = (code or "").strip() or "—"
    where = (place or "").strip() or "your property"
    by = (admitter_label or "").strip() or "gate staff"
    guest = (subject_label or "").strip() or None
    issuer = (issuer_label or "").strip() or None
    when = (when_label or "").strip() or None

    if audience == "issuer":
        subject = f"Your guest was admitted: {where}"
        heading = "Your guest was admitted"
        body = (
            f"Gate staff admitted a guest using your code at {where}.\n\n"
            "Open your access page if you need to revoke remaining uses."
        )
        cta = "Open my codes"
        footer = f"You issued this code on {BRAND_NAME}."
    else:
        subject = f"Guest admitted: {where}"
        heading = "Guest admitted at the gate"
        body = (
            f"A guest code was admitted at {where}.\n\n"
            "Open gate activity if you need the custody trail."
        )
        cta = "Open gate activity"
        footer = f"This notice was sent via {BRAND_NAME}."

    details: list[tuple[str, str]] = [
        ("Code", gate_code),
        ("Where", where),
        ("Admitted by", by),
    ]
    if guest:
        details.append(("Guest", guest[:120]))
    if issuer and audience != "issuer":
        details.append(("Issued by", issuer[:120]))
    if when:
        details.append(("When", when[:40]))

    text_lines = [
        f"{heading} — {where}.",
        f"Code: {gate_code}. Admitted by {by}.",
    ]
    if guest:
        text_lines.append(f"Guest: {guest}.")
    if issuer and audience != "issuer":
        text_lines.append(f"Issued by: {issuer}.")
    text_lines.append(f"Open: {access_url}")
    text = "\n".join(text_lines)

    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Gate",
        heading=heading,
        body_text=body,
        details=details,
        cta_url=access_url,
        cta_label=cta,
        footer=footer,
    )
    return EmailContent(subject=subject, text=text, html=html_body)


def artisan_job_assigned(
    *,
    title: str,
    jobs_url: str,
    property_name: str | None = None,
    unit_label: str | None = None,
) -> EmailContent:
    job = (title or "").strip() or "Repair job"
    place = None
    if (property_name or "").strip() or (unit_label or "").strip():
        place = _place(property_name, unit_label)
    subject = f"New job: {job[:80]}"
    text_lines = [f"New {BRAND_NAME} job assigned: {job}."]
    if place:
        text_lines.append(f"Where: {place}")
    text_lines.append(f"Open your jobs: {jobs_url}")
    text = "\n\n".join(text_lines)
    details: list[tuple[str, str]] = [("Job", job[:120])]
    if place:
        details.append(("Where", place))
    html_body = render_transactional_email(
        brand=email_brand_name(),
        eyebrow="Work order",
        heading="New job assigned",
        body_text="Open your jobs list to accept the window and start work.",
        details=details,
        cta_url=jobs_url,
        cta_label="Open jobs",
        footer=f"This notice was sent via {BRAND_NAME}.",
    )
    return EmailContent(subject=subject, text=text, html=html_body)
