# Smart Prop — Design System (as shipped)

**Role:** Creative director (document reality; do not invent a second language)  
**Compiled:** 2026-08-04  
**Source of truth:** [`web/app/globals.css`](../web/app/globals.css) · fonts in [`web/app/layout.tsx`](../web/app/layout.tsx)  
**Related:** [`PRD.md`](PRD.md) · [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md) · transactional email: [`email-design-system.md`](email-design-system.md)

---

## Brand personality

Calm, practical, landlord-tool. Forest green (`--accent`) signals money/ops trust without UK-proptech blue. KTI orange (`--brand`, from the parent logo) marks "by KTI" identity without replacing forest for primary actions. Surfaces stay quiet; data (amounts, dates) is the loud part via mono. No glassmorphism, glow stacks, or purple-default AI aesthetics.

---

## Color tokens

All product and marketing brand color must resolve to these CSS variables.

### Light (`:root`)

| Token | Hex | Role |
|-------|-----|------|
| `--background` | `#f7f8f7` | Page canvas (product shell, marketing base) |
| `--background-alt` | `#eef1ef` | Marketing section beats only |
| `--surface` | `#ffffff` | Cards, tables wraps, forms, sticky header |
| `--border` | `#e2e4e1` | Hairlines, inputs, table wraps |
| `--ink` | `#14171a` | Titles, primary text |
| `--accent` | `#0f6e4f` | Primary buttons, links, active nav, money/ops trust |
| `--brand` | `#e65100` | KTI parent mark - stamps, process line, collapsed "N" mark |
| `--alert` | `#b4402a` | Destructive / overdue emphasis |
| `--muted` | `#6b7280` | Subtitles, secondary labels, placeholders |

### Dark (`html[data-theme="dark"]`)

| Token | Hex |
|-------|-----|
| `--background` | `#0F1113` |
| `--background-alt` | `#14171a` |
| `--surface` | `#16181B` |
| `--border` | `#26292D` |
| `--ink` | `#E8EAED` |
| `--accent` | `#2FA679` |
| `--brand` | `#ff7a33` |
| `--alert` | `#D96650` |
| `--muted` | `#9BA1A6` |

**Rules**

- No Rentora `#3183c8`, no Tailwind palette classes as brand color.
- `--accent` (forest) is the product action color. `--brand` (KTI orange from the Kings Technologies Innovations logo) is the parent identity accent only - stamps (`by KTI`), marketing process line, collapsed sidebar mark. Do not replace primary buttons or active nav with orange.
- Primary button label uses `color: var(--surface)` on `background: var(--accent)`.
- Mixes allowed: `color-mix(in srgb, var(--accent) …, var(--surface|ink))` for hover/active washes; `--brand` mixes are fine for soft marketing atmosphere only.
- Marketing alt sections: `.section-bg-alt` → `--background-alt` (must win over `.marketing-section`).

---

## Typography

| Role | Family | Where |
|------|--------|-------|
| UI / marketing body & titles | **Geist Sans** (`--font-geist-sans`) | App shell, forms, marketing |
| Amounts, dates, references | **JetBrains Mono** via `.mono-data` (`--font-mono-data`) | Stats, table money/date cells, contact mono fields |

**Do not** introduce Noto Sans, Nunito, Inter-as-brand, or serif display for product chrome.

### Product type roles (classes)

- `.page-title` — screen title  
- `.page-subtitle` — one muted line under title  
- `.form-kicker` — muted context above title (e.g. property · unit)  
- Marketing: `.marketing-brand`, `.marketing-title`, `.marketing-h2`, `.marketing-lede`

---

## Spacing & density

| Context | Token / rule |
|---------|----------------|
| Product shell inset | `--shell-inset: 32px` (24px / 16px at smaller breakpoints) |
| Header band under title | `.dashboard-header { margin-bottom: 28px }` |
| Form card padding | `.form-card` → `22px`, gap `16px`; fields gap `6px` |
| Onboarding / checklist | `.onboarding-card` / `.dashboard-checklist` → `28px 24px` (roomier than form-card) |
| Empty state | `.dashboard-empty` → `48px 24px` |
| Stat blocks | `.stat-block` → `16px 18px`, row gap `16px` |
| Marketing container | `--marketing-max: 720px`; gutter 24px mobile / 0 desktop ≥720px |
| Marketing section rhythm | `.section-spacing` → 48px / 80px padding-block |
| Phones ≤640px | Icon-rail sidebar (64px); `--shell-inset: 16px`; `.data-table-wrap` scrolls wide tables; page `overflow-x: clip` |

**Rule:** Product stays denser than marketing. Never map marketing vars onto `.app-shell`.

---

## Materials (radius, elevation, atmosphere)

- Default interactive radius: **6px** (buttons, inputs, cards, table wraps).
- Flat product and marketing: **no decorative `box-shadow`**. `.app-shell` and `.marketing` force `box-shadow: none !important`.
- Overlays (menus, panels, FABs): **border + `--surface` only** — not shadow elevation.
- Atmosphere: soft `--accent` / `--brand` radial washes on `.marketing` only. Sections stay transparent so atmosphere shows; only `.section-bg-alt` paints a fill.
- Ban: glow stacks, continuous shadow pulses, glass `backdrop-filter` on chrome, inventing per-screen elevation.

---

## Components

### Buttons

| Class | Use |
|-------|-----|
| `.btn-primary` | Single most likely next job |
| `.btn-secondary` / `.btn-outline` | Alternate actions |
| `.btn-table-cta` | Compact row actions (never full header primary in cells) |

### Surfaces

| Class | Use |
|-------|-----|
| `.form-card` | Settings, property/unit forms, auth card |
| `.data-table-wrap` | Every product data table |
| `.stat-row` > `.stat-block` | Portfolio metrics |
| `.dashboard-empty` | Full empty UI |
| `.dashboard-checklist` / `.onboarding-card` | Getting started |

### Navigation

- `.nav-item` + active state washes with `--accent` only (nav chrome stays forest; KTI `--brand` is for stamps/marks, not nav active).
- One Account entry point; one theme control (avoid duplicate moon + Appearance).

### Auth

- `.auth-page` / `.auth-panel` / `.form-card.auth-card` — centered, same surface language as product forms.

### Marketing-only

- `.marketing-container`, `.marketing-section`, `.section-bg-alt`, `.marketing-preview`, `.marketing-reveal`.
- Canonical scroll reveal: `MarketingReveal` (`.marketing-reveal`). Do not add a second reveal API.
- Reusable: `MarketingSection`, `MarketingFeatureList` (`cards` | `grid` | `rail`), `MarketingTrustStrip`.
- Hierarchy: hero (brand + title + lede + CTAs + preview) → product → roles → stories → FAQ → CTA.
- No fake logos/testimonials/blog. Primary CTA → `/signup`; WhatsApp callback secondary.
- Footer: hairline `border-top: var(--border)`.

### Status / data

- Payment/reminder chips use semantic status; overdue/alert may use `--alert`.
- Money and dates: `.mono-data`.

---

## Motion

Tokens live on `:root` in `globals.css`. Use them; do not invent per-screen durations.

| Token | Value | Use |
|-------|-------|-----|
| `--motion-fast` | `120ms` | Hover / color / focus chrome |
| `--motion-ui` | `200ms` | Sidebar width, panel opacity, shell chrome |
| `--motion-reveal` | `300ms` | Marketing hero fade-up + scroll reveal |
| `--ease-out` | `ease-out` | Default easing for the above |

| Surface | Policy |
|---------|--------|
| Product | Hover/focus transitions on buttons/nav only; functional feedback OK (skeleton, row highlight, auth pulse, toasts). No scroll-storytelling under `.app-shell`. |
| Marketing | One-shot `MarketingReveal`; short hero stagger (`.marketing-hero-animate`); hero mock idle autoplay (`MarketingHeroFrame`). |
| Global | Calm; no Framer / AOS on dashboard. Always honor `prefers-reduced-motion` (show final state; kill loops). |

### Product feedback (toasts)

Shared API: `showToast(message, tone?)` in `ToastProvider` — one toast at a time.

| Tone | Use | Visual | Duration |
|------|-----|--------|----------|
| `neutral` (default) | Unclassified / legacy callers | Left border `--border` | 3s |
| `success` | Action completed | Left border `--accent` | 3s |
| `error` | Action failed (prefer API `detail`) | Left border `--alert` | 4.5s |

**When to toast:** quiet saves; money/chase/notify outcomes; post-confirm destructive results. Past tense, short copy. Side effects get honest secondary clause (“created — could not notify tenant”) with `success` if the primary action worked.

**Not toasts:** persistent “needs attention” → bell / Action needed; field validation → inline; full-page load failure → `FetchErrorState`; destructive intent → confirm dialog first, then toast.

Errors: `role="alert"` + `aria-live="assertive"`. Success/neutral: `status` / `polite`. No decorative shadows; tokens only. No toast queues or action buttons on the toast.

---

## Iconography

- Lucide (or existing set) at small sizes; stroke icons in `--accent` or `--ink` as already used on marketing cards.
- No emoji as UI decoration.

---

## Accessibility

- Focus rings: `:focus-visible` `outline: 2px solid var(--accent)` (offset 2px) on buttons, nav, tabs, links, user menu, theme segment; inputs also use accent border + outline.
- Contrast: ink on background/surface; muted only for secondary.
- Don’t rely on color alone for PAID/OVERDUE — keep text labels.
- Touch: header CTAs stay ≥ `10px 16px` padding on small viewports; table CTAs ≥ 40px min-height on phones.

---

## Anti-patterns

- Rentora blue / Noto / Nunito / their logo.  
- Purple-on-white or terracotta-cream default AI themes.  
- Cards in marketing hero; orphaned full-bleed text outside `.marketing-container`.  
- Nested competing page paddings inside `.shell-content`.  
- Inventing new hex or motion durations for “just this screen.”  
- Dual reveal APIs; marketing scroll motion under `.app-shell`.  
- Glow stacks, glass blur chrome, decorative shadows.

---

## Change control

Visual changes update **this file + `globals.css` together**. Feature work that needs new components should extend existing classes first. Layout execution prompts: [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md).

Transactional email HTML uses a parallel email-safe token map and table shell — see [`email-design-system.md`](email-design-system.md); do not invent a second brand for mail.
