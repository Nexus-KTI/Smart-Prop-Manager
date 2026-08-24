# Upgrade prompts

**Sources:** [`PRD.md`](PRD.md) Now roadmap · [`product-audit.md`](product-audit.md) · [`gap-analysis.md`](gap-analysis.md)  
**How to use:** Paste **one** prompt at a time into Cursor Agent. Prefer playbook STEP 6 wrapper in [`product-prompt-playbook.md`](product-prompt-playbook.md).  
**Layout chrome:** use [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md), not this file.

---

## Now — completed (2026-08-05 QA)

Desktop browser evidence in [`web/scripts/qa-now-screenshots/`](../web/scripts/qa-now-screenshots/) · summary in [`product-audit.md`](product-audit.md).

| ID | Prompt | Result |
|----|--------|--------|
| N1 | Unit payments page reliability | **done** |
| N2 | Manual payment form reset after success | **done** |
| N3 | Reminder failure recovery (detail + Retry) | **done** |
| N4 | Payment CTA hierarchy (manual first) | **done** |
| N5 | Settings profile loading + single theme/Account | **done** |
| N6 | Skip → unit-less property visibility | **done** |
| N7 | Receipt control wording | **done** |
| N8 | OTP + notify channel copy sweep | **done** |
| N9 | Address autocomplete edge states | **done** |

---

## Now — completed (mobile)

| ID | Prompt | Result |
|----|--------|--------|
| M1 | Mobile 390 regression (payments + reminders) | **done** (2026-08-05) — evidence [`docs/qa-mobile-390/`](qa-mobile-390/) |

Fixes landed with M1: phone icon-rail sidebar (≤640px), page `overflow-x: clip`, table scroll contained in `.data-table-wrap`, larger `.btn-table-cta` tap targets on phones.

---

## Now — completed (keyboard)

| ID | Prompt | Result |
|----|--------|--------|
| M2 | Keyboard / focus pass (auth + money paths) | **done** (2026-08-06) — evidence [`docs/qa-keyboard-m2/`](qa-keyboard-m2/) |

Fixes landed with M2: accent `focus-visible` rings on auth tabs, settings tabs, form inputs, table links, user menu, theme segment, admin select, sidebar collapse.

---

## Now — completed (money-in feed)

| ID | Prompt | Result |
|----|--------|--------|
| F1 | Portfolio money-in feed | **done** (2026-08-06) — `GET /payments/` + `/payments` table (paid only; unit link; receipt) |

## Now — completed (mobile + money-in)

| ID | Prompt | Result |
|----|--------|--------|
| M3 | 390 QA after money-in feed | **done** (2026-08-06) — properties, `/payments` feed, unit payments, reminders; [`qa-mobile-390/`](qa-mobile-390/) |

## Now — completed (landlord email / SMTP)

| ID | Prompt | Result |
|----|--------|--------|
| E1 | Landlord money-in email SMTP spot-check | **done** (2026-08-06) — wiring **pass**; then Mailgun transport added for existing `MAILGUN_*` `.env` (preferred over empty `SMTP_*`). Copy “Money in: …”; failed detail when neither transport set. Tests: `tests/test_landlord_payment_email.py` |

## Now — completed (transactional email)

| ID | Prompt | Result |
|----|--------|--------|
| T1 | Email templates + landlord money-in View payment | **done** — `lib/email_templates.py`; HTML + `{FRONTEND_URL}/payments/{unitId}` |
| T2 | Tenant receipt + due via templates | **done** — payments/reminders/cron use shared subjects/bodies |
| T3 | Deploy Mailgun + Settings copy | **done** — `render.yaml` Mailgun env (api+cron); Settings no longer says SMTP |
| T4 | Tests | **done** — `tests/test_email_templates.py` + updated landlord email tests |
| T5 | Email design system + professional HTML shell | **done** — [`email-design-system.md`](email-design-system.md); `lib/email_layout.py` table shell; three events use brand/eyebrow/amount/CTA |
| T6 | Parameterized transactional template | **done** — `render_transactional_email(heading, body_text, code)`; dark-mode-safe bgcolors; large code panel; optional `EMAIL_LOGO_URL` |

**Live checklist:** money-in → landlord inbox; channel=email due send → tenant inbox; confirm `reminders` `sent`.

---

## Now — completed (focus procedure 2026-08-09)

| ID | Focus | Result |
|----|-------|--------|
| O1 | Live notify proof | **done** — Mailgun money-in / due / receipt **sent**; Twilio SMS **failed** (trial unverified NG number). See [`ops-checklist.md`](ops-checklist.md) |
| O2 | Production ops checklist | **done** — [`ops-checklist.md`](ops-checklist.md) (env, webhook, cron, SQL, smoke) |
| O3 | Invite → signup conversion | **done** — invite welcome banner; phone prefill from `whatsapp=`; clearer invite-only gate copy |
| O4 | Contact ↔ channel honesty | **done** — Settings hint; unit/onboarding contact hints; Edit unit validates match |
| O5 | Layout 1.1 shell inset | **verified** — dashboard pages use `.shell-content` / `.dashboard` / `.form-page` without nested horizontal page pads |

---

## Now (open) — implement next

_No open Now prompts._ Continue layout prompts from [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md) **one at a time** (next: 1.2), or prod Twilio upgrade for SMS.

---

## Next (after Now green)

- Upgrade Twilio off trial / verify recipient numbers for live SMS.  
- If public pricing launches: one price story on marketing + checkout only.

---

## Phase 2, deferred

- Document upload/storage per unit (tenancy agreements, ID copies), reuse the existing Supabase Storage pattern from receipts. Build when a real user requests it.
- Notification event × channel matrix — only if users ask.  
- Tenancy entity, fees, room inventory, tenant login — no validated need ([`gap-analysis.md`](gap-analysis.md)).

---

## Skip (out of v1)

- Hard paywall before first property.  
- In-app tenant messaging.  
- Rentora blue / Noto / Nunito restyle.  
- Greenfield NestJS / consulting-platform rewrite ([`architecture.md`](architecture.md) Do not rebuild).
