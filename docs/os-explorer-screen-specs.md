# OS Explorer — Screen Specs

Status: ready-for-wireframer  
Source: `docs/PRD-nexora-estate-os.md`  
Also consulted: `docs/PRD.md` (Phase 1 fidelity), `docs/design-system.md`  
Explorer root: `web/app/(design)/os-explorer/`  
Gate: `NEXT_PUBLIC_DESIGN_MODE=true|1` (layout `notFound()` when off; never in production AppShell nav)  
Brand in chrome: **Nexora** (wireframe-only label; production may still say Smart Prop)

---

## Hub

### Explorer home
- **Route:** `/os-explorer`
- **Purpose:** Phase picker + reminder that this is a mock Estate OS click-through, not production.
- **Key states:** default only.
- **Primary CTA:** Enter Phase 1.
- **PRD:** §9 (phased roadmap), §20 (one-line strategy).
- **Notes:** List Phases 1–5 with one-line goals. Banner: “Wireframe explorer — mock data — not production”. Job-shaped language only.

---

## Phase 1 — Unit money truth

### P1 Today
- **Route:** `/os-explorer/phase-1`
- **Purpose:** Landlord daily scan — who paid, who owes, what to chase.
- **Key states:** happy (mix of PAID/OVERDUE); empty portfolio (single CTA: Add property).
- **Primary CTA:** Open overdue unit / Record payment.
- **PRD:** §9 Phase 1; Journey J4; Mission §3.

### P1 Portfolio
- **Route:** `/os-explorer/phase-1/portfolio`
- **Purpose:** Properties + units list; unit-less property still visible.
- **Key states:** units present; property with 0 units + “Add unit”; empty.
- **Primary CTA:** Add unit / Open unit.
- **PRD:** §9 F7 / Skip recovery; J1; IA §12 current.

### P1 Unit
- **Route:** `/os-explorer/phase-1/unit`
- **Purpose:** Single unit truth — tenant contact, rent, due day, status.
- **Key states:** PAID; OVERDUE.
- **Primary CTA:** Record payment (manual emphasized for cash).
- **PRD:** §9 Phase 1 in-scope; J2; Persona Ada §6.

### P1 Payments
- **Route:** `/os-explorer/phase-1/payments`
- **Purpose:** Payment history + manual log / Paystack alternate; receipt affordance.
- **Key states:** history with PAID rows; empty history + Record payment; form success (row appears).
- **Primary CTA:** Record manual payment.
- **PRD:** §9 F2/F3; J2; §17 mono-data for amounts.

### P1 Reminders
- **Route:** `/os-explorer/phase-1/reminders`
- **Purpose:** Send / see reminder log; failure recovery.
- **Key states:** sent; failed + error detail + Retry (one CTA).
- **Primary CTA:** Send reminder / Retry.
- **PRD:** §9 F4; J3.

### P1 Settings
- **Route:** `/os-explorer/phase-1/settings`
- **Purpose:** Profile + single notification channel (SMS / WhatsApp / Email).
- **Key states:** loaded profile; channel selected.
- **Primary CTA:** Save channel.
- **PRD:** §9 F5/F6 channel honesty.

---

## Phase 2 — Money beyond rent

### P2 Money hub
- **Route:** `/os-explorer/phase-2`
- **Purpose:** Same unit ledger with rent + service charge / other bills.
- **Key states:** multiple charge types; overdue service charge.
- **Primary CTA:** Record payment on selected charge.
- **PRD:** §9 Phase 2; F20.

### P2 Charges
- **Route:** `/os-explorer/phase-2/charges`
- **Purpose:** List charge lines (rent, service charge, one-off) on a unit.
- **Key states:** mixed statuses; empty charges (CTA: Add charge).
- **Primary CTA:** Add charge / Open charge.
- **PRD:** §9 Phase 2 in-scope; exit criteria.

### P2 Renewals
- **Route:** `/os-explorer/phase-2/renewals`
- **Purpose:** Term end / renewal coming due without Excel.
- **Key states:** renewal due soon; none upcoming.
- **Primary CTA:** Send renewal reminder.
- **PRD:** §9 F21; Journey J9 (thin).

---

## Phase 3 — Tenancy dossier & tenant surface

### P3 Occupancy hub
- **Route:** `/os-explorer/phase-3`
- **Purpose:** Open occupancy — tenancy linked to unit; docs + verify entry.
- **Key states:** active tenancy; checklist incomplete.
- **Primary CTA:** Continue verification / Open docs.
- **PRD:** §9 Phase 3; J6; F30–F32.

### P3 Documents
- **Route:** `/os-explorer/phase-3/documents`
- **Purpose:** Document list per tenancy (ID, agreement, refs) — upload affordance (mock).
- **Key states:** docs present; empty + Upload document.
- **Primary CTA:** Upload document.
- **Copy lock:** Short note that documents belong to the landlord; Nexora stores them for this tenancy (controller = landlord, processor = KTI — PRD §18 #6).
- **PRD:** §9 F31; lifecycle steps 2–3 §8; §18 #6.

### P3 Verification
- **Route:** `/os-explorer/phase-3/verification`
- **Purpose:** Required checklist (ID collected / agreement signed / references checked) + **optional** identity confirm (NIN/BVN) via partner hook — not full criminal/credit screening.
- **Key states:** partial checklist; checklist complete; optional ID-verify idle / pending partner / confirmed; occupancy can activate without ID-verify.
- **Primary CTA:** Mark checklist step done; secondary: Confirm identity (optional, mock partner).
- **Out of scope on this screen:** Full tenant screening packages (Risk Control / 360 Verify tier) — Phase 4+.
- **PRD:** §9 Phase 3 + §18 #4/#6 decided 2026-08-23.

### P3 Tenant home
- **Route:** `/os-explorer/phase-3/tenant`
- **Purpose:** Thin tenant shell — balance, pay, docs, receipts.
- **Key states:** amount due; paid up.
- **Primary CTA:** Pay rent.
- **PRD:** §9 F34; Persona Tunde §6; J7 thin.

---

## Phase 4 — Staff & multi-property management

### P4 Ops hub
- **Route:** `/os-explorer/phase-4`
- **Purpose:** Portfolio overdue / chase across many units (PM view).
- **Key states:** multi-property overdue list; empty (all clear).
- **Primary CTA:** Open unit / Send reminder.
- **PRD:** §9 Phase 4; F42; Persona Funke §6.

### P4 Owners
- **Route:** `/os-explorer/phase-4/owners`
- **Purpose:** Multi-owner switcher for agent portfolios.
- **Key states:** two+ owners; single owner.
- **Primary CTA:** Switch owner context.
- **PRD:** §9 F41; exit criteria.

### P4 Team
- **Route:** `/os-explorer/phase-4/team`
- **Purpose:** Roles Owner / Manager / Caretaker + assign scope (mock).
- **Key states:** team list; empty + Invite staff.
- **Primary CTA:** Invite staff.
- **PRD:** §9 F40; §13 roles table.

---

## Phase 5 — Access, estate invites & artisans

### P5 Access hub
- **Route:** `/os-explorer/phase-5`
- **Purpose:** Who may enter — codes and invites overview.
- **Key states:** active codes; none issued + Issue code.
- **Primary CTA:** Issue access code.
- **PRD:** §9 Phase 5; F50; J8.

### P5 Invites
- **Route:** `/os-explorer/phase-5/invites`
- **Purpose:** Estate / guest / contractor time-window invites.
- **Key states:** active invite; expired; empty.
- **Primary CTA:** Create invite.
- **PRD:** §9 F50; lifecycle step 4 §8.

### P5 Work orders
- **Route:** `/os-explorer/phase-5/work-orders`
- **Purpose:** Unit-linked work orders; invite artisan.
- **Key states:** open job; done; empty + New work order.
- **Primary CTA:** New work order / Invite artisan.
- **PRD:** §9 F51; J10.

### P5 Artisan home
- **Route:** `/os-explorer/phase-5/artisan`
- **Purpose:** Thin artisan shell — jobs + access window.
- **Key states:** assigned job with window; no jobs.
- **Primary CTA:** Open job / Mark done.
- **PRD:** §9 F51; Persona Sola §6.

---

## Shared wireframer requirements

1. Mock data only under `web/app/(design)/os-explorer/mock/`.
2. Layout gate on `NEXT_PUBLIC_DESIGN_MODE`.
3. Tokens/classes from design system; amounts/dates `.mono-data`.
4. Cross-links: each phase hub ↔ hub home; primary path within phase clickable.
5. Never-say list (§4): no ecosystem / nexus / IoT / AI platform / eradicate caretakers in UI copy.
6. Do not edit files outside `web/app/(design)/os-explorer/`.

---

## Ambiguities (guesses)

1. **Exact URL IA for Estate OS** — PRD §12 gives target module names, not wireframe routes. Guessed `/os-explorer/phase-N/...` slugs for click-through clarity.
2. **P1 “Today” vs Properties-first** — Live product lands on `/properties` (J4). Spec adds a Phase 1 hub “Today” as explorer narrative home; not a commitment to change production IA.
3. **Background check UX** — PRD says partner/API or checklist, open Q4 unanswered. Spec uses a checklist row + “pending partner” mock state.
4. **Access codes** — Software-only vs hardware (open Q5). Spec assumes software code display only.
5. **Auth for `/os-explorer`** — Production middleware still requires login for non-public routes. Spec does **not** ask wireframer to change middleware (out of write scope). Explorer may need an authenticated session to click through in browser; DESIGN_MODE only gates layout `notFound` + absence from AppShell.
6. **Brand string** — Production metadata still “Smart Prop”; explorer chrome uses **Nexora** per master PRD brand lock (open Q8 timing).
7. **IoT** — Explicitly excluded from screens (Phase 5 notes partner-led later; never-say in UI).
