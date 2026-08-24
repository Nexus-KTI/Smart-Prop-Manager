# Smart Prop — Transactional email design system

**Role:** Extend the product design language into email-safe HTML  
**Related:** [`design-system.md`](design-system.md) · [`lib/email_layout.py`](../lib/email_layout.py) · [`lib/email_templates.py`](../lib/email_templates.py)

**Tooling:** No MJML / React Email in this repo. All mail HTML is built in Python via `render_transactional_email` (table layout + inline CSS) and sent through Mailgun/SMTP in [`lib/notify.py`](../lib/notify.py).

Email clients ignore CSS variables and most web fonts. Tokens below are **fixed hex** that mirror product light theme.

---

## Personality

Calm landlord-ops trust. Forest accent for money actions. Quiet canvas; amount/code is the loud signal (mono). No purple, glow, badge stickers, or marketing hero imagery.

---

## Tokens

| Role | Hex | Product mirror |
|------|-----|----------------|
| Canvas | `#f7f8f7` | `--background` |
| Card | `#ffffff` | `--surface` |
| Border | `#e2e4e1` | `--border` |
| Ink | `#14171a` | `--ink` |
| Muted | `#6b7280` | `--muted` |
| Accent | `#0f6e4f` | `--accent` |
| Accent text | `#ffffff` | On CTA |
| Code panel | `#eef1ef` / border `#d5dad6` | `--background-alt` family |
| Alert | `#b4402a` | `--alert` (reserved) |

**Type stacks (web-safe):**

- UI: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
- Code / money: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

Brand mark: wordmark text (`EMAIL_FROM_NAME` or “Smart Prop”). Optional image via `EMAIL_LOGO_URL`.

---

## Reusable API

```python
from lib.email_layout import render_transactional_email

html = render_transactional_email(
    heading="Confirm your login",
    body_text="Use this code to finish signing in.\n\nIt expires in 10 minutes.",
    code="482913",
    eyebrow="Verification",  # optional
    cta_url=None,            # optional
    cta_label=None,
)
```

| Param | Role |
|-------|------|
| `heading` | Main title |
| `body_text` | Plain body; blank lines → paragraphs |
| `code` | Large scannable mono panel (OTP, amount, reference) |
| `eyebrow` | Small uppercase event label |
| `cta_url` / `cta_label` | Single primary button |
| `brand` / `footer` | Overrides |

Event helpers in [`lib/email_templates.py`](../lib/email_templates.py) (`landlord_money_in`, `tenant_receipt`, `tenant_due`, `otp_notice`) all call this renderer. Money amounts use the **code** panel for scannability.

---

## Anatomy

One composition per message (560px card):

1. **Brand** — wordmark or `EMAIL_LOGO_URL` image  
2. **Eyebrow** — optional event label  
3. **Heading** — `heading`  
4. **Code panel** — optional large mono `code`  
5. **Body** — `body_text` paragraphs  
6. **One primary CTA** — omit when no URL  
7. **Footer** — muted transactional line  

**Dark-mode-safe backgrounds:** solid `bgcolor` on body/tables matching light tokens; `color-scheme: light only` / `supported-color-schemes: light`; prefer-color-scheme media rules that keep canvas/card fills.

Rules:

- Outer width **560px**; card padding **24px**; radius **6px**
- Inline styles + tables (`role="presentation"`)
- Plain-text multipart always accompanies HTML

---

## Event → template

| Event | Eyebrow | Code panel | CTA |
|-------|---------|------------|-----|
| `landlord_money_in` | Money in | Amount | View payment |
| `tenant_receipt` | Receipt | Amount | Download receipt |
| `tenant_due` | Rent reminder | Amount | None (v1) |
| `otp_notice` | Verification | OTP code | None |

---

## Do / don’t

**Do:** parameterize via `heading` / `body_text` / `code`; escape dynamic text; set `EMAIL_LOGO_URL` only for a publicly hosted asset.  
**Don’t:** add MJML/React Email without a stack decision; invent new hex per event; nest cards.

---

## Change control

Token or anatomy changes update **this file + `lib/email_layout.py` together**. New events call `render_transactional_email` — do not fork markup.
