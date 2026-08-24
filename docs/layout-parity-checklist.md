# Layout parity checklist — Rentora structure → Smart Prop tokens

**Sources:** [`rentora-audit.md`](rentora-audit.md) · [`rentora-authenticated-audit.md`](rentora-authenticated-audit.md) · [`rentora-demo-audit.md`](rentora-demo-audit.md) · [`gap-analysis.md`](gap-analysis.md)  
**Token source of truth:** `web/app/globals.css` (`:root` / `html[data-theme="dark"]`)  
**Compiled:** 2026-08-02  

---

## Scope

Use this checklist when reviewing or adjusting **product** layout/UX so Smart Prop feels as ordered and scannable as Rentora’s landlord/tenant shells — without copying Rentora’s brand.

### Explicitly out of scope (do not match)

| Rentora | Do not adopt |
|---------|----------------|
| Brand / primary blue `#3183c8` (and hover/navy variants) | Keep `--accent` forest green |
| Ink / muted / footer slate hexes | Keep `--ink`, `--muted`, `--background` |
| Noto Sans + Nunito (marketing) / their display sizes | Keep Geist + `--font-mono-data` |
| Logo / wordmark / house-R mark | Keep Smart Prop brand |
| Marketing geometric hero fields, price cards, “included” italic micro-label | Marketing-only if ever borrowed; not app chrome |
| Hard paywall before first property | Anti-pattern ([gap-analysis](gap-analysis.md)) |

### Token map (use these, not Rentora hex)

| Role | CSS variable | Typical use |
|------|--------------|-------------|
| Page canvas | `--background` | `.app-shell`, body |
| Cards / sidebar / panels | `--surface` | `.form-card`, `.sidebar`, `.data-table-wrap`, `.dashboard-checklist`, `.stat-block` |
| Dividers / input borders | `--border` | 1px solid borders, table rules, tab underline |
| Primary text | `--ink` | Titles, table body, nav labels |
| Secondary / help / empty copy | `--muted` | `.page-subtitle`, `.form-help`, empty-state copy, inactive steps |
| Primary action / active nav | `--accent` | `.btn-primary`, complete checklist dots, active emphasis |
| Danger / overdue | `--alert` | Destructive / overdue badges (not Rentora’s green success) |
| Tabular amounts / dates | `.mono-data` | Stats, rent, timestamps |

**Shared geometry already in our CSS (prefer these numbers):**

| Pattern | Our value | Classes |
|---------|-----------|---------|
| Card / control radius | `6px` | `.form-card`, `.btn-*`, `.data-table-wrap`, `.stat-block`, `.onboarding-card` |
| Card padding (forms) | `22px` | `.form-card` |
| Card padding (onboarding / checklist) | `28px 24px` | `.onboarding-card`, `.dashboard-checklist` |
| Empty-state padding | `48px 24px` | `.dashboard-empty` |
| Content inset | `32px` | `.shell-content` |
| Topbar inset | `16px 32px 0` | `.shell-topbar` |
| Header → body gap | `28px` | `.dashboard-header` `margin-bottom` |
| Field stack gap | `16px` | `.form-card` gap |
| Button pad | `10px 16px` | `.btn-primary`, `.btn-secondary` |
| Table cell pad | `14px 16px` / th `12px 16px` | `.data-table` |
| Stat card pad | `16px 18px` | `.stat-block` |
| Sidebar width | `220px` (collapsed `64px`) | `.sidebar` |
| No drop shadows in shell | `box-shadow: none !important` | `.app-shell` |

---

## 1. Spacing rhythm

Rentora (product + marketing): large section breathing room; hero/container padding ~`48px 24px` or `0 16px` stacks; feature rows with clear vertical separation; polish from whitespace, not motion.

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 1.1 | Page body uses one consistent inset — not mixed 16/24/40 in the same shell | `.shell-content` → `padding: 32px` (`--background` behind) |
| 1.2 | Page title block has a fixed gap before the next band (stats, form, or table) | `.dashboard-header` → `margin-bottom: 28px` |
| 1.3 | Title + subtitle stack: title then muted one-liner; no third marketing paragraph in the header | `.page-title` + `.page-subtitle` (`color: var(--muted)`) |
| 1.4 | Stacked forms use a single vertical gap between fields | `.form-card` gap `16px`; `.form-field` gap `6px` (label → control) |
| 1.5 | Adjacent surface bands (stats → table, header → checklist) share the same horizontal edge as content | Keep inside `.shell-content`; avoid ad-hoc margins that break the `32px` rhythm |
| 1.6 | Mobile: reduce horizontal inset without collapsing card internal padding | Existing `@media` overrides on `.shell-content` / tables; keep card pad ≥ `22px` / checklist `28px 24px` |
| 1.7 | Prefer CSS hover transitions only — no scroll-reveal motion for “polish” | Match Rentora’s calm chrome; our shell already forbids decorative shadows/background images |

---

## 2. Card padding & surface discipline

Rentora tenant/landlord UI: white cards on a calm canvas; settings/forms as bordered panels; empty regions still sit in a clear surface, not floating text on the page wash.

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 2.1 | Interactive forms and settings panels are `--surface` + `--border`, radius `6px` | `.form-card` (`padding: 22px`) |
| 2.2 | Onboarding / getting-started panels use the slightly roomier pad | `.onboarding-card` / `.dashboard-checklist` (`28px 24px`) |
| 2.3 | Full-page empty states use the same surface language as cards | `.dashboard-empty` (`--surface`, `--border`, `48px 24px`) |
| 2.4 | Data tables sit in a bordered surface wrap, not bare on `--background` | `.data-table-wrap` |
| 2.5 | Summary metrics are compact surface cards in a row, not oversized hero tiles | `.stat-row` / `.stat-block` (`16px 18px`, gap `16px`) |
| 2.6 | No multi-layer shadows or glow on product cards | `.app-shell` hard guardrail — keep it |
| 2.7 | Cards are for **interaction or a single job** (form, checklist, empty recovery) — not decorative wrappers around every paragraph | Align with gap-analysis empty-state discipline; avoid card-in-card nesting |

---

## 3. Nav grouping

Rentora landlord demo sidebar (stable): Overview · Tasks · Properties · Tenancies · Tenants · Payments · Rents · Fees · References · Logout. Header: Search · Notifications · Settings · profile/role. Tenant shell: same idea — primary destinations in sidebar; Settings/Notifications as chrome, not duplicated everywhere.

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 3.1 | One persistent primary nav; destinations do not reshuffle per page | `.sidebar` + `.sidebar-nav` on `--surface` / `--border` |
| 3.2 | Group by landlord jobs we actually ship — not Rentora’s full taxonomy | Current: Properties · Payments · Reminders · Settings (`.nav-item`) |
| 3.3 | Active item is obvious via accent treatment, not a second visual system | `.nav-item` active → `--accent` (existing) |
| 3.4 | Account / theme live in **one** chrome place (header user menu), not sidebar + topbar duplicates | `.shell-topbar` + user menu; Settings route for prefs |
| 3.5 | Logout / collapse affordances sit at the bottom of the rail, separated from primary links | Existing sidebar footer pattern |
| 3.6 | Do **not** add global Search until portfolio size justifies it | Gap-analysis: defer |
| 3.7 | Do **not** invent parallel nav for tenancies/fees/inventory unless product scope expands | Stay unit-centric ([gap-analysis](gap-analysis.md)) |
| 3.8 | Collapsed rail keeps icons usable; labels may hide | `data-sidebar-collapsed` → width `64px` |

---

## 4. Empty-state discipline

Rentora pattern (tenant audit + demo): short explanation (“There's nothing here!” / “Nothing planned.”) + **one** clear next action where the user can act; checklist tasks on overview when first-run; avoid dead-end empties when a create path exists.

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 4.1 | Empty copy is short: title + one muted sentence — not a paragraph essay | `.dashboard-empty-title` / `.dashboard-empty-copy` → `color: var(--muted)` |
| 4.2 | Exactly **one** primary CTA in the empty surface | `.btn-primary` inside `.dashboard-empty` or checklist link |
| 4.3 | Zero-units dashboard uses checklist next actions, not a bare void | `.dashboard-checklist` on `--surface` (Add property → Add unit → Record payment) |
| 4.4 | Incomplete checklist lines are links; complete lines show checkmark + muted/accent label | Reuse `.onboarding-step-dot` + `.dashboard-checklist-link` / `-label` |
| 4.5 | In-table empties stay centered muted text | `.table-empty` → `color: var(--muted)` |
| 4.6 | Fetch/error recovery matches empty discipline: short reason + single Retry | `.FetchErrorState` pattern → `.page-title` / `.page-subtitle` + one `.btn-primary` |
| 4.7 | Failed reminder/receipt rows: muted reason (`--muted`) + row-level Retry — not a second full-page empty | `.reminder-error-detail` + `.btn-secondary.btn-table-cta` |
| 4.8 | Properties with zero units remain visible with an Add unit action (never “disappear”) | Table `needsUnit` row / checklist step — not Rentora tenancy hub |

---

## 5. CTA placement hierarchy

Rentora: primary filled · secondary ghost/outline · tertiary text link. Demo hubs put the money action (“Make a payment”) as the obvious next step on the entity. Marketing pairs primary + secondary consistently in header/hero/closing.

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 5.1 | **Primary** = the landlord’s most likely next job on that screen | `.btn-primary` → `background: var(--accent)`, `color` on accent, pad `10px 16px`, radius `6px` |
| 5.2 | **Secondary** = alternate path, same visual weight as outline — not competing green | `.btn-secondary` → `--surface` / `--border` / `--ink` |
| 5.3 | **Tertiary** = text links in tables/menus | `.table-link`, `.auth-alt-link` — underline/ink, not a third button style |
| 5.4 | Page header actions: primary rightmost (or sole); secondary to its left | `.dashboard-header-actions` gap `10px` |
| 5.5 | Form footers: Cancel/secondary left or secondary; submit primary | `.form-actions` / `.form-actions-split` |
| 5.6 | Unit payments: **Record manual payment** ≥ primary for cash landlords; Paystack alternate | Match gap-analysis CTA hierarchy (manual `.btn-primary`, Paystack `.btn-secondary`) |
| 5.7 | Table row actions stay compact — don’t use full header-sized primaries in every cell | `.btn-table-cta` (`padding: 6px 10px`) |
| 5.8 | Never stack two primaries for the same decision in one viewport | One `.btn-primary` job per section |

---

## 6. Information density

Rentora landlord demo: overview = calendar + checklist (not a dense spreadsheet); tenancy hub = balance + recent list + tasks; payments = summary strip (Pending / Sent / Total) then filterable rows; lists show identity + money + status without stuffing every field.

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 6.1 | List pages lead with **title + one subtitle**, then optional stat strip, then one primary table | `.page-title` / `.page-subtitle` → `.stat-row` → `.data-table-wrap` |
| 6.2 | Stat strip: 3 metrics max at portfolio level (Collected / Outstanding / Overdue) | `.stat-row` — don’t add Rentora-style Pending/Sent/Total until we have that model |
| 6.3 | Tables: identity · money · due · status · actions — avoid dumping tenant contact, channel, and notes into the same row | `.data-table` cell pad; detail goes to unit/payment/reminder pages |
| 6.4 | Money and dates use tabular mono | `.mono-data` |
| 6.5 | Status is a compact badge, not a paragraph | `.status-badge` (+ paid / pending / overdue tones using `--accent` / `--muted` / `--alert`) |
| 6.6 | Settings: sectioned hub (tabs or blocks), not one endless form | `.settings-page` max-width `560px`, `.settings-tabs` |
| 6.7 | Detail hubs (unit payments / reminders): kicker (property · unit) above title; log below actions | `.form-kicker` (`--muted`) + header CTA + table |
| 6.8 | Prefer one scroll of clear structure over dashboard widgets (calendar, task boards, multi-column hubs) for v1 | We are unit-centric; don’t recreate Rentora Overview calendar unless asked |

---

## 7. First-run & hub structure (structural only)

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 7.1 | First-run is a short wizard or checklist — never a subscription wall | `.onboarding` / `.dashboard-checklist` |
| 7.2 | Onboarding steps reuse the same step-dot language as the dashboard checklist | `.onboarding-step-dot` + `data-state` complete/active/upcoming |
| 7.3 | Entity pages answer: what is this, what’s owed/next, what’s the log, what’s the next action | Header CTA + surface form/table — Rentora tenancy hub shape, mapped to **unit** |
| 7.4 | Success after create: return to a hub that shows the new entity (property/unit visible) | Dashboard rows include zero-unit properties |

---

## 8. Auth & marketing shells (structure only)

| # | Check | Apply with our tokens / classes |
|---|--------|----------------------------------|
| 8.1 | Auth: centered single card, one primary submit, tertiary alt links | `.auth-page` / `.auth-panel` / `.form-card.auth-card` |
| 8.2 | Auth subtitle names the **actual** OTP channel (env-driven), not a hardcoded SMS/WhatsApp brand story | Copy via `authOtpChannelLabel()` — visual still `--muted` subtitle |
| 8.3 | Marketing may use larger hero rhythm; product shell stays denser and quieter | Don’t pull marketing section padding into `.app-shell` |

---

## Quick review pass (product screens)

Use on Properties, Payments (list + unit), Reminders (list + unit), Settings, Onboarding, Auth:

- [ ] Spacing: `32px` content inset; `28px` under header; no random gaps  
- [ ] Surfaces: forms/tables/empties/checklist on `--surface` + `--border`, radius `6px`  
- [ ] Nav: four primary items stable; account once in topbar  
- [ ] Empty: short muted copy + one CTA **or** checklist lines with check/link  
- [ ] CTAs: one primary job; secondary for alternate; table links tertiary  
- [ ] Density: stats ≤ 3; table columns scannable; money in `.mono-data`  
- [ ] No Rentora blue, Nunito/Noto, or logo borrowed into app chrome  

---

## Related

- Product gaps / adopt-now: [`gap-analysis.md`](gap-analysis.md)  
- Phase 2 deferrals: [`upgrade-prompts.md`](upgrade-prompts.md)  
- Our flow evidence: [`our-app-authenticated-audit.md`](our-app-authenticated-audit.md)  
