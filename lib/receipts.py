"""Plain ledger-style PDF receipts for rent and other unit charges."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from lib.brand import BRAND_NAME

_HAIRLINE = 0.4
_INK = colors.black
_FONT = "Courier"
RECEIPTS_BUCKET = "receipts"

_CHARGE_TITLES = {
    "rent": "RENT RECEIPT",
    "service_charge": "SERVICE CHARGE RECEIPT",
    "other": "PAYMENT RECEIPT",
}


def _charge_title(transaction: dict) -> str:
    charge_type = (transaction.get("charge_type") or "rent").strip().lower()
    if charge_type == "other":
        label = (transaction.get("charge_label") or "").strip()
        if label:
            return f"{label.upper()} RECEIPT"
    return _CHARGE_TITLES.get(charge_type, "PAYMENT RECEIPT")


def _charge_field_label(transaction: dict) -> str:
    charge_type = (transaction.get("charge_type") or "rent").strip().lower()
    if charge_type == "service_charge":
        return "Service charge"
    if charge_type == "other":
        return (transaction.get("charge_label") or "").strip() or "Other charge"
    return "Rent"


def _register_mono_font() -> str:
    """Prefer a system monospace TTF; fall back to built-in Courier."""
    candidates = (
        ("ReceiptMono", r"C:\Windows\Fonts\consola.ttf"),
        ("ReceiptMono", r"C:\Windows\Fonts\cour.ttf"),
        ("ReceiptMono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
        ("ReceiptMono", "/System/Library/Fonts/Menlo.ttc"),
    )
    for name, path in candidates:
        try:
            pdfmetrics.registerFont(TTFont(name, path))
            return name
        except Exception:
            continue
    return "Courier"


def _text(value: Any, fallback: str = "-") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def _receipt_number(transaction_id: Any) -> str:
    raw = _text(transaction_id, "00000000").replace("-", "")
    return raw[:8].upper()


def _format_naira(amount: Any) -> str:
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return "NGN 0.00"
    # Ledger style: NGN with thousands separators
    return f"NGN {value:,.2f}"


def _format_date(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, datetime):
        return value.strftime("%d %b %Y %H:%M")
    text = str(value).strip()
    if not text:
        return "-"
    try:
        # Handle trailing Z
        normalized = text.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        return dt.strftime("%d %b %Y %H:%M")
    except ValueError:
        return text


def generate_receipt(transaction: dict) -> bytes:
    """
    Build a plain PDF receipt from a transaction dict.

    Expected keys (extras ignored):
      id, tenant_name, unit_label, property_name, amount,
      paid_at | payment_date | created_at, method
    """
    font = _register_mono_font()

    receipt_no = _receipt_number(transaction.get("id"))
    business_name = _text(
        transaction.get("business_name") or transaction.get("agency_name"),
        "",
    )
    tenant = _text(transaction.get("tenant_name") or transaction.get("tenant"))
    unit = _text(transaction.get("unit_label") or transaction.get("unit"))
    property_name = _text(
        transaction.get("property_name") or transaction.get("property")
    )
    amount = _format_naira(transaction.get("amount"))
    paid_at = _format_date(
        transaction.get("paid_at")
        or transaction.get("payment_date")
        or transaction.get("created_at")
    )
    method = _text(transaction.get("method")).upper()
    payment_ref = _text(
        transaction.get("payment_reference") or transaction.get("reference"),
        "",
    )

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Receipt {receipt_no}",
    )

    title_style = ParagraphStyle(
        "ReceiptTitle",
        fontName=font,
        fontSize=11,
        leading=14,
        textColor=_INK,
        spaceAfter=2 * mm,
    )
    meta_style = ParagraphStyle(
        "ReceiptMeta",
        fontName=font,
        fontSize=9,
        leading=12,
        textColor=_INK,
    )
    cell_style = ParagraphStyle(
        "ReceiptCell",
        fontName=font,
        fontSize=9,
        leading=12,
        textColor=_INK,
    )

    rows = [
        [Paragraph("FIELD", cell_style), Paragraph("DETAIL", cell_style)],
        [Paragraph("Receipt no.", cell_style), Paragraph(receipt_no, cell_style)],
    ]
    if business_name:
        rows.append(
            [
                Paragraph("Issued by", cell_style),
                Paragraph(business_name, cell_style),
            ]
        )
    rows.extend(
        [
            [Paragraph("Tenant", cell_style), Paragraph(tenant, cell_style)],
            [Paragraph("Unit", cell_style), Paragraph(unit, cell_style)],
            [Paragraph("Property", cell_style), Paragraph(property_name, cell_style)],
            [
                Paragraph("Charge", cell_style),
                Paragraph(_charge_field_label(transaction), cell_style),
            ],
            [Paragraph("Amount", cell_style), Paragraph(amount, cell_style)],
            [Paragraph("Payment date", cell_style), Paragraph(paid_at, cell_style)],
            [Paragraph("Method", cell_style), Paragraph(method, cell_style)],
        ]
    )
    if payment_ref:
        rows.append(
            [
                Paragraph("Reference", cell_style),
                Paragraph(payment_ref, cell_style),
            ]
        )

    table = Table(rows, colWidths=[40 * mm, 130 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (-1, -1), _INK),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("BOX", (0, 0), (-1, -1), _HAIRLINE, _INK),
                ("INNERGRID", (0, 0), (-1, -1), _HAIRLINE, _INK),
                ("LINEBELOW", (0, 0), (-1, 0), _HAIRLINE, _INK),
            ]
        )
    )

    issuer = business_name or BRAND_NAME
    story = [
        Paragraph(_charge_title(transaction), title_style),
        Paragraph(issuer, meta_style),
        Paragraph(f"Receipt {receipt_no}", meta_style),
        Spacer(1, 6 * mm),
        table,
        Spacer(1, 8 * mm),
        Paragraph(
            f"Generated by {BRAND_NAME} for {issuer}. Keep for your records.",
            meta_style,
        ),
    ]

    doc.build(story)
    return buffer.getvalue()


def _ensure_receipts_bucket(client) -> None:
    """Create the public receipts bucket if missing; keep it public if it exists."""
    try:
        client.storage.get_bucket(RECEIPTS_BUCKET)
        try:
            client.storage.update_bucket(RECEIPTS_BUCKET, options={"public": True})
        except TypeError:
            client.storage.update_bucket(RECEIPTS_BUCKET, {"public": True})
    except Exception:
        try:
            client.storage.create_bucket(RECEIPTS_BUCKET, options={"public": True})
        except TypeError:
            client.storage.create_bucket(RECEIPTS_BUCKET, public=True)


def upload_receipt(transaction_id: str, pdf_bytes: bytes) -> str:
    """
    Upload a receipt PDF to the public Supabase Storage bucket ``receipts``
    as ``{transaction_id}.pdf``, store the public URL on ``transactions.receipt_url``,
    and return that URL.
    """
    txn_id = (transaction_id or "").strip()
    if not txn_id:
        raise ValueError("transaction_id is required")
    if not pdf_bytes:
        raise ValueError("pdf_bytes is required")

    from lib.db import create_service_client

    client = create_service_client()
    _ensure_receipts_bucket(client)

    path = f"{txn_id}.pdf"
    storage = client.storage.from_(RECEIPTS_BUCKET)
    storage.upload(
        path=path,
        file=pdf_bytes,
        file_options={
            "content-type": "application/pdf",
            "upsert": "true",
        },
    )

    public_url = storage.get_public_url(path)
    if isinstance(public_url, dict):
        public_url = (
            public_url.get("publicUrl")
            or public_url.get("publicURL")
            or public_url.get("signedURL")
            or ""
        )
    public_url = str(public_url).strip().rstrip("?")
    if not public_url:
        raise RuntimeError("Upload succeeded but no public URL was returned")

    client.table("transactions").update({"receipt_url": public_url}).eq(
        "id", txn_id
    ).execute()

    return public_url
