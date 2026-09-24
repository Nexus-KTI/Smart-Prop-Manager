"""Table-based transactional email shell (Nexora email design system)."""

from __future__ import annotations

import html
import os
from typing import Any

from lib.brand import BRAND_NAME

# Fixed hex mirrors product light tokens (email clients ignore CSS variables).
EMAIL_TOKENS: dict[str, str] = {
    "canvas": "#f7f8f7",
    "card": "#ffffff",
    "border": "#e2e4e1",
    "ink": "#14171a",
    "muted": "#6b7280",
    "accent": "#0f6e4f",
    "accent_text": "#ffffff",
    "alert": "#b4402a",
    # Dark-mode-safe solid fills (also set as bgcolor= so clients don't go transparent).
    "code_bg": "#eef1ef",
    "code_border": "#d5dad6",
}

FONT_UI = (
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
)
FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
CONTENT_WIDTH = 560


def email_brand_name() -> str:
    return (os.getenv("EMAIL_FROM_NAME") or "").strip() or BRAND_NAME


def email_logo_url() -> str | None:
    """Optional hosted logo; wordmark text is used when unset."""
    url = (os.getenv("EMAIL_LOGO_URL") or "").strip()
    return url or None


def escape(value: Any) -> str:
    return html.escape(str(value or ""), quote=False)


def paragraphs_html(*parts: str) -> str:
    """Trusted body fragment: each part becomes one escaped paragraph."""
    blocks: list[str] = []
    for part in parts:
        text = (part or "").strip()
        if not text:
            continue
        blocks.append(
            f'<p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;'
            f'color:{EMAIL_TOKENS["ink"]};font-family:{FONT_UI};">'
            f"{escape(text)}</p>"
        )
    return "\n".join(blocks)


def body_text_to_html(body_text: str) -> str:
    """Split plain bodyText on blank lines into escaped paragraphs."""
    chunks = [c.strip() for c in (body_text or "").replace("\r\n", "\n").split("\n\n")]
    return paragraphs_html(*chunks)


def _brand_block(brand_text: str) -> str:
    t = EMAIL_TOKENS
    logo = email_logo_url()
    if logo:
        safe_src = html.escape(logo, quote=True)
        return f"""
          <tr>
            <td style="padding:0 0 20px 0;">
              <img src="{safe_src}" width="140" alt="{brand_text}"
                   style="display:block;border:0;outline:none;text-decoration:none;max-width:140px;height:auto;">
            </td>
          </tr>"""
    return f"""
          <tr>
            <td style="padding:0 0 20px 0;font-family:{FONT_UI};font-size:16px;font-weight:600;color:{t["accent"]};">
              {brand_text}
            </td>
          </tr>"""


def _code_block(code_text: str) -> str:
    """Large scannable mono code / amount panel."""
    t = EMAIL_TOKENS
    return f"""
          <tr>
            <td style="padding:4px 0 20px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     bgcolor="{t["code_bg"]}"
                     style="background-color:{t["code_bg"]};border:1px solid {t["code_border"]};border-radius:6px;">
                <tr>
                  <td align="center"
                      bgcolor="{t["code_bg"]}"
                      style="padding:20px 16px;font-family:{FONT_MONO};font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.12em;color:{t["ink"]};background-color:{t["code_bg"]};">
                    {code_text}
                  </td>
                </tr>
              </table>
            </td>
          </tr>"""


def details_rows_html(rows: list[tuple[str, str]]) -> str:
    """Key/value detail table for unit · tenant · role · etc. Empty → ''."""
    t = EMAIL_TOKENS
    cleaned: list[tuple[str, str]] = []
    for label, value in rows or []:
        lab = (label or "").strip()
        val = (value or "").strip()
        if not lab or not val:
            continue
        cleaned.append((lab, val))
    if not cleaned:
        return ""
    cells: list[str] = []
    for i, (lab, val) in enumerate(cleaned):
        pad = "0 0 10px 0" if i < len(cleaned) - 1 else "0"
        cells.append(
            f"""
                <tr>
                  <td style="padding:{pad};font-family:{FONT_UI};font-size:12px;line-height:1.4;letter-spacing:0.03em;text-transform:uppercase;color:{t["muted"]};width:36%;vertical-align:top;">
                    {escape(lab)}
                  </td>
                  <td style="padding:{pad};font-family:{FONT_UI};font-size:15px;line-height:1.4;color:{t["ink"]};vertical-align:top;">
                    {escape(val)}
                  </td>
                </tr>"""
        )
    return f"""
          <tr>
            <td style="padding:4px 0 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border:1px solid {t["border"]};border-radius:6px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      {"".join(cells)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>"""


def alert_strip_html(message: str) -> str:
    """Muted alert banner (overdue / important). Empty message → ''."""
    t = EMAIL_TOKENS
    text = (message or "").strip()
    if not text:
        return ""
    return f"""
          <tr>
            <td style="padding:0 0 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     bgcolor="#faf3f1"
                     style="background-color:#faf3f1;border:1px solid #ead5cf;border-radius:6px;">
                <tr>
                  <td style="padding:12px 14px;font-family:{FONT_UI};font-size:14px;line-height:1.45;color:{t["alert"]};">
                    {escape(text)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>"""


def render_transactional_email(
    *,
    heading: str,
    body_text: str,
    code: str | None = None,
    eyebrow: str | None = None,
    cta_url: str | None = None,
    cta_label: str | None = None,
    footer: str | None = None,
    brand: str | None = None,
    details: list[tuple[str, str]] | None = None,
    alert: str | None = None,
) -> str:
    """
    Reusable branded transactional HTML email.

    Parameters:
      heading   — main title
      body_text — plain body (paragraphs separated by blank lines)
      code      — optional large scannable value (OTP, amount, reference)
      details   — optional (label, value) rows under the body
      alert     — optional alert strip above the body
    """
    t = EMAIL_TOKENS
    brand_text = escape((brand or "").strip() or email_brand_name())
    heading_text = escape((heading or "").strip())
    eyebrow_text = escape((eyebrow or "").strip()) if eyebrow else ""
    code_text = escape((code or "").strip()) if code else ""
    footer_text = escape(
        (footer or "").strip()
        or f"This is a transactional notice from {BRAND_NAME}."
    )
    cta_href = (cta_url or "").strip()
    cta_text = escape((cta_label or "").strip()) if cta_label else ""
    body_html = body_text_to_html(body_text)
    alert_block = alert_strip_html(alert or "")
    details_block = details_rows_html(list(details or []))

    eyebrow_block = ""
    if eyebrow_text:
        eyebrow_block = f"""
          <tr>
            <td style="padding:0 0 8px 0;font-family:{FONT_UI};font-size:12px;line-height:1.4;letter-spacing:0.04em;text-transform:uppercase;color:{t["muted"]};">
              {eyebrow_text}
            </td>
          </tr>"""

    heading_block = ""
    if heading_text:
        heading_block = f"""
          <tr>
            <td style="padding:0 0 12px 0;font-family:{FONT_UI};font-size:22px;line-height:1.3;font-weight:600;color:{t["ink"]};">
              {heading_text}
            </td>
          </tr>"""

    code_block = _code_block(code_text) if code_text else ""

    cta_block = ""
    if cta_href and cta_text:
        safe_href = html.escape(cta_href, quote=True)
        cta_block = f"""
          <tr>
            <td style="padding:8px 0 4px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="{t["accent"]}" style="border-radius:6px;background-color:{t["accent"]};">
                    <a href="{safe_href}"
                       style="display:inline-block;padding:12px 18px;font-family:{FONT_UI};font-size:14px;font-weight:600;line-height:1;color:{t["accent_text"]};text-decoration:none;border-radius:6px;">
                      {cta_text}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>{brand_text}</title>
<style type="text/css">
  :root {{ color-scheme: light only; supported-color-schemes: light; }}
  body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
  table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }}
  img {{ border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }}
  @media only screen and (max-width: 620px) {{
    .email-pad {{ padding: 20px 12px !important; }}
    .email-card-pad {{ padding: 20px 16px !important; }}
  }}
  @media (prefers-color-scheme: dark) {{
    body, .email-canvas {{ background-color: {t["canvas"]} !important; }}
    .email-card {{ background-color: {t["card"]} !important; }}
    .email-ink {{ color: {t["ink"]} !important; }}
  }}
</style>
<!--[if mso]>
<style type="text/css">
  body, table, td {{ font-family: Arial, Helvetica, sans-serif !important; }}
</style>
<![endif]-->
</head>
<body class="email-canvas" bgcolor="{t["canvas"]}" style="margin:0;padding:0;background-color:{t["canvas"]};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    {heading_text}
  </div>
  <table role="presentation" class="email-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{t["canvas"]}" style="background-color:{t["canvas"]};">
    <tr>
      <td align="center" class="email-pad" bgcolor="{t["canvas"]}" style="padding:32px 16px;background-color:{t["canvas"]};">
        <table role="presentation" class="email-card" width="{CONTENT_WIDTH}" cellpadding="0" cellspacing="0" border="0" bgcolor="{t["card"]}" style="width:100%;max-width:{CONTENT_WIDTH}px;background-color:{t["card"]};border:1px solid {t["border"]};border-radius:6px;">
          <tr>
            <td class="email-card-pad" bgcolor="{t["card"]}" style="padding:24px;background-color:{t["card"]};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                {_brand_block(brand_text)}
                {eyebrow_block}
                {heading_block}
                {code_block}
                {alert_block}
                <tr>
                  <td class="email-ink" style="padding:0 0 4px 0;font-family:{FONT_UI};color:{t["ink"]};">
                    {body_html}
                  </td>
                </tr>
                {details_block}
                {cta_block}
                <tr>
                  <td style="padding:24px 0 0 0;border-top:1px solid {t["border"]};font-family:{FONT_UI};font-size:12px;line-height:1.45;color:{t["muted"]};">
                    {footer_text}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def render_email_shell(
    *,
    brand: str | None = None,
    eyebrow: str | None = None,
    title: str | None = None,
    body_html: str,
    amount: str | None = None,
    cta_url: str | None = None,
    cta_label: str | None = None,
    footer: str | None = None,
) -> str:
    """
    Back-compat wrapper around render_transactional_email.

    Prefer render_transactional_email(heading=, body_text=, code=) for new callers.
    `body_html` is converted by stripping tags lightly via plain extraction of <p> text
    when possible; callers that only have HTML paragraphs should migrate to body_text.
    """
    # Extract paragraph text from our own paragraphs_html output, or treat as single blob.
    import re

    parts = re.findall(r"<p[^>]*>(.*?)</p>", body_html or "", flags=re.I | re.S)
    if parts:
        # Unescape entities for body_text (render will escape again).
        plain_parts = [html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in parts]
        body_text = "\n\n".join(p for p in plain_parts if p)
    else:
        body_text = html.unescape(re.sub(r"<[^>]+>", "", body_html or "")).strip()

    return render_transactional_email(
        brand=brand,
        eyebrow=eyebrow,
        heading=title or "",
        body_text=body_text,
        code=amount,
        cta_url=cta_url,
        cta_label=cta_label,
        footer=footer,
    )
