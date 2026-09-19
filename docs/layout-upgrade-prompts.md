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

### Prompt 1.2 — Fixed gap under page headers ✅

In `web/app/globals.css`, keep `.dashboard-header { margin-bottom: 28px }`. Audit headers in `web/components/PropertiesDashboard.tsx`, `web/components/UnitPaymentsClient.tsx`, `web/components/UnitRemindersClient.tsx`, `web/components/SettingsPanel.tsx`, and dashboard list pages under `web/app/(dashboard)/payments/page.tsx` and `web/app/(dashboard)/reminders/page.tsx`. Ensure each uses `.dashboard-header` (or `.dashboard-header-row`) so the band before stats/forms/tables is always `28px`. No custom margin hacks.

**Done 2026-09-13:** listed page headers + AccountSettingsChrome use `.dashboard-header`; Messages publication actions lost inline `marginBottom`; unit maintenance/utilities cards use `.dashboard-header.dashboard-header-row` without custom bottom margin.

### Prompt 1.3 — Title + single muted subtitle ✅

On product screens, enforce `.page-title` + one `.page-subtitle` (`color: var(--muted)`) only — no third marketing paragraph in the header. Check `PropertiesDashboard`, unit payments/reminders clients, settings, and list pages. Keep copy short; Geist Sans; leave brand/logo alone.

**Done 2026-09-13:** Removed Phase/role kickers from Work orders, Gate codes, Team, Ops; folded breadcrumbs into the single subtitle on unit payments/reminders and tenancy dossier; trimmed Messages hub marketing aside.

### Prompt 1.4 — Form field stack rhythm ✅

Audit forms that use `.form-card` / `.form-field`: `web/components/NewPropertyForm.tsx`, `web/components/EditPropertyForm.tsx`, `web/components/AddUnitForm.tsx`, `web/components/EditUnitForm.tsx`, `web/components/OnboardingWizard.tsx`, `web/components/SettingsPanel.tsx`, manual payment form in `UnitPaymentsClient.tsx`, reminder form in `UnitRemindersClient.tsx`. Ensure vertical gap comes from `.form-card` (`gap: 16px`) and `.form-field` (`gap: 6px`). Inputs stay `--surface` / `--border` / radius `6px`. No extra spacer divs.

**Done 2026-09-14:** Listed property/unit/onboarding/settings/payments/reminders forms already used `.form-field`; fixed Expenses / Tasks / Publications to use `.form-field` + `.form-label` span; removed Settings notify `form-actions` margin hack.

### Prompt 1.5 — Shared horizontal edge for surface bands

On `PropertiesDashboard`, verify `.stat-row`, `.data-table-wrap`, and `.dashboard-checklist` align to the same content width as `.shell-content` with no negative margins or nested max-width that breaks the `32px` rhythm. Same check on payments/reminders list pages. Surfaces use `--surface` + `--border`.

**Done 2026-09-14:** Confirmed `.shell-content` is sole horizontal inset; `.dashboard` / `.stat-row` / `.data-table-wrap` / `.dashboard-checklist` use full width with `margin-inline: 0` (no nested page pads). Extended `.dashboard …` width guard in `globals.css` for fragment-unwrapped children on Properties, Payments, Reminders.

### Prompt 1.6 — Mobile inset without crushing card padding ✅

In `web/app/globals.css` `@media` blocks that touch `.shell-content`, tables, and auth, reduce horizontal page inset on small viewports but keep `.form-card` padding ≥ `22px` and `.dashboard-checklist` / `.onboarding-card` at `28px 24px`. Verify at ~390px width mentally against Properties, Payments, Reminders, Settings. Do not shrink button pad below `10px 16px` for header CTAs.

**Done 2026-09-14:** `--shell-inset` steps 32 → 24 (≤900px) → 16 (≤640px); `.form-card` / checklist / onboarding / empty / header CTAs re-assert desktop pad floors in both media blocks so page inset shrinks without crushing cards.

### Prompt 1.7 — Calm motion only ✅

Audit `web/components/RevealItem.tsx` and any product usage of scroll-reveal. Product shell (`.app-shell` in `globals.css`) must stay free of decorative shadows/background images (existing `box-shadow: none !important` guardrail). Prefer CSS hover/focus transitions on `.btn-primary`, `.btn-secondary`, `.nav-item` only. Do not add Framer/AOS-style scroll storytelling to dashboard screens. Marketing may keep its own motion in `web/app/(marketing)/`.

**Done 2026-09-14:** No Framer/AOS deps; dashboard has no scroll-reveal usage. Legacy `RevealItem.tsx` removed (replaced by marketing-only `MarketingReveal`). `.app-shell` keeps `box-shadow: none !important`, `background-image: none`, and a `.marketing-reveal` kill-switch; `MarketingReveal` also no-ops under `.app-shell`. Product motion stays CSS hover/focus on `.btn-*` / `.nav-item` (+ functional UI like loaders/toasts).

---



## 2. Card padding & surface discipline



### Prompt 2.1 — Forms/settings on surface cards ✅

Ensure interactive panels use `.form-card` (`background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 6px`, `padding: 22px`) in Settings (`SettingsPanel.tsx`), property/unit forms, and auth cards. No raw unbordered forms sitting on `--background` inside the dashboard shell.

**Done 2026-09-14:** Settings panels, New/Edit property & unit forms, and auth cards already use `.form-card` / `.form-card.auth-card`.

### Prompt 2.2 — Roomier onboarding / checklist pad ✅

Confirm `.onboarding-card` (`web/components/OnboardingWizard.tsx` + `web/app/onboarding/page.tsx`) and `.dashboard-checklist` (`PropertiesDashboard.tsx`) use `padding: 28px 24px` on `--surface` with `--border`. Do not reuse `.form-card`’s `22px` for these getting-started panels.

**Done 2026-09-14:** `.onboarding-card` and `.dashboard-checklist` both pad `28px 24px` in `globals.css`; wizard + Properties checklist use those classes.

### Prompt 2.3 — Empty states as surface cards ✅

Any full-page empty UI in the product should use `.dashboard-empty` (`--surface`, `--border`, `48px 24px`, radius `6px`). Audit property detail empty units (`web/app/(dashboard)/properties/[id]/page.tsx`) and any remaining bare empties. Title/copy use `.dashboard-empty-title` / `.dashboard-empty-copy` with `var(--muted)`.

**Done 2026-09-14:** Property detail empty units already used `.dashboard-empty`. Converted section empties on unit maintenance/utilities, Payment cards, tenancy dossier (no lease / no docs), and Messages publications tab.

### Prompt 2.4 — Tables inside bordered wraps ✅

Every product data table must sit in `.data-table-wrap` (`--surface`, `--border`, radius `6px`): PropertiesDashboard, UnitPaymentsClient, UnitRemindersClient, payments/reminders portfolio tables, Admin only if it already shares styles. No bare `<table class="data-table">` on `--background`.

**Done 2026-09-14:** Named Friday hubs and unit payment/reminder tables sit in `.data-table-wrap`.

### Prompt 2.5 — Compact stat cards ✅

Keep portfolio metrics as `.stat-row` > `.stat-block` (`padding: 16px 18px`, gap `16px`, `--surface`/`--border`). Values use `.mono-data` (JetBrains Mono). Do not enlarge stats into hero tiles or add a fourth metric without an explicit product decision.

**Done 2026-09-14:** PropertiesDashboard keeps three `.stat-block`s with `.mono-data` values; CSS pad/gap unchanged.

### Prompt 2.6 — No shadows/glow on product cards ✅

Preserve `.app-shell, .app-shell * { box-shadow: none !important; }` in `globals.css`. Remove any new product-card shadows, glows, or colored blurs. Autocomplete dropdowns outside the shell may keep functional elevation if required — do not weaken the shell guardrail.

**Done 2026-09-14:** Shell `box-shadow: none !important` + `background-image: none` guardrails intact; no new product card glows.

### Prompt 2.7 — Cards only for interaction or one job ✅

Audit Properties, Payments, Reminders, Settings for decorative card-in-card wrappers. A card should wrap a form, checklist, empty recovery, or table wrap — not every subtitle. Flatten unnecessary nested `--surface` boxes. Align with empty-state discipline in `[gap-analysis.md](gap-analysis.md)`.

**Done 2026-09-14:** Friday hubs already flat (stats/table/checklist only). Flattened nested `.form-card` forms inside unit maintenance/utilities cards to `.settings-inline-form`; Payment cards empty is a single `.dashboard-empty` surface (not nested inside `.form-card`).

---



## 3. Nav grouping



### Prompt 3.1 — Persistent primary nav ✅

In `web/components/AppShell.tsx`, keep a single `.sidebar` + `.sidebar-nav` on `--surface` with `--border`. Nav destinations must not reshuffle by route. Active state stays on `.nav-item`. Geist Sans labels; icons unchanged.

**Done 2026-09-14:** Single sidebar + static `NAV_PRIMARY` / `NAV_MORE`; no route-based reshuffle; `.nav-item` + Geist labels.

### Prompt 3.2 — Ship-only nav taxonomy ✅

Keep the intentional landlord rail in `AppShell.tsx` — do not invent Rentora Overview calendar or Fees/Documents/Inventory hubs. Document the list in a short code comment; no new routes in this pass.

**Primary:** Properties, Tenancies, Payments, Reminders, Messages, Applications, Work orders (+ Admin when allowed).  
**More:** Expenses, Reports, To-dos, Bulletin, Gate codes.  
**Settings:** account menu (not primary rail).

**Done 2026-09-14:** Re-spec’d from early four-hub draft to lived Nexora taxonomy; comments on `NAV_PRIMARY` / `NAV_MORE` match product.

### Prompt 3.3 — Active nav via `--accent` ✅

In `globals.css`, ensure `.nav-item` active/current styles use `var(--accent)` (background/text as already designed) — not a second color system. Verify against `/properties`, `/payments`, `/reminders`, `/settings` path matching in `AppShell.tsx`.

**Done 2026-09-14:** `.nav-item[data-active="true"]` / `[aria-current="page"]` use `--accent` only; `pathActive` covers Friday hubs and More destinations.

### Prompt 3.4 — One account/theme entry point ✅

Confirm Account and theme are only in `web/components/UserMenu.tsx` (`.shell-topbar`) and Appearance inside `SettingsPanel.tsx` via `ThemeToggle`. Remove any leftover duplicate Account link or theme control from the sidebar footer in `AppShell.tsx`.

**Done 2026-09-14:** Settings + Log out in `UserMenu`; Appearance via `ThemeToggle` in Settings; sidebar footer has collapse only.

### Prompt 3.5 — Sidebar footer: collapse (and logout if present) ✅

Keep collapse (and any sign-out) in the sidebar footer, visually separated from `.sidebar-nav` primary links (`globals.css` sidebar footer spacing). Do not interleave Logout between Properties/Payments.

**Done 2026-09-14:** `.sidebar-footer` = collapse control only; logout stays in account menu.

### Prompt 3.6 — No global Search (guardrail) ✅

Do **not** add a header Search control. Gap-analysis defers global search. If any Search UI was introduced in the product shell, remove it. Header stays user menu (+ existing icons only).

**Done 2026-09-14:** `ShellTopbar` utilities = Notifications + Help only; no Search control.

### Prompt 3.7 — No parallel fee/inventory nav (guardrail) ✅

Do **not** add top-level landlord hubs for Fees, Documents, or Inventory. Tenancies stays on primary as the lease list (unit-centric money path still starts from Properties/Payments). No Rentora Overview calendar. Refuse new parallel inventory-style rails in this pass.

**Done 2026-09-14:** No Fees / Documents / Inventory on landlord rail; Tenancies documented as intentional primary (see 3.2).

### Prompt 3.8 — Collapsed sidebar usability ✅

Verify `data-sidebar-collapsed` behavior in `web/lib/sidebar.ts` + `AppShell.tsx` + `globals.css` (width `64px`). Icons remain visible and tappable; labels may hide. Brand mark behavior stays Smart Prop (no Rentora logo).

**Done 2026-09-14:** Collapsed rail `64px` with icon-only nav + tooltips; `BrandMark` + `BRAND_NAME`; persistence via `sidebar.ts`.

---



## 4. Empty-state discipline



### Prompt 4.1 — Short empty copy ✅

Audit empty UIs (`.dashboard-empty`, property “No units yet”, reminders empty). Copy = short title + one muted sentence (`.dashboard-empty-title` / `.dashboard-empty-copy`, `var(--muted)`). Cut essay-length explanations.

**Done 2026-09-14:** Shortened empty copy across More-rail, Friday hubs, unit cards, Ops overdue, and Payment cards.

### Prompt 4.2 — Single primary CTA in empty surfaces ✅

Each `.dashboard-empty` (and equivalent) gets exactly one `.btn-primary` (or one checklist as the action surface). Remove secondary competing buttons from the empty card itself. Header-level actions outside the empty card are OK if they don’t duplicate the same job.

**Done 2026-09-14:** Removed dual CTAs inside empties (Tenancies, Ops overdue, Payments filter/money-in); Reminders caught-up uses one `.btn-primary`.

### Prompt 4.3 — Zero-units checklist ✅

Confirm `PropertiesDashboard.tsx` shows `.dashboard-checklist` on `--surface` when `unitCount === 0`, with steps Add your first property → Add a unit → Record your first payment. Not a bare “No units” void. Checklist pad `28px 24px`; complete dots use `--accent`.

**Done 2026-09-14:** Getting-started checklist when incomplete (covers zero units); three steps; CSS pad `28px 24px`; accent step dots.

### Prompt 4.4 — Checklist link vs checkmark states ✅

In `GettingStartedChecklist` inside `PropertiesDashboard.tsx`, incomplete items use `.dashboard-checklist-link`; complete items show ✓ in `.onboarding-step-dot` + `.dashboard-checklist-label`. Payment step links only when a unit exists. Match onboarding step-dot styling in `globals.css`.

**Done 2026-09-14:** Incomplete → link; complete → ✓ + label; payment `href` only when `firstUnitId` set.

### Prompt 4.5 — In-table empty cells ✅

Where tables render empty bodies, use `<td className="table-empty">` with `color: var(--muted)`, centered. Audit UnitPaymentsClient, UnitRemindersClient, and any portfolio tables still using ad-hoc empty rows.

**Done 2026-09-14:** Empty bodies use `table-empty` on PropertiesDashboard, Reminders Action needed, TenanciesListClient; UnitPaymentsClient already used `table-empty`.

### Prompt 4.6 — FetchErrorState parity ✅

Harden `web/components/FetchErrorState.tsx` and call sites (`payments/[unitId]/page.tsx`, `payments/[unitId]/error.tsx`, `reminders/[unitId]/page.tsx`, Settings). Pattern: short `.page-title` + muted `.page-subtitle` + one `.btn-primary` Retry. No dual CTAs.

**Done 2026-09-14:** `FetchErrorState` is title + muted reason + one Retry; wired on unit payments/reminders pages+errors and Settings.

### Prompt 4.7 — Reminder failure row recovery ✅

In `UnitRemindersClient.tsx`, failed/skipped rows show `error_detail` in `.reminder-error-detail` (`color: var(--muted)`) and a compact **Retry** via `.btn-secondary.btn-table-cta`. Do not escalate row failures into a full-page empty state. Wire stays on `retryReminder` in `web/lib/api.ts`.

**Done 2026-09-14:** Row-scoped error detail + Retry via `retryReminder`; full-empty stays `.dashboard-empty`.

### Prompt 4.8 — Zero-unit properties stay visible ✅

When the dashboard has units elsewhere (checklist hidden), properties with `needsUnit` still appear as table rows with Add unit CTA (`PropertiesDashboard.tsx` + `web/lib/dashboard.ts`). Never drop unit-less properties from the list after Skip. Use `--muted` for “No units yet” hints; actions use `.btn-secondary.btn-table-cta` / `.table-link`.

**Done 2026-09-14:** `dashboard.ts` still appends `needsUnit` rows; muted empty hint; Add unit is `.btn-secondary.btn-table-cta`.

---



## 5. CTA placement hierarchy



### Prompt 5.1 — Primary = most likely landlord job ✅

Across product headers, ensure the single most likely next action uses `.btn-primary` (`background: var(--accent)`, pad `10px 16px`, radius `6px`). Examples: Add property, Send Reminder, Save. Geist Sans labels.

**Done 2026-09-14:** Headers/forms use `.btn-primary` for the main job (Add property, Send Reminder, Save payment / Update).

### Prompt 5.2 — Secondary as outline alternate ✅

Alternate actions use `.btn-secondary` (`--surface`, `--border`, `--ink`) — not a second filled `--accent` button. Audit header pairs and form Cancel buttons.

**Done 2026-09-14:** Chase / Paystack alternates use `.btn-secondary`; form Cancel stays secondary.

### Prompt 5.3 — Tertiary as text links ✅

Table/menu alternatives use `.table-link` or `.auth-alt-link` — not a third button variant. Audit Edit unit / Edit property links in `PropertiesDashboard.tsx` and auth footers in `LoginForm.tsx` / `SignupForm.tsx`.

**Done 2026-09-14:** Edit links = `.table-link`; Login/Signup alts = `.auth-alt-link` (Signup topbar Sign in demoted from `.btn-secondary`).

### Prompt 5.4 — Header action order ✅

In `.dashboard-header-actions` (`gap: 10px`), place secondary to the left and primary rightmost (or sole). Check PropertiesDashboard (Add unit / Add property) and similar headers.

**Done 2026-09-14:** Secondary left, primary rightmost on Properties and unit payments headers.

### Prompt 5.5 — Form footer order ✅

In `.form-actions` / `.form-actions-split`, Cancel or secondary comes before primary submit. Audit property/unit forms, onboarding actions (`OnboardingWizard.tsx`), manual payment, reminder send, settings save.

**Done 2026-09-14:** Form footers Cancel→Save; Login MFA Back→Verify. Onboarding keeps Continue as full-width primary above Back link (column layout).

### Prompt 5.6 — Unit payments CTA hierarchy ✅

In `web/components/UnitPaymentsClient.tsx`, keep **Record Manual Payment** as `.btn-primary` and **Pay with Paystack** as `.btn-secondary` (cash-landlord emphasis per gap-analysis). Do not invert hierarchy.

**Done 2026-09-14:** Manual = primary; Paystack = `.btn-secondary` (was outline).

### Prompt 5.7 — Compact table CTAs ✅

Row actions (Add unit, Retry, Load more alternatives in cells) use `.btn-table-cta` (`padding: 6px 10px`) with `.btn-secondary` where appropriate — not full header-sized `.btn-primary` in every cell. Audit PropertiesDashboard and UnitRemindersClient.

**Done 2026-09-14:** needsUnit Add unit, Start tenancy, Record payment, and reminder Retry use `.btn-secondary.btn-table-cta`.

### Prompt 5.8 — One primary per section ✅

Scan each product viewport section for multiple `.btn-primary` competing for the same decision. Collapse to one primary job per section (header vs form vs empty card). Empty card primary and header primary for the *same* action should not both show when empty (see reminders empty pattern).

**Done 2026-09-14:** Unit payments: sole header primary for Record Manual; cycle block demoted to secondary; empty log points at header CTA (no second primary).

---



## 6. Information density



### Prompt 6.1 — List page structure ✅

Standardize list pages to: `.page-title` + `.page-subtitle` → optional `.stat-row` → one `.data-table-wrap`. Apply to Properties (`PropertiesDashboard`), Payments list (`web/app/(dashboard)/payments/page.tsx`), Reminders list (`web/app/(dashboard)/reminders/page.tsx`). No extra widget columns.

**Done 2026-09-15:** Properties / Payments / Reminders stay title → optional stats → optional filter/status → one table wrap (no widget columns). Payments overdue+failed collapsed to a single status band.

### Prompt 6.2 — Three portfolio stats max ✅

Keep exactly three portfolio metrics: Total Collected, Outstanding, Units Overdue in `PropertiesDashboard` / `buildDashboard` stats. Do not add Rentora Pending/Sent/Total. Values stay `.mono-data` (JetBrains Mono).

**Done 2026-09-15:** Exactly three stats in PropertiesDashboard + `buildDashboard` / `buildDashboardFromPortfolio`; values use `.mono-data`.

### Prompt 6.3 — Scannable table columns ✅

Keep Properties table columns to identity · tenant · rent · due · status · actions. Do not dump tenant contact, notification channel, or notes into the portfolio table — those belong on unit/payment/reminder detail pages. Cell padding stays per `.data-table` in `globals.css`.

**Done 2026-09-15:** Properties columns Unit · Tenant · Rent · Due Date · Status · Actions only.

### Prompt 6.4 — Mono for money and dates ✅

Ensure all rent amounts, payment amounts, due dates, and sent-at timestamps in product tables/stats use `.mono-data` (JetBrains Mono / `--font-mono-data`). Audit PropertiesDashboard, UnitPaymentsClient, UnitRemindersClient, payments/reminders lists.

**Done 2026-09-15:** Cycle due dates in UnitPaymentsClient and SC subline under rent in PropertiesDashboard use `.mono-data`; tables/stats already mono elsewhere.

### Prompt 6.5 — Compact status badges ✅

Status remains `.status-badge` with paid/pending/overdue (and NO UNIT) tones using `--accent` / `--muted` / `--alert` as designed — not paragraph status text. Do not invent new badge color systems.

**Done 2026-09-15:** Portfolio and unit hubs use `.status-badge` tones only (including NO UNIT).

### Prompt 6.6 — Settings as sectioned hub ✅

Keep `SettingsPanel.tsx` within `.settings-page` (max-width `560px`) and `.settings-tabs`. Profile / Notifications / Security (or equivalent) as tabs/blocks — not one endless undifferentiated form. Panels use `.form-card` on `--surface`.

**Done 2026-09-15:** `AccountSettingsChrome` provides `.settings-page` + tabs; Settings panels are `.form-card` tabpanels.

### Prompt 6.7 — Unit detail hub chrome ✅

On `UnitPaymentsClient.tsx` and `UnitRemindersClient.tsx`, keep `.form-kicker` (`color: var(--muted)`) as `property · unit` above `.page-title`, header CTA, then log/table below. Match Rentora hub clarity mapped to **unit**, not tenancy entity.

**Done 2026-09-15:** Both unit hubs show `.form-kicker` (`property · unit`) above title; subtitle is short job copy only.

### Prompt 6.8 — No Overview calendar/widgets (guardrail) ✅

Do **not** add a Rentora-style Overview calendar, task board, or multi-column widget hub to Properties. Stay unit-centric list + checklist for v1 per gap-analysis.

**Done 2026-09-15:** Properties stays list + checklist + filters; no Overview calendar/widgets.

---



## 7. First-run & hub structure



### Prompt 7.1 — Wizard/checklist, never paywall ✅

Protect first-run: `web/app/onboarding/page.tsx` + `OnboardingWizard.tsx` and/or `.dashboard-checklist` only. Do not add subscription gates before first property. Free path stays open.

**Done 2026-09-15:** Onboarding wizard + Properties `.dashboard-checklist` only; no subscription/paywall before first property.

### Prompt 7.2 — Shared step-dot language ✅

Onboarding steps in `OnboardingWizard.tsx` and dashboard checklist in `PropertiesDashboard.tsx` must share `.onboarding-step-dot` + `data-state` complete/active/upcoming styles from `globals.css` (`--accent` when complete/active, `--border`/`--muted` when upcoming).

**Done 2026-09-15:** Shared classes/`data-state`; wizard complete steps render `✓` like the Properties checklist.

### Prompt 7.3 — Unit page answers four questions ✅

For unit payments and unit reminders pages: (1) what is this (kicker + title), (2) what’s next (header CTA), (3) what’s the log (table), (4) recovery (empty/error/retry). Restructure copy/layout only if something is missing — no new entities.

**Done 2026-09-15:** Both unit hubs have kicker+title, header CTA, log/table, and recovery (`table-empty` / `.dashboard-empty` + `.form-error`). No layout restructure needed.

### Prompt 7.4 — Create success returns to a visible hub ✅

After property/unit create (forms + onboarding Skip), land on a hub where the new property/unit is visible — including zero-unit properties via `buildDashboard` / PropertiesDashboard. Fix any redirect that orphans a new property.

**Done 2026-09-15:** Unit create → `?highlight=`; onboarding Skip → `?highlightProperty=`; zero-unit rows via `needsUnit` / `buildDashboard`.

---



## 8. Auth & marketing shells



### Prompt 8.1 — Auth centered card pattern ✅

Keep login/signup/reset on centered `.auth-page` / `.auth-panel` with `.form-card.auth-card`, one `.btn-primary` submit, tertiary `.auth-alt-link`s. Files: `web/app/login/page.tsx`, `web/app/signup/page.tsx`, `LoginForm.tsx`, `SignupForm.tsx`, `PhoneOtpFlow.tsx`. Tokens: `--surface`, `--border`, `--accent`. Geist Sans.

**Done 2026-09-15:** Login/forgot/reset use `.auth-page` + `.auth-panel` + `.form-card.auth-card`; signup uses `.auth-page--signup` + auth cards; one primary submit and `.auth-alt-link` tertiary links.

### Prompt 8.2 — OTP channel copy from env ✅

Ensure all login/signup/OTP user-facing channel names go through `web/lib/auth-otp-channel.ts` (`authOtpChannelLabel` / `getAuthOtpChannel`) driven by `NEXT_PUBLIC_AUTH_OTP_CHANNEL`. Subtitles stay `.page-subtitle` / `.form-help` with `var(--muted)`. No hardcoded “SMS”/“WhatsApp” in auth screens.

**Done 2026-09-15:** PhoneOtpFlow delivery failure and SignupForm invite copy use `authOtpChannelLabel()`; tenant preview is channel-neutral.

### Prompt 8.3 — Marketing ≠ product density ✅

Do not copy marketing section padding/hero rhythm from `web/app/(marketing)/page.tsx` / marketing CSS into `.app-shell` / `.shell-content`. Product stays denser (`32px` inset, `6px` radius cards). Marketing may keep its own scale; no shared accidental regression.

**Done 2026-09-15:** `.app-shell` / `.shell-content` keep `--shell-inset` (32px); `--marketing-*` stays under `.marketing` only.

---



## Quick batch (optional meta-prompt) ✅

Only use after individual prompts above are done:

> Walk `docs/layout-parity-checklist.md` “Quick review pass” against Properties, Payments (list + unit), Reminders (list + unit), Settings, Onboarding, and Auth. Fix only remaining token/class mismatches. Do not change palette away from `--accent` forest green; keep Geist Sans + JetBrains Mono (`.mono-data`); do not borrow Rentora blue, fonts, or logo.

**Done 2026-09-15:** Quick review pass checked off. Payments Chase/table Record payment CTA leftovers fixed; nav checklist wording updated to primary + More; no further token/class mismatches on walked surfaces.

---



## Related

- Checklist: `[layout-parity-checklist.md](layout-parity-checklist.md)`  
- Product gaps: `[gap-analysis.md](gap-analysis.md)`  
- Deferred features: `[upgrade-prompts.md](upgrade-prompts.md)`

