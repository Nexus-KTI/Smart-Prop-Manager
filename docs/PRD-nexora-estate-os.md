# Nexora by KTI — Product Requirements Document (Estate OS)

**Role:** CEO / product strategy (compiled from strategy thread + prior v1 PRD)  
**Compiled:** 2026-08-16  
**Brand:** Nexora by KTI  
**Tagline:** Who paid. Who owes. What’s next.  
**Status:** Master product PRD for the full estate operating system.  
**Execution contract for ship-now work:** [`PRD.md`](PRD.md) (Phase 1 / current product). Do not expand Phase 1 scope without evidence.

**Inputs:** This thread (vision, brand, sequencing, standup) · [`PRD.md`](PRD.md) · [`research.md`](research.md) · [`gap-analysis.md`](gap-analysis.md)

### Changelog

| Date | Change |
|------|--------|
| 2026-08-23 | **Marketing homepage language override (CEO):** full Estate OS vision may be shown on the public landlord marketing homepage to convey ambition/scale. LIVE / NEXT / LATER honesty rules unchanged. Ban on ecosystem/platform/OS vision language still applies in logged-in product UI. See §4 note + §15 footnote. |
| 2026-08-23 | Brand chrome rebrand Smart Prop → Nexora by KTI; Phase 2 exit metrics (`phase2_exit_check`); Phase 3 open Q4/Q6 decided. |

---

## 1. Executive summary

**Nexora by KTI** is an estate operating system for Nigerian / Lagos landlords and property managers. The long destination is one system that covers the full occupancy lifecycle:

**tenant interest → documentation → verification → move-in → rent & bills → access & estate invites → maintenance / artisans → renewal or exit** — at a scale where one landlord or caretaker/PM can run many properties without relying on weak informal ops.

**We do not build that all at once.**

The wedge that earns the right to expand is **unit money truth**: who paid, who owes, what was chased. Phase 1 is a free, landlord-first web app centered on units (rent, due day, tenant contact, payment history, reminders, PDF receipts). Manual logging and Paystack share one history; outbound chase uses one preferred channel (SMS, WhatsApp, or Email).

**Phase 1 success:** signup → first unit → logged payment or sent reminder, with no paywall and no lost property after Skip.

**Company vision success:** Nexora becomes the default ops layer for estates — landlords, caretakers, and property managers use the same source of truth; artisans and access plug into that center later.

---

## 2. Problem

### Today
- Small landlords track rent in **Excel** and chase on **WhatsApp**.
- Memory fails: who was reminded, who paid cash, who owes.
- Caretakers and informal managers often cannot scale quality across many units.
- Full estate tools (docs, KYC, fees, access, artisans) are either absent, fragmented, or too heavy for Ada’s first session.

### Cost of boiling the ocean
Shipping docs + verification + access + artisans + PM multi-owner **before** money truth works produces a thin “everything” product nobody trusts for the daily job (collect and chase rent).

### Opportunity
Win the daily list first. Expand outward along the tenancy lifecycle only when the previous layer is green.

---

## 3. Mission / vision / values

| | Statement |
|--|-----------|
| **Mission** | Help people who run property see who paid, who owes, and what’s next — per unit, then across the estate. |
| **Vision** | The default estate OS for landlords and property managers who live in WhatsApp, cash, and real buildings — not spreadsheets. |
| **Values** | Clarity over features; one next action; honest empty states; free path to first value; brand tokens only; ship the wedge before the platform pitch. |

---

## 4. Brand lock

| Element | Lock |
|---------|------|
| **Product name** | Nexora |
| **Company stamp** | by KTI |
| **Tagline** | Who paid. Who owes. What’s next. |
| **Team one-liner** | Nexora is the landlord’s daily list for rent and chase — built to grow into full estate ops, without sounding like an ecosystem pitch to users. |
| **Name rationale (CCO)** | *Nexus*: connection hub between people, money, access, services, and (later) devices — not another “smart prop / asset” proptech label. |

### Say (product & landlord marketing)
- Record payment / Send reminder / Add unit  
- Who paid, who owes, what was chased  
- For landlords (and later PMs) who live in WhatsApp and cash  

### Never say (to landlords / in product UI)
- Integrated ecosystem / nexus / platform / IoT  
- AI / proptech / end-to-end estate OS  
- Eradicate caretakers / replace property managers  
- Enterprise / smart city / everything in one  

*Override 2026-08-23: full Estate OS vision is now shown on the landlord marketing homepage by deliberate choice. This ban still applies inside the logged-in product UI and to in-app landlord-facing copy — only the public homepage is exempted.*

### Internal / investor only
*Nexora connects rent, people, and estate operations — starting with unit money truth.*

---

## 5. Target audience

| Priority | Who | When |
|----------|-----|------|
| **Primary** | Small Lagos / Nigerian landlords (1–30 units), Excel + WhatsApp today | Phase 1+ |
| **Secondary** | Caretakers / on-site managers acting for an owner | Phase 3+ (roles) |
| **Secondary** | Property managers / agents running portfolios for multiple owners | Phase 4+ |
| **Tertiary** | Tenants (pay, docs, access, renew) | Phase 3+ (tenant surface) |
| **Tertiary** | Artisans / vendors (jobs, access windows) | Phase 5 |

**Out of scope for early phases:** UK compliance-first workflows; enterprise multi-org SSO as a launch requirement.

---

## 6. Personas

### P1 — Ada (small landlord) — Phase 1 primary
- Owns a few flats; cash or transfer.
- Needs: fast log, WhatsApp chase, receipt when asked.
- Friction: OTP confusion, lost property after Skip, Paystack-looking primary when she only has cash.

### P2 — Bode (returning power user) — Phase 1
- Already has properties/units; skips onboarding.
- Needs: reliable unit payments, reminder retry, settings that load.

### P3 — Chinedu (caretaker / estate hand) — Phase 3+
- Manages gates, complaints, “who has access,” chasing for the landlord.
- Needs: clear unit statuses, send reminder on behalf of owner, log cash, limited permissions.

### P4 — Funke (property manager) — Phase 4+
- Runs many properties for multiple owners.
- Needs: multi-owner portfolio, assign staff, portfolio money-in, renewals at scale.
- **Goal of the company vision:** Funke (and good caretakers) use Nexora so weak informal ops are no longer the bottleneck — not “fire humans,” but **upgrade who can scale**.

### P5 — Tunde (tenant) — Phase 3+
- Pays rent / service charge, receives receipts, uploads docs, gets access codes / estate invites, renews.

### P6 — Sola (artisan) — Phase 5
- Gets job invites, time windows, unit/estate access context, marks work done.

---

## 7. Product principles

1. **Wedge before OS.** Money + chase must be trustworthy before docs, KYC, access, or artisans.
2. **Unit-centric core.** Property → units remain the spine; tenancy/fees/docs attach to that spine later.
3. **One next action.** Empty and error states offer a single recovery CTA.
4. **Channel honesty.** Auth and notify copy match the real channel.
5. **Free path to value.** No hard paywall before first property / first unit value.
6. **Roles expand permissions, not a second product.** Landlord shell first; staff/tenant/artisan are surfaces on the same estate data.
7. **Vision language stays internal.** Product speaks jobs; decks may speak nexus.

---

## 8. Estate OS — capability map (destination)

The full product is a **lifecycle OS**. Modules below are destinations; phases gate when they ship.

```
                    NEXORA ESTATE OS
┌─────────────────────────────────────────────────────────────┐
│  PORTFOLIO          UNIT TRUTH           MONEY              │
│  Properties         Status / due         Rent               │
│  Multi-owner (later) Tenant contact      Service charge     │
│  Staff roles        Occupancy term       Other bills        │
├─────────────────────────────────────────────────────────────┤
│  PEOPLE             COMPLIANCE           ACCESS             │
│  Landlord           Docs / agreements    Gate / codes       │
│  Caretaker / PM     Verification         Estate invites     │
│  Tenant             Background check*    Visitor passes     │
│  Artisan            Renewals / exit      (IoT later)        │
├─────────────────────────────────────────────────────────────┤
│  OPS                COMMS                TRUST              │
│  Work orders        Reminders            Receipts / PDF     │
│  Artisan jobs       Preferred channel    Audit log          │
│  Escalations        (matrix later)       Permissions        │
└─────────────────────────────────────────────────────────────┘
* Background check: partner/API or checklist workflow — not “build a bureau.”
```

### Lifecycle (tenant journey the OS must eventually cover)

1. Lead / interest  
2. Documentation (ID, agreement, references)  
3. Verification / background check (as available)  
4. Move-in + access (codes, estate invites)  
5. Living: rent, service charge, other bills  
6. Maintenance / artisan jobs  
7. Renewal or exit + settlement  

Phase 1 only owns a thin slice of step 5 (rent) plus chase — with tenant as **contact fields**, not a logged-in user.

---

## 9. Phased roadmap (do not collapse)

### Phase 1 — Unit money truth (NOW) — *current product*

**Goal:** Ada’s daily source of truth for rent and reminders.

**In scope:**
- Properties + units CRUD; tenant contact + rent + due day on unit  
- Manual payment + Paystack → same history + PDF receipt  
- Reminders: send / bulk / retry + due cron  
- Single notification channel; phone OTP auth  
- Free onboarding; unit-less properties visible after Skip  
- Marketing + WhatsApp callback lead path  

**Explicitly out (still):** tenant login, tenancy entity, fees matrix, access, artisans, multi-owner PM, messaging inbox, hard paywall.

**Harden list (adopt-now):** see [`PRD.md`](PRD.md) Now section + [`gap-analysis.md`](gap-analysis.md).

**Exit criteria (Phase 1 green):**
| Metric | Target |
|--------|--------|
| Time-to-first-unit | &lt; 10 min motivated landlord |
| First payment logged | Same session after unit exists |
| Reminder `sent` | Achievable in first week |
| Skip recovery | 100% (0-unit property listed + Add unit) |
| Unit payments reliability | No intermittent 500 / sticky skeleton in prod |
| Channel honesty | Zero OTP/notify copy mismatches |

---

### Phase 2 — Money beyond rent (NEXT)

**Goal:** Same unit ledger covers the bills landlords actually chase.

**In scope (evidence-gated after Phase 1 green):**
- Service charge and other recurring/one-off charges on the unit (or lightweight charge lines)  
- Shared payment history + receipts for non-rent charges  
- Renewal date / term end on unit (or thin tenancy record) — remind to renew  
- Portfolio money-in already shipped; keep healthy  
- Optional paid plan story only if public pricing launches (one price everywhere)  

**Still out:** full tenant app, access control, artisan marketplace, multi-owner orgs.

**Exit criteria:** Landlord can log/collect rent + ≥1 non-rent charge type; see renewal coming due without Excel.

**How we measure (honest, re-runnable):** `python scripts/phase2_exit_check.py` or admin `GET /admin/phase2-exit` / `/admin/phase2-exit`:
1. Non-rent collection — % of active landlords (own ≥1 unit) with ≥1 PAID `charge_type != rent` in trailing 30 days  
2. Renewal visibility — % of occupied units (`tenant_contact` set) with `term_end` set  
2b. Banner attention — `renewal_banner_viewed` product events (unit payments when banner renders)  
Near-zero early numbers are expected; they are evidence, not a bug.

---

### Phase 3 — Tenancy dossier & tenant surface (PARTIAL)

Tenancy, checklist, invite, tenant pay, receipts, and messages are live.
Document storage and receipt/read acknowledgment are **awaiting Nigerian
legal/privacy approval** and remain server-disabled. See
[`tenancy-docs-launch-gate.md`](tenancy-docs-launch-gate.md).

**Goal:** Move from “tenant contact on unit” to a real occupancy record + tenant self-serve for money and docs.

**In scope:**
- Tenancy entity (term, parties, unit link)  
- Landlord document upload per tenancy to a dedicated private bucket (awaiting
  legal approval); active tenants may read and acknowledge receipt, not upload
- Verification checklist (ID collected / agreement signed / refs) — **required path**  
- Optional identity verification via **NIN/BVN partner hook** (VerifyMe or Dojah — pick after pricing/turnaround conversation); **not** full criminal/credit screening in Phase 3  
- Tenant invite / login: pay, view balance, download receipts, and—after the
  document launch gate—read tenancy documents
- Notification event matrix (if users demand)  

**Data / compliance framing (locked for design):** Landlord (owner) = **data controller** for tenant docs and verification artifacts; KTI/Nexora = **data processor**. Wireframe and ToS copy must say the landlord owns the tenant file; Nexora stores it for them. Full background screening (Risk Control / 360 Verify tier) is **out of Phase 3** — reopen only if a PM/estate pilot asks.

**Exit criteria:** New occupancy can be opened with docs checklist; tenant can pay without landlord manual log for digital payments; optional ID-verify step available without blocking occupancy.

---

### Phase 4 — Staff & multi-property management (LATER)

**Goal:** Caretaker and PM can run many properties on Nexora — company vision of scalable ops.

**In scope:**
- Roles: Owner, Manager, Caretaker (scoped permissions)  
- Multi-owner / multi-portfolio for agents (Funke)  
- Assign units/properties to staff  
- Audit log of money and chase actions  
- Estate-level views (all overdue across portfolio)  

**Product narrative:** Upgrade caretakers/PMs with a real system so landlords can scale without depending on unreliable informal tracking — **not** “eliminate all humans.”

**Exit criteria:** One PM user operates ≥2 owner portfolios with correct permission boundaries.

---

### Phase 5 — Access, estate invites & artisans (LATER)

**Goal:** Connect people and places: who may enter, who may work, for how long.

**In scope:**
- Access codes / pass issuance tied to tenancy or visit  
- Estate invites (guest / contractor time windows)  
- Artisan signup: profile, job invite, status, optional access window  
- Work orders linked to unit  
- IoT / device hooks only when a concrete estate partner exists (never lead marketing)  

**Exit criteria:** Tenant or artisan receives a time-bound access/invite without WhatsApp-only process for at least one pilot estate.

---

## 10. Functional requirements (master)

### Phase 1 (P0 unless noted) — ship / harden now

| ID | Requirement | Phase |
|----|-------------|-------|
| F1 | CRUD properties and units; tenant contact + rent + due day | 1 |
| F2 | Manual payment → history + receipt PDF | 1 |
| F3 | Paystack pending/confirm/webhook → same history | 1 |
| F4 | Send / bulk / retry reminders; due-job cron | 1 |
| F5 | Profile + single notification channel | 1 |
| F6 | Phone OTP auth; copy matches `AUTH_OTP_CHANNEL` | 1 |
| F7 | Free onboarding + empty checklist; unit-less properties visible | 1 |
| F8 | Address autocomplete (+ lat/lng) | 1 / P1 |
| F9 | Landlord email on money-in when email + Mailgun/SMTP | 1 / P1 |
| F10 | Empty/error states with one recovery CTA | 1 / P1 |
| F11 | Marketing landing + WhatsApp callback | 1 / P1 |
| F12 | Invite-only signup flag | 1 / P2 |

### Phase 2+

| ID | Requirement | Phase |
|----|-------------|-------|
| F20 | Charge types: service charge / other bills on unit ledger | 2 |
| F21 | Renewal / term-end field + renewal reminder | 2 |
| F30 | Tenancy entity linked to unit | 3 |
| F31 | Document upload + types + expiry optional | 3 |
| F32 | Verification checklist on tenancy | 3 |
| F33 | Background-check partner or manual checklist | 3 |
| F34 | Tenant invite + tenant shell (pay, docs, receipts) | 3 |
| F40 | Staff roles + scoped permissions | 4 |
| F41 | Multi-owner agent portfolios | 4 |
| F42 | Portfolio overdue / chase ops views | 4 |
| F50 | Access codes / estate invites | 5 |
| F51 | Artisan profiles + work orders | 5 |
| F52 | Optional IoT/device integrations (partner-led) | 5 |

---

## 11. User journeys

### Phase 1 (current)

**J1 — First-run onboard**  
Marketing → signup → OTP → onboarding (Welcome → Property → Unit, Skip allowed) → `/properties` with checklist or unit table; 0-unit property still listed.

**J2 — Record payment**  
Open unit → status/due → **Record manual payment** (primary for cash) or Paystack → PAID row + PDF + tenant notify + optional landlord email → form resets.

**J3 — Send reminder**  
Unit or bulk → preferred channel → log status → on failure: detail + Retry.

**J4 — Returning day-to-day**  
Login → `/properties` → scan PAID/OVERDUE → payments or reminders → settings as needed.

**J5 — Marketing callback**  
WhatsApp callback / get started without product login.

### Full OS (later phases — target)

**J6 — Open occupancy**  
Create/select unit → start tenancy → upload docs → complete verification checklist → (optional) background check step → activate occupancy.

**J7 — Bills beyond rent**  
Post service charge / other bill → tenant pays or landlord logs → same history + receipt.

**J8 — Access & invite**  
Issue code or estate invite for tenant/guest/artisan → time window → revoke/expire.

**J9 — Renewal**  
Term end approaching → reminder to landlord/tenant → renew term or exit + settle balances.

**J10 — Artisan job**  
Work order on unit → invite artisan → access window → complete → optional charge.

**J11 — PM multi-portfolio**  
Funke switches owners → sees only permitted properties → chase/log across portfolio.

---

## 12. Information architecture

### Current (Phase 1)

```
Marketing (/)
Auth (/login, /signup, /auth/*)
Product (landlord shell)
├── /onboarding
├── /properties … units
├── /payments | /payments/[unitId]
├── /reminders | /reminders/[unitId]
└── /settings
Admin /admin/leads
```

**Nav:** Properties · Payments · Reminders · Settings.

### Target (Estate OS — incremental)

```
Marketing (/)
Auth
Landlord / PM shell
├── Portfolio (properties / estates)
├── Units & tenancies
├── Money (rent, bills, money-in)
├── Reminders / chase
├── Documents & verification          ← Phase 3
├── Access & invites                  ← Phase 5
├── Work orders / artisans            ← Phase 5
└── Settings / team & roles           ← Phase 4
Tenant shell                          ← Phase 3
Artisan shell                         ← Phase 5
Admin
```

---

## 13. Roles & permissions (target model)

| Role | Money | Chase | Docs | Access | Team |
|------|-------|-------|------|--------|------|
| Owner | Full | Full | Full | Full | Invite staff |
| Manager (PM) | Per grant | Per grant | Per grant | Per grant | Limited |
| Caretaker | Log cash / limited | Send reminders | View / upload limited | Issue visitor passes | None |
| Tenant | Own pay | Receive only | Own docs | Own codes | None |
| Artisan | None | Job notify | Job docs | Time-bound | None |

Phase 1 implements **Owner only**.

---

## 14. Success metrics (by horizon)

### Phase 1 (adopt)
As in §9 exit criteria + standup pulse: first-run, money, chase, trust, channel honesty.

### Phase 2+
| Metric | Definition |
|--------|------------|
| Non-rent collection | ≥1 service-charge (or other) PAID row per active adopting landlord cohort |
| Renewal visibility | Term end set on ≥X% of occupied units in cohort |
| Tenancy activation | Docs checklist completed before “active” on new tenancies |
| Staff leverage | Units under management per active caretaker/PM user |
| Access without WhatsApp | Pilot estate issues codes/invites in-product |

---

## 15. Non-goals & anti-patterns

### Never in Phase 1
- Tenant invite / tenant login app  
- In-app messaging / applications inbox  
- Full tenancy + fees + room inventory clone of competitors  
- Hard paywall before first property  
- Access / artisans / IoT as launch features  
- Building a background-check bureau in-house  

### Never as a way of working
- **Address all modules at once** — rejected; sequence only  
- Daily standup debating Later modules — park them  
- Marketing Nexora as “AI ecosystem / IoT platform” to Ada[^homepage-vision]

[^homepage-vision]: **Exception (2026-08-23, CEO):** the public marketing homepage may show the full Estate OS vision (including platform / estate operating system language) to convey ambition and scale. This anti-pattern still applies to **in-app** UI and day-to-day team talk. See §4 override note. Honesty rule unchanged: anything beyond live Phase 1–2 must be labeled LIVE / NEXT / LATER — never presented as available today.

### Standup operating rule (from strategy thread)
Daily standup protects **money-in + chase reliability**. Vision modules stay in parking lot until Phase exit criteria are met. Weekly “landlord truth” walk of J1/J2/J3.

---

## 16. Business goals

1. Make the unit list (then estate list) the daily source of truth.  
2. Reduce Excel ↔ WhatsApp reconciliation via logged money and reminders.  
3. Keep first-run friction near zero.  
4. Grow into staff + tenant + artisan surfaces **on the same spine**.  
5. Enable landlords and capable caretakers/PMs to run **more properties with less chaos** — operational leverage, not anti-human messaging.  
6. Stay operationally simple early: Next.js + FastAPI + Supabase.

---

## 17. Design / engineering constraints

- Brand colors via tokens only: `--accent`, `--surface`, `--border`, `--ink`, `--muted`, `--background`, `--background-alt`, `--alert`.  
- Product UI: short, job-shaped copy; Geist Sans; amounts/dates `.mono-data`.  
- Marketing: problem-first (Excel/WhatsApp); forest accent; no Rentora blue; no paywall/fake urgency language.  
- Stack: Next.js (`web/`), FastAPI (repo root), Supabase — [`architecture.md`](architecture.md).  
- Process: PRD update → playbook prompt → implement → [`product-audit.md`](product-audit.md).  
- Rebrand from “Smart Prop” → **Nexora by KTI** in product chrome/marketing when brand rollout is scheduled; Phase 1 functional scope unchanged by rename alone.

---

## 18. Open questions

1. When do we open signup beyond invite-only?  
2. WhatsApp vs SMS as long-term default OTP channel?  
3. First paid plan trigger (if any) — and what feature gate?  
4. ~~Background check: which partner / what minimum checklist for Lagos estates?~~ → **Decided (2026-08-23):** Phase 3 = manual verification checklist + optional lightweight NIN/BVN identity verify (VerifyMe or Dojah after commercial check). Full tenant screening (criminal/credit/employment) deferred to Phase 4+ on explicit PM/estate demand. Do not build a bureau.  
5. Access: software-only codes first, or a specific estate hardware partner?  
6. ~~Legal: who is data controller for tenant docs and verification artifacts (owner vs KTI)?~~ → **Decided (2026-08-23):** Landlord = controller; KTI = processor. Encode in landlord ToS + DPA before Phase 3 document upload ships; confirm with Nigerian counsel (not finalized from product brief alone).  
7. Artisan: marketplace take-rate vs directory vs invite-only vendors?  
8. ~~Brand rollout date: when does UI string “Smart Prop” fully become “Nexora”?~~ → **Done in product chrome/marketing (2026-08-23):** UI uses **Nexora** / **Nexora by KTI**; keep env `EMAIL_FROM_NAME` aligned.  

### Phase 3 design implications (from #4 and #6)

| Surface | What to show |
|---------|----------------|
| Verification screen | Checklist: ID collected · agreement signed · references checked; optional “Confirm identity (NIN/BVN)” CTA — partner TBD, never required to activate occupancy in v1 of Phase 3 |
| Docs / tenant file | One line of honesty: documents belong to the landlord; Nexora stores them for their tenancy record |
| Out of wireframe | Full Risk Control / 360 Verify-style screening packages |

---

## 19. Document relationship

| Doc | Role |
|-----|------|
| **This file** | Master Estate OS PRD — vision, phases, brand, full lifecycle |
| [`PRD.md`](PRD.md) | Living **Phase 1** execution PRD — do not reopen deferred items without evidence |
| [`gap-analysis.md`](gap-analysis.md) | Competitive gap → adopt-now ordering |
| [`ux-flows.md`](ux-flows.md) / [`architecture.md`](architecture.md) | Current UX & stack detail |

**Change control:** Expanding into Phase 2+ requires Phase 1 exit criteria green **or** new written evidence (user demand, pilot estate, revenue need). CCO/CEO vision alone does not pull Later into Now.

---

## 20. One-line strategy (lock)

**Nexora by KTI is an estate OS that starts as the landlord’s rent-and-chase list — then earns docs, bills, access, staff, tenants, and artisans by staying trustworthy at the money layer first.**
