# Layout upgrade prompts

**Source checklist:** `[layout-parity-checklist.md](layout-parity-checklist.md)`  
**Do not implement from this file in bulk** — paste **one prompt at a time** into Cursor.  
**Hard rules for every prompt:** use existing tokens `--accent`, `--surface`, `--border`, `--ink`, `--muted`, `--background`, `--alert`; body UI stays **Geist Sans** (`--font-geist-sans` from `web/app/layout.tsx`); amounts/dates use **JetBrains Mono** via `.mono-data` (`--font-mono-data`). Never introduce Rentora blue, Noto/Nunito, or their logo.

---

## How to use

1. Open the matching files listed in the prompt.
2. Paste the full prompt into Cursor Agent.
3. Prefer CSS in `web/app/globals.css` + existing class names over new one-off styles.
4. Skip marketing-only work unless the prompt says otherwise.
5. Phase-2 product features remain in `[upgrade-prompts.md](upgrade-prompts.md)` — this file is layout/UX parity only.

---



## 1. Spacing rhythm



### Prompt 1.1 — Consistent shell content inset

**Status (2026-08-09):** verified — dashboard routes use `.dashboard` / `.form-page` under `.shell-content` with no competing horizontal page pads.

Audit every product page under `web/app/(dashboard)/` and the shell in `web/components/AppShell.tsx`. Ensure main content only relies on `.shell-content` padding (`32px` in `web/app/globals.css`) on `--background`. Remove ad-hoc page wrappers that add competing `16px` / `24px` / `40px` horizontal padding inside the shell. Do not change auth (`.auth-page`) or marketing layouts. Keep Geist Sans for UI text.

### Prompt 1.2 — Fixed gap under page headers

In `web/app/globals.css`, keep `.dashboard-header { margin-bottom: 28px }`. Audit headers in `web/components/PropertiesDashboard.tsx`, `web/components/UnitPaymentsClient.tsx`, `web/components/UnitRemindersClient.tsx`, `web/components/SettingsPanel.tsx`, and dashboard list pages under `web/app/(dashboard)/payments/page.tsx` and `web/app/(dashboard)/reminders/page.tsx`. Ensure each uses `.dashboard-header` (or `.dashboard-header-row`) so the band before stats/forms/tables is always `28px`. No custom margin hacks.

### Prompt 1.3 — Title + single muted subtitle

On product screens, enforce `.page-title` + one `.page-subtitle` (`color: var(--muted)`) only — no third marketing paragraph in the header. Check `PropertiesDashboard`, unit payments/reminders clients, settings, and list pages. Keep copy short; Geist Sans; leave brand/logo alone.

### Prompt 1.4 — Form field stack rhythm

Audit forms that use `.form-card` / `.form-field`: `web/components/NewPropertyForm.tsx`, `web/components/EditPropertyForm.tsx`, `web/components/AddUnitForm.tsx`, `web/components/EditUnitForm.tsx`, `web/components/OnboardingWizard.tsx`, `web/components/SettingsPanel.tsx`, manual payment form in `UnitPaymentsClient.tsx`, reminder form in `UnitRemindersClient.tsx`. Ensure vertical gap comes from `.form-card` (`gap: 16px`) and `.form-field` (`gap: 6px`). Inputs stay `--surface` / `--border` / radius `6px`. No extra spacer divs.

### Prompt 1.5 — Shared horizontal edge for surface bands

On `PropertiesDashboard`, verify `.stat-row`, `.data-table-wrap`, and `.dashboard-checklist` align to the same content width as `.shell-content` with no negative margins or nested max-width that breaks the `32px` rhythm. Same check on payments/reminders list pages. Surfaces use `--surface` + `--border`.

### Prompt 1.6 — Mobile inset without crushing card padding

In `web/app/globals.css` `@media` blocks that touch `.shell-content`, tables, and auth, reduce horizontal page inset on small viewports but keep `.form-card` padding ≥ `22px` and `.dashboard-checklist` / `.onboarding-card` at `28px 24px`. Verify at ~390px width mentally against Properties, Payments, Reminders, Settings. Do not shrink button pad below `10px 16px` for header CTAs.

### Prompt 1.7 — Calm motion only

Audit `web/components/RevealItem.tsx` and any product usage of scroll-reveal. Product shell (`.app-shell` in `globals.css`) must stay free of decorative shadows/background images (existing `box-shadow: none !important` guardrail). Prefer CSS hover/focus transitions on `.btn-primary`, `.btn-secondary`, `.nav-item` only. Do not add Framer/AOS-style scroll storytelling to dashboard screens. Marketing may keep its own motion in `web/app/(marketing)/`.

---



## 2. Card padding & surface discipline



### Prompt 2.1 — Forms/settings on surface cards

Ensure interactive panels use `.form-card` (`background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 6px`, `padding: 22px`) in Settings (`SettingsPanel.tsx`), property/unit forms, and auth cards. No raw unbordered forms sitting on `--background` inside the dashboard shell.

### Prompt 2.2 — Roomier onboarding / checklist pad

Confirm `.onboarding-card` (`web/components/OnboardingWizard.tsx` + `web/app/onboarding/page.tsx`) and `.dashboard-checklist` (`PropertiesDashboard.tsx`) use `padding: 28px 24px` on `--surface` with `--border`. Do not reuse `.form-card`’s `22px` for these getting-started panels.

### Prompt 2.3 — Empty states as surface cards

Any full-page empty UI in the product should use `.dashboard-empty` (`--surface`, `--border`, `48px 24px`, radius `6px`). Audit property detail empty units (`web/app/(dashboard)/properties/[id]/page.tsx`) and any remaining bare empties. Title/copy use `.dashboard-empty-title` / `.dashboard-empty-copy` with `var(--muted)`.

### Prompt 2.4 — Tables inside bordered wraps

Every product data table must sit in `.data-table-wrap` (`--surface`, `--border`, radius `6px`): PropertiesDashboard, UnitPaymentsClient, UnitRemindersClient, payments/reminders portfolio tables, Admin only if it already shares styles. No bare `<table class="data-table">` on `--background`.

### Prompt 2.5 — Compact stat cards

Keep portfolio metrics as `.stat-row` > `.stat-block` (`padding: 16px 18px`, gap `16px`, `--surface`/`--border`). Values use `.mono-data` (JetBrains Mono). Do not enlarge stats into hero tiles or add a fourth metric without an explicit product decision.

### Prompt 2.6 — No shadows/glow on product cards

Preserve `.app-shell, .app-shell * { box-shadow: none !important; }` in `globals.css`. Remove any new product-card shadows, glows, or colored blurs. Autocomplete dropdowns outside the shell may keep functional elevation if required — do not weaken the shell guardrail.

### Prompt 2.7 — Cards only for interaction or one job

Audit Properties, Payments, Reminders, Settings for decorative card-in-card wrappers. A card should wrap a form, checklist, empty recovery, or table wrap — not every subtitle. Flatten unnecessary nested `--surface` boxes. Align with empty-state discipline in `[gap-analysis.md](gap-analysis.md)`.

---



## 3. Nav grouping



### Prompt 3.1 — Persistent primary nav

In `web/components/AppShell.tsx`, keep a single `.sidebar` + `.sidebar-nav` on `--surface` with `--border`. Nav destinations must not reshuffle by route. Active state stays on `.nav-item`. Geist Sans labels; icons unchanged.

### Prompt 3.2 — Ship-only nav taxonomy

Keep primary items exactly: Properties, Payments, Reminders, Settings (plus Admin when allowed). Do not add Rentora items (Tenancies, Fees, References, Tasks, etc.). Document the intentional list in a short code comment only if helpful — no new routes.

### Prompt 3.3 — Active nav via `--accent`

In `globals.css`, ensure `.nav-item` active/current styles use `var(--accent)` (background/text as already designed) — not a second color system. Verify against `/properties`, `/payments`, `/reminders`, `/settings` path matching in `AppShell.tsx`.

### Prompt 3.4 — One account/theme entry point

Confirm Account and theme are only in `web/components/UserMenu.tsx` (`.shell-topbar`) and Appearance inside `SettingsPanel.tsx` via `ThemeToggle`. Remove any leftover duplicate Account link or theme control from the sidebar footer in `AppShell.tsx`.

### Prompt 3.5 — Sidebar footer: collapse (and logout if present)

Keep collapse (and any sign-out) in the sidebar footer, visually separated from `.sidebar-nav` primary links (`globals.css` sidebar footer spacing). Do not interleave Logout between Properties/Payments.

### Prompt 3.6 — No global Search (guardrail)

Do **not** add a header Search control. Gap-analysis defers global search. If any Search UI was introduced in the product shell, remove it. Header stays user menu (+ existing icons only).

### Prompt 3.7 — No parallel tenancy/fee/inventory nav (guardrail)

Do **not** add sidebar entries or top-level hubs for Tenancies, Fees, Documents, or Inventory. Stay unit-centric per `[gap-analysis.md](gap-analysis.md)`. Refuse scope creep in this pass.

### Prompt 3.8 — Collapsed sidebar usability

Verify `data-sidebar-collapsed` behavior in `web/lib/sidebar.ts` + `AppShell.tsx` + `globals.css` (width `64px`). Icons remain visible and tappable; labels may hide. Brand mark behavior stays Smart Prop (no Rentora logo).

---



## 4. Empty-state discipline



### Prompt 4.1 — Short empty copy

Audit empty UIs (`.dashboard-empty`, property “No units yet”, reminders empty). Copy = short title + one muted sentence (`.dashboard-empty-title` / `.dashboard-empty-copy`, `var(--muted)`). Cut essay-length explanations.

### Prompt 4.2 — Single primary CTA in empty surfaces

Each `.dashboard-empty` (and equivalent) gets exactly one `.btn-primary` (or one checklist as the action surface). Remove secondary competing buttons from the empty card itself. Header-level actions outside the empty card are OK if they don’t duplicate the same job.

### Prompt 4.3 — Zero-units checklist

Confirm `PropertiesDashboard.tsx` shows `.dashboard-checklist` on `--surface` when `unitCount === 0`, with steps Add your first property → Add a unit → Record your first payment. Not a bare “No units” void. Checklist pad `28px 24px`; complete dots use `--accent`.

### Prompt 4.4 — Checklist link vs checkmark states

In `GettingStartedChecklist` inside `PropertiesDashboard.tsx`, incomplete items use `.dashboard-checklist-link`; complete items show ✓ in `.onboarding-step-dot` + `.dashboard-checklist-label`. Payment step links only when a unit exists. Match onboarding step-dot styling in `globals.css`.

### Prompt 4.5 — In-table empty cells

Where tables render empty bodies, use `<td className="table-empty">` with `color: var(--muted)`, centered. Audit UnitPaymentsClient, UnitRemindersClient, and any portfolio tables still using ad-hoc empty rows.

### Prompt 4.6 — FetchErrorState parity

Harden `web/components/FetchErrorState.tsx` and call sites (`payments/[unitId]/page.tsx`, `payments/[unitId]/error.tsx`, `reminders/[unitId]/page.tsx`, Settings). Pattern: short `.page-title` + muted `.page-subtitle` + one `.btn-primary` Retry. No dual CTAs.

### Prompt 4.7 — Reminder failure row recovery

In `UnitRemindersClient.tsx`, failed/skipped rows show `error_detail` in `.reminder-error-detail` (`color: var(--muted)`) and a compact **Retry** via `.btn-secondary.btn-table-cta`. Do not escalate row failures into a full-page empty state. Wire stays on `retryReminder` in `web/lib/api.ts`.

### Prompt 4.8 — Zero-unit properties stay visible

When the dashboard has units elsewhere (checklist hidden), properties with `needsUnit` still appear as table rows with Add unit CTA (`PropertiesDashboard.tsx` + `web/lib/dashboard.ts`). Never drop unit-less properties from the list after Skip. Use `--muted` for “No units yet” hints; actions use `.btn-secondary.btn-table-cta` / `.table-link`.

---



## 5. CTA placement hierarchy



### Prompt 5.1 — Primary = most likely landlord job

Across product headers, ensure the single most likely next action uses `.btn-primary` (`background: var(--accent)`, pad `10px 16px`, radius `6px`). Examples: Add property, Send Reminder, Save. Geist Sans labels.

### Prompt 5.2 — Secondary as outline alternate

Alternate actions use `.btn-secondary` (`--surface`, `--border`, `--ink`) — not a second filled `--accent` button. Audit header pairs and form Cancel buttons.

### Prompt 5.3 — Tertiary as text links

Table/menu alternatives use `.table-link` or `.auth-alt-link` — not a third button variant. Audit Edit unit / Edit property links in `PropertiesDashboard.tsx` and auth footers in `LoginForm.tsx` / `SignupForm.tsx`.

### Prompt 5.4 — Header action order

In `.dashboard-header-actions` (`gap: 10px`), place secondary to the left and primary rightmost (or sole). Check PropertiesDashboard (Add unit / Add property) and similar headers.

### Prompt 5.5 — Form footer order

In `.form-actions` / `.form-actions-split`, Cancel or secondary comes before primary submit. Audit property/unit forms, onboarding actions (`OnboardingWizard.tsx`), manual payment, reminder send, settings save.

### Prompt 5.6 — Unit payments CTA hierarchy

In `web/components/UnitPaymentsClient.tsx`, keep **Record Manual Payment** as `.btn-primary` and **Pay with Paystack** as `.btn-secondary` (cash-landlord emphasis per gap-analysis). Do not invert hierarchy.

### Prompt 5.7 — Compact table CTAs

Row actions (Add unit, Retry, Load more alternatives in cells) use `.btn-table-cta` (`padding: 6px 10px`) with `.btn-secondary` where appropriate — not full header-sized `.btn-primary` in every cell. Audit PropertiesDashboard and UnitRemindersClient.

### Prompt 5.8 — One primary per section

Scan each product viewport section for multiple `.btn-primary` competing for the same decision. Collapse to one primary job per section (header vs form vs empty card). Empty card primary and header primary for the *same* action should not both show when empty (see reminders empty pattern).

---



## 6. Information density



### Prompt 6.1 — List page structure

Standardize list pages to: `.page-title` + `.page-subtitle` → optional `.stat-row` → one `.data-table-wrap`. Apply to Properties (`PropertiesDashboard`), Payments list (`web/app/(dashboard)/payments/page.tsx`), Reminders list (`web/app/(dashboard)/reminders/page.tsx`). No extra widget columns.

### Prompt 6.2 — Three portfolio stats max

Keep exactly three portfolio metrics: Total Collected, Outstanding, Units Overdue in `PropertiesDashboard` / `buildDashboard` stats. Do not add Rentora Pending/Sent/Total. Values stay `.mono-data` (JetBrains Mono).

### Prompt 6.3 — Scannable table columns

Keep Properties table columns to identity · tenant · rent · due · status · actions. Do not dump tenant contact, notification channel, or notes into the portfolio table — those belong on unit/payment/reminder detail pages. Cell padding stays per `.data-table` in `globals.css`.

### Prompt 6.4 — Mono for money and dates

Ensure all rent amounts, payment amounts, due dates, and sent-at timestamps in product tables/stats use `.mono-data` (JetBrains Mono / `--font-mono-data`). Audit PropertiesDashboard, UnitPaymentsClient, UnitRemindersClient, payments/reminders lists.

### Prompt 6.5 — Compact status badges

Status remains `.status-badge` with paid/pending/overdue (and NO UNIT) tones using `--accent` / `--muted` / `--alert` as designed — not paragraph status text. Do not invent new badge color systems.

### Prompt 6.6 — Settings as sectioned hub

Keep `SettingsPanel.tsx` within `.settings-page` (max-width `560px`) and `.settings-tabs`. Profile / Notifications / Security (or equivalent) as tabs/blocks — not one endless undifferentiated form. Panels use `.form-card` on `--surface`.

### Prompt 6.7 — Unit detail hub chrome

On `UnitPaymentsClient.tsx` and `UnitRemindersClient.tsx`, keep `.form-kicker` (`color: var(--muted)`) as `property · unit` above `.page-title`, header CTA, then log/table below. Match Rentora hub clarity mapped to **unit**, not tenancy entity.

### Prompt 6.8 — No Overview calendar/widgets (guardrail)

Do **not** add a Rentora-style Overview calendar, task board, or multi-column widget hub to Properties. Stay unit-centric list + checklist for v1 per gap-analysis.

---



## 7. First-run & hub structure



### Prompt 7.1 — Wizard/checklist, never paywall

Protect first-run: `web/app/onboarding/page.tsx` + `OnboardingWizard.tsx` and/or `.dashboard-checklist` only. Do not add subscription gates before first property. Free path stays open.

### Prompt 7.2 — Shared step-dot language

Onboarding steps in `OnboardingWizard.tsx` and dashboard checklist in `PropertiesDashboard.tsx` must share `.onboarding-step-dot` + `data-state` complete/active/upcoming styles from `globals.css` (`--accent` when complete/active, `--border`/`--muted` when upcoming).

### Prompt 7.3 — Unit page answers four questions

For unit payments and unit reminders pages: (1) what is this (kicker + title), (2) what’s next (header CTA), (3) what’s the log (table), (4) recovery (empty/error/retry). Restructure copy/layout only if something is missing — no new entities.

### Prompt 7.4 — Create success returns to a visible hub

After property/unit create (forms + onboarding Skip), land on a hub where the new property/unit is visible — including zero-unit properties via `buildDashboard` / PropertiesDashboard. Fix any redirect that orphans a new property.

---



## 8. Auth & marketing shells



### Prompt 8.1 — Auth centered card pattern

Keep login/signup/reset on centered `.auth-page` / `.auth-panel` with `.form-card.auth-card`, one `.btn-primary` submit, tertiary `.auth-alt-link`s. Files: `web/app/login/page.tsx`, `web/app/signup/page.tsx`, `LoginForm.tsx`, `SignupForm.tsx`, `PhoneOtpFlow.tsx`. Tokens: `--surface`, `--border`, `--accent`. Geist Sans.

### Prompt 8.2 — OTP channel copy from env

Ensure all login/signup/OTP user-facing channel names go through `web/lib/auth-otp-channel.ts` (`authOtpChannelLabel` / `getAuthOtpChannel`) driven by `NEXT_PUBLIC_AUTH_OTP_CHANNEL`. Subtitles stay `.page-subtitle` / `.form-help` with `var(--muted)`. No hardcoded “SMS”/“WhatsApp” in auth screens.

### Prompt 8.3 — Marketing ≠ product density

Do not copy marketing section padding/hero rhythm from `web/app/(marketing)/page.tsx` / marketing CSS into `.app-shell` / `.shell-content`. Product stays denser (`32px` inset, `6px` radius cards). Marketing may keep its own scale; no shared accidental regression.

---



## Quick batch (optional meta-prompt)

Only use after individual prompts above are done:

> Walk `docs/layout-parity-checklist.md` “Quick review pass” against Properties, Payments (list + unit), Reminders (list + unit), Settings, Onboarding, and Auth. Fix only remaining token/class mismatches. Do not change palette away from `--accent` forest green; keep Geist Sans + JetBrains Mono (`.mono-data`); do not borrow Rentora blue, fonts, or logo.

---



## Related

- Checklist: `[layout-parity-checklist.md](layout-parity-checklist.md)`  
- Product gaps: `[gap-analysis.md](gap-analysis.md)`  
- Deferred features: `[upgrade-prompts.md](upgrade-prompts.md)`

