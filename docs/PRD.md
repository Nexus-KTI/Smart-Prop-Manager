# Smart Prop — Product Requirements Document (v1)

**Role:** Product strategist  
**Compiled:** 2026-08-04  
**Inputs:** [`research.md`](research.md) · [`gap-analysis.md`](gap-analysis.md) · authenticated audits  
**Status:** Living PRD for the current product (Phase 1). Do not reopen deferred/skip items without new evidence.  
**Master vision (Estate OS / Nexora by KTI):** [`PRD-nexora-estate-os.md`](PRD-nexora-estate-os.md) — brand lock, full lifecycle, phased roadmap. This file remains the ship-now contract.

---

## Executive summary

Smart Prop is a **free, landlord-only** web app for owners who track rent in spreadsheets and chase tenants on WhatsApp. The product centers on **units**: each flat holds rent, due day, tenant contact, payment history, reminders, and PDF receipts. Manual payment logging and Paystack collection both write to the same history. Outbound reminders/receipts use one preferred channel (SMS, WhatsApp, or Email).

v1 success means a landlord can go from signup → first unit → logged payment or sent reminder without hitting a paywall or losing a property after Skip.

---

## Business goals

1. Make the unit list the landlord’s daily source of truth.
2. Reduce Excel ↔ WhatsApp reconciliation through logged payments and reminders.
3. Keep first-run friction near zero (free, short wizard, clear next actions).
4. Stay operationally simple: Next.js + FastAPI + Supabase; no tenant platform in v1.

---

## Mission / vision / values (product)

| | Statement |
|--|-----------|
| **Mission** | Help landlords see who paid, who owes, and what was chased — per unit. |
| **Vision** | The default working list for small landlords who live in WhatsApp and cash. |
| **Values** | Clarity over features; honest empty states; one next action; brand tokens only; free path to value. |

---

## Target audience

**Primary:** Small Lagos / Nigerian landlords (1–30 units) using Excel + WhatsApp today.

**Secondary (later):** Agents managing multiple properties for owners — only after primary JTBD is solid.

**Out of scope (v1):** Tenants as logged-in users; UK compliance workflows; enterprise multi-role orgs.

---

## Personas

### P1 — Ada (small landlord)

- Owns a few flats; collects cash or transfer.
- Remembers rent day; forgets who was reminded.
- Needs: fast log, WhatsApp chase, receipt when asked.
- Friction: OTP confusion, invisible property after Skip, Paystack-looking primary when she only has cash.

### P2 — Bode (returning power user)

- Already has properties/units; skips onboarding.
- Needs: reliable unit payments page, reminder retry, settings that load.
- Friction: intermittent 500/skeletons, failed reminder with no recovery.

### P3 — Agent (future)

- Manages for multiple owners. **Not designed for in v1.** Note only for roadmap Later.

---

## User journeys

### J1 — First-run onboard

1. Land on marketing → Get started / Sign up (invite gate if enabled).
2. Phone OTP (channel from env) → session.
3. If zero properties → `/onboarding`: Welcome → Property → Unit (Skip allowed on unit).
4. Land on `/properties` with checklist or unit table; property with zero units still listed + Add unit.

### J2 — Record payment

1. Properties or Payments list → open unit.
2. See status / next due context.
3. **Record manual payment** (primary for cash) or Paystack.
4. Row appears PAID; PDF receipt available; tenant notified on preferred channel; landlord email if profile email + Mailgun/SMTP configured (View payment link).
5. Manual form closes/resets after success.

### J3 — Send reminder

1. Unit reminders or portfolio Remind selected.
2. Message sent on preferred channel; log row with status.
3. On failure: error detail + Retry.

### J4 — Returning day-to-day

1. Login → `/properties`.
2. Scan PAID/OVERDUE → drill into unit payments or reminders.
3. Settings for channel / profile email when needed.

### J5 — Marketing → callback

1. Marketing CTA or footer → WhatsApp callback / get started.
2. Does not require product login for callback path.

---

## Information architecture (current)

```
Marketing (/)
├── Hero, Problem, How it works, Preview, FAQ, Get started, Footer

Auth
├── /login (phone OTP + email paths as implemented)
├── /signup
├── /auth/callback | signout | reset-password

Product (landlord shell)
├── /onboarding
├── /properties                  ← portfolio + checklist / unit table
│   ├── /new
│   ├── /[id] | /[id]/edit
│   ├── /[id]/units/new
│   └── /units/[unitId]/edit
├── /payments | /payments/[unitId]
├── /reminders | /reminders/[unitId]
└── /settings                    ← Profile | Notifications | Security

Admin (allowlist)
└── /admin/leads
```

**Nav model:** Properties · Payments · Reminders · Settings. No Tenancies, Messages, or Tasks in v1.

---

## Functional requirements (v1)

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | CRUD properties and units; tenant contact + rent + due day on unit | P0 |
| F2 | Manual payment create → history + receipt PDF | P0 |
| F3 | Paystack pending/confirm/webhook → same history | P0 |
| F4 | Send / bulk / retry reminders; due-job cron | P0 |
| F5 | Profile + single notification channel | P0 |
| F6 | Phone OTP auth; copy matches `AUTH_OTP_CHANNEL` | P0 |
| F7 | Free onboarding + empty checklist; unit-less properties visible | P0 |
| F8 | Address autocomplete (+ lat/lng when available) | P1 |
| F9 | Landlord email on money-in when email + Mailgun/SMTP present | P1 |
| F10 | Empty/error states with one recovery CTA | P1 |
| F11 | Marketing landing + WhatsApp callback lead path | P1 |
| F12 | Invite-only signup flag | P2 |

---

## Non-goals (v1)

Locked from [`gap-analysis.md`](gap-analysis.md):

- Tenant invite / tenant login app  
- In-app messaging / applications  
- Tenancy entity, fees, room inventory  
- Hard paywall before first property  
- Event × channel notification matrix  
- Global header search  
- Role-specific tenant shell  

---

## Success metrics

| Metric | Definition | Target (directional) |
|--------|------------|----------------------|
| Time-to-first-unit | Signup → ≥1 unit saved | &lt; 10 minutes for a motivated landlord |
| Payment logged | Manual or Paystack PAID row exists | First payment within first session after unit exists |
| Reminder sent | At least one reminder `sent` (not only failed) | Achievable in first week of use |
| Skip recovery | Property with 0 units visible + Add unit | 100% of Skip paths |
| Unit payments reliability | `/payments/[unitId]` loads without sticky skeleton | No intermittent 500 in prod |
| Channel honesty | Auth/settings copy matches actual OTP/notify path | Zero WhatsApp/SMS mismatches |

---

## Brand voice

- **Product UI:** Short, concrete, job-shaped (“Record payment”, “No units yet”). Geist Sans; amounts/dates `.mono-data`.
- **Marketing:** Problem-first (Excel/WhatsApp), reassure once per card, forest accent, no Rentora blue.
- Avoid: enterprise fluff, “AI platform” claims, fake urgency, paywall language.

---

## Roadmap

### Now (harden adopt-now)

Aligned to gap-analysis ordered focus + audit severity:

1. Unit payments page reliability + manual form reset after save.  
2. Unit-less properties always listed + empty-state single CTAs.  
3. Reminder failure: error detail + Retry.  
4. Address autocomplete / geocode polish (slow/empty/error).  
5. ~~Landlord payment email path kept healthy~~ — spot-checked; copy “Money in: …”; Mailgun (`MAILGUN_*`) or SMTP transport.  
6. Receipt wording (Open/Download) + payment CTA hierarchy (manual ≥ Paystack for cash).  
7. Settings `fetchMe` loading; one theme control; one Account entry.  
8. Auth OTP copy via channel helpers (keep consistent).

Layout chrome continues via [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md) one prompt at a time.

### Next (after Now is green)

- ~~Portfolio money-in feed~~ — shipped (`GET /payments/` + Payments hub feed; paid only).  
- ~~Stronger mobile QA on payments/reminders~~ — 390 pass includes money-in feed (`docs/qa-mobile-390/`).  
- Optional: one-shot live landlord email after API restart with Mailgun env.  
- Pricing story only if public paid plans launch (one price everywhere).

### Later (evidence-gated)

- Document upload per unit (reuse receipts Storage) — see [`upgrade-prompts.md`](upgrade-prompts.md).  
- Notification event matrix.  
- Tenancy / fees / inventory / tenant app — only with validated demand.  
- Agent multi-owner workflows.

---

## Design / engineering constraints

- Tokens: `--accent`, `--surface`, `--border`, `--ink`, `--muted`, `--background`, `--background-alt`, `--alert` only for brand colors.  
- Unit-centric IA; free first-run.  
- Stack: Next.js (`web/`), FastAPI (repo root), Supabase — see [`architecture.md`](architecture.md).  
- New features: PRD update → playbook prompt → implement → [`product-audit.md`](product-audit.md).

---

## Open questions

1. When do we open signup beyond invite-only?  
2. Is WhatsApp or SMS the default production OTP channel long-term?  
3. What is the first paid plan trigger (if any)?

---

## Next artifacts

→ [`design-system.md`](design-system.md) · [`ux-flows.md`](ux-flows.md) · [`architecture.md`](architecture.md)
