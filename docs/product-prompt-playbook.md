# Smart Prop — Product Prompt Playbook

**Role:** Engineering lead / Cursor operating manual  
**Compiled:** 2026-08-04  
**Adapted from:** Method in [`logo-exploration.md`](logo-exploration.md) (phases + role separation). **Not** the Kings consulting website scope.  
**Pipeline:** research → PRD → design → UX → architecture → implement → audit

---

## How to use

1. Work **one prompt at a time** in Cursor Agent.  
2. Paste the full prompt block.  
3. Prefer editing existing classes in `web/app/globals.css` and existing routers/components over new frameworks.  
4. Layout-only chrome: use [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md) instead of inventing new layout prompts here.  
5. After implementation, run the **Audit** prompt and update [`product-audit.md`](product-audit.md).

### Hard constraints (every prompt)

- Benchmark Rentora; **do not copy** blue, fonts, logo, paywall, or tenancy stack.  
- Unit-centric, free first-run, landlord-only v1.  
- Colors via `--accent` / `--surface` / `--border` / `--ink` / `--muted` / `--background` / `--background-alt` / `--alert`.  
- Geist Sans UI; JetBrains Mono via `.mono-data` for amounts/dates.  
- Stack stays Next.js `web/` + FastAPI + Supabase — no NestJS rewrite.  
- Do not reopen deferred/skip items in [`gap-analysis.md`](gap-analysis.md) without evidence.

---

## Master plan

```
Phase 1  Research          → docs/research.md
Phase 2  PRD               → docs/PRD.md
Phase 3  Design system     → docs/design-system.md
Phase 4  UX flows          → docs/ux-flows.md
Phase 5  Architecture      → docs/architecture.md
Phase 6  Implement         → code (one Now item or one layout prompt)
Phase 7  Audit             → docs/product-audit.md + docs/upgrade-prompts.md
```

Baseline docs for Phases 1–5 already exist. Re-run a phase only when evidence changes (new audit, new competitor, roadmap shift).

---

## STEP 1 — Research (strategist + UX researcher)

**Inputs:** `docs/rentora-*.md`, `docs/our-app-authenticated-audit.md`, `docs/gap-analysis.md`  
**Output:** `docs/research.md`

```text
You are a team of product strategists and UX researchers for Smart Prop Manager
(a free, landlord-only rent tracker for Lagos landlords who use Excel + WhatsApp).

Your task is NOT to copy Rentora or any competitor.

Using the existing audits in docs/ (rentora-*, our-app-authenticated-audit, gap-analysis),
produce or update docs/research.md covering:

• Positioning vs Rentora and vs Excel+WhatsApp
• Landlord jobs-to-be-done
• Shared patterns worth keeping (empty states, CTAs, money-in feedback)
• Happy paths compared (tenancy hub vs unit hub)
• Trust signals for cash + WhatsApp landlords
• Smart Prop differentiation pillars
• Explicit anti-goals (no tenant app, no paywall clone, no tenancy/fees/inventory without demand)

Do not generate application code.

Save to docs/research.md
```

---

## STEP 2 — PRD (product strategist)

**Inputs:** `docs/research.md`, `docs/gap-analysis.md`  
**Output:** `docs/PRD.md`

```text
You are a senior product strategist for Smart Prop Manager.

Based on docs/research.md and docs/gap-analysis.md, write or update docs/PRD.md.

Include:

Executive summary, business goals, mission/vision/values,
primary persona (small Lagos landlord), user journeys
(onboard → unit → pay → remind → receipt), information architecture
of the CURRENT app (not a consulting megasite), functional requirements,
non-goals locked to gap-analysis skip/defer, success metrics,
brand voice, and roadmap Now / Next / Later.

Now roadmap must harden adopt-now items (unit payments reliability,
unit-less properties, reminder retry, autocomplete, landlord email,
CTA hierarchy, settings load, OTP channel copy).

Do not generate application code.

Save to docs/PRD.md
```

---

## STEP 3 — Design system (creative director)

**Inputs:** `web/app/globals.css`, `docs/PRD.md`  
**Output:** `docs/design-system.md`

```text
You are an award-winning creative director documenting an EXISTING design system.

Do not invent glassmorphism, a new palette, or Rentora’s blue/fonts.

Read web/app/globals.css and docs/PRD.md. Update docs/design-system.md with:

Brand personality, color tokens (light/dark), typography (Geist + JetBrains Mono),
spacing (shell 32px, form-card 22px, onboarding 28px, marketing 720px),
radius 6px, no decorative product shadows, button hierarchy, surface classes,
marketing vs product density, Motion + Materials (`--motion-*`, flat surfaces), accessibility, anti-patterns.

Save to docs/design-system.md
```

---

## STEP 4 — UX flows (UX architect)

**Inputs:** `docs/PRD.md`, `docs/our-app-authenticated-audit.md`  
**Output:** `docs/ux-flows.md`

```text
You are a UX architect for Smart Prop Manager.

Using docs/PRD.md and the authenticated audit, update docs/ux-flows.md with
wireframe-level flows for:

Marketing→auth, phone OTP, onboarding (+ Skip recovery), property→unit,
unit payments (manual primary, Paystack alternate, receipt, error states),
reminders (+ failed retry), settings/channel loading, sign out.

Include a cross-cutting recovery map for unit-less properties, failed reminders,
and stuck skeletons. Do not design tenant login or tenancy hubs.

Save to docs/ux-flows.md
```

---

## STEP 5 — Architecture (staff architect)

**Inputs:** repo as-built (`main.py`, `routers/`, `web/app`, `sql/`, `render.yaml`)  
**Output:** `docs/architecture.md`

```text
You are a Staff Software Architect documenting the AS-BUILT Smart Prop system.

Map Next.js web/ + FastAPI (repo root) + Supabase (auth, Postgres, receipts storage).
Include routers, core tables, integrations (Paystack, Twilio, SMTP), env flags
(AUTH_OTP_CHANNEL, invite-only), Render API+cron deploy.

Add an explicit “Do not rebuild” section rejecting NestJS/Redis consulting-platform
rewrites from unrelated prompts.

Do not generate a greenfield redesign. Save to docs/architecture.md
```

---

## STEP 6 — Implement (senior full-stack) — pick one Now item

**Inputs:** `docs/PRD.md` (Now list), `docs/ux-flows.md`, `docs/design-system.md`, `docs/architecture.md`  
**Output:** code only for the named item

```text
You are a senior full-stack engineer on Smart Prop Manager.

Implement ONLY this Now-roadmap item from docs/PRD.md:

"""
<PASTE ONE ITEM, e.g. Reminder failure: error detail + Retry on unit reminder rows>
"""

Follow docs/ux-flows.md and docs/design-system.md.
Use existing FastAPI routers and Next components; tokens only.
Do not expand scope to deferred gap-analysis items.
Do not restyle the whole app.

When done, summarize files changed and how to verify manually.
```

### Layout track (alternate STEP 6)

For spacing/chrome only, paste **one** prompt from [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md) instead of the block above.

---

## STEP 7 — Audit (QA / product auditor)

**Inputs:** running app, `docs/PRD.md`, `docs/design-system.md`, `docs/ux-flows.md`  
**Output:** `docs/product-audit.md` (+ refresh `docs/upgrade-prompts.md` Now list)

```text
You are a product QA auditor for Smart Prop Manager.

Against docs/PRD.md, docs/design-system.md, and docs/ux-flows.md, audit the
current app (desktop 1440 and mobile 390 where possible).

Check: auth OTP copy vs channel, onboarding Skip→visible property, empty states
(single CTA), unit payments reliability, manual form reset, receipt wording,
reminder failed→retry, settings loading, one theme + one Account control,
token compliance (no stray brand colors), marketing 720px container + alt rhythm.

Update docs/product-audit.md with pass/fail and action items.
Refresh the Now backlog in docs/upgrade-prompts.md from failing items only.

Do not implement fixes in this step unless asked.
```

---

## Suggested cadence

| Cadence | Action |
|---------|--------|
| Weekly | STEP 6 on highest-severity open Now item → STEP 7 delta |
| After competitor revisit | STEP 1 → STEP 2 only |
| After visual token change | STEP 3 + layout prompts |
| Before new domain (docs, fees, etc.) | Evidence in research → PRD Later→Now → STEPs 4–6 |

---

## Doc index

| Doc | Purpose |
|-----|---------|
| [`research.md`](research.md) | Benchmark synthesis |
| [`PRD.md`](PRD.md) | Requirements + roadmap |
| [`design-system.md`](design-system.md) | Tokens & UI rules |
| [`ux-flows.md`](ux-flows.md) | Flows & recovery |
| [`architecture.md`](architecture.md) | As-built system |
| [`product-audit.md`](product-audit.md) | Post-stage findings |
| [`upgrade-prompts.md`](upgrade-prompts.md) | Implementation backlog prompts |
| [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md) | Layout chrome prompts |
| [`gap-analysis.md`](gap-analysis.md) | Adopt / defer / skip table |
| [`../plans/spec.md`](../plans/spec.md) | Living initiative spec (ADLC-lite) |
| [`../plans/backlog.md`](../plans/backlog.md) | Dependency-ordered tasks |
| [`../CLAUDE.md`](../CLAUDE.md) | Always-on agent constraints |
| [`../scripts/check-green.ps1`](../scripts/check-green.ps1) | Local green gate (pytest + lint) |

---

## ADLC-lite (agent process)

Borrowed from the “process over prompts” workshop pattern — adapted for Cursor + this monorepo.

1. Update `plans/spec.md` / pick a `plans/backlog.md` task before multi-file work.
2. Implement with the `engineer` agent (or main agent following `CLAUDE.md`).
3. Run `.\scripts\check-green.ps1` (or targeted tests) before claiming done.
4. Use `reviewer` / `qa` agents for findings-only checks.
5. Keep `os-*` agents for Estate OS explorer only (`web/app/(design)/os-explorer/**`).

Do **not** enable unattended auto-merge loops on auth/money paths.
