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
    details=[("Unit", "Palm Court · Flat 2")],  # optional key/value rows
    alert=None,              # optional alert strip
)
```

| Param | Role |
|-------|------|
| `heading` | Main title |
| `body_text` | Plain body; blank lines → paragraphs |
| `code` | Large scannable mono panel (OTP, amount, reference) |
| `eyebrow` | Small uppercase event label |
| `cta_url` / `cta_label` | Single primary button |
| `details` | Optional `(label, value)` rows (unit, role, from…) |
| `alert` | Optional alert strip (overdue / important) |
| `brand` / `footer` | Overrides |

Event helpers in [`lib/email_templates.py`](../lib/email_templates.py) all call this renderer. Money amounts use the **code** panel for scannability.

---

## Anatomy

One composition per message (560px card, fluid `max-width`):

1. **Brand** — wordmark or `EMAIL_LOGO_URL` image  
2. **Eyebrow** — optional event label  
3. **Heading** — `heading`  
4. **Code panel** — optional large mono `code`  
5. **Alert strip** — optional (alert tone)  
6. **Body** — `body_text` paragraphs  
7. **Details rows** — optional key/value table  
8. **One primary CTA** — omit when no URL  
9. **Footer** — muted transactional line  

**Responsive:** outer pad + card pad shrink under 620px via `@media`; width stays `100%` / `max-width:560px`. No flex/grid.

**Dark-mode-safe backgrounds:** solid `bgcolor` on body/tables matching light tokens; `color-scheme: light only` / `supported-color-schemes: light`; prefer-color-scheme media rules that keep canvas/card fills.

Rules:

- Outer width **560px**; card padding **24px**; radius **6px**
- Inline styles + tables (`role="presentation"`)
- Plain-text multipart always accompanies HTML

---

## Event → template

| Event | Eyebrow | Code / details | CTA |
|-------|---------|----------------|-----|
| `landlord_money_in` | Money in | Amount code | View payment |
| `tenant_receipt` | Receipt | Amount code | Download receipt |
| `tenant_due` | Rent reminder | Amount code | None (v1) |
| `landlord_renewal` | Renewal… | Date code + details; alert if overdue | Open unit payments |
| `otp_notice` | Verification | OTP code | None |
| `staff_invite` | Staff invite | Role / from details | Claim invite |
| `tenancy_invite` | Tenancy invite | Unit / from details | Claim invite |
| `artisan_invite` | Artisan invite | From details | Claim invite |
| `artisan_job_assigned` | Work order | Job / where details | Open jobs |
| `tenant_task_assigned` | To-do | Task / due details | Open tasks |
| `guest_admitted` | Gate | Code / where / admitter details | Open gate activity / my codes |
| `tenant_maintenance_submitted` | Maintenance | Request / from / where; alert if urgent | Open work orders |

---

## Do / don’t

**Do:** parameterize via `heading` / `body_text` / `code` / `details` / `alert`; escape dynamic text; set `EMAIL_LOGO_URL` only for a publicly hosted asset.  
**Don’t:** add MJML/React Email without a stack decision; invent new hex per event; nest cards; add a second primary button.

---

## Out of scope

- Newsletter / marketing multi-column layouts  
- Dark-mode brand redesign (force light)  
- Litmus/Email on Acid as a CI gate (manual QA only)  
- Per-event HTML forks outside `render_transactional_email`

---

## Live inbox QA (manual)

After Mailgun is configured, spot-check one of each recently wired event:

1. Staff invite → Claim invite CTA + role/from details  
2. Artisan job assigned → Open jobs + where details  
3. Tenant to-do assigned → Open tasks + due (if set)  

Confirm multipart plain + HTML, forest CTA (`#0f6e4f`), no broken images if `EMAIL_LOGO_URL` unset.

---

## Change control

Token or anatomy changes update **this file + `lib/email_layout.py` together**. New events call `render_transactional_email` — do not fork markup.
