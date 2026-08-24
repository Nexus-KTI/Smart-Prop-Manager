# Smart Prop — Design System (as shipped)

**Role:** Creative director (document reality; do not invent a second language)  
**Compiled:** 2026-08-04  
**Source of truth:** [`web/app/globals.css`](../web/app/globals.css) · fonts in [`web/app/layout.tsx`](../web/app/layout.tsx)  
**Related:** [`PRD.md`](PRD.md) · [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md) · transactional email: [`email-design-system.md`](email-design-system.md)

---

## Brand personality

Calm, practical, landlord-tool. Forest green signals money/ops trust without UK-proptech blue. Surfaces stay quiet; data (amounts, dates) is the loud part via mono. No glassmorphism, glow stacks, or purple-default AI aesthetics.

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
| `--accent` | `#0f6e4f` | Primary buttons, links, active nav, icons |
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
| `--alert` | `#D96650` |
| `--muted` | `#9BA1A6` |

**Rules**

- No Rentora `#3183c8`, no Tailwind palette classes as brand color.
- Primary button label uses `color: var(--surface)` on `background: var(--accent)`.
- Mixes allowed: `color-mix(in srgb, var(--accent) …, var(--surface|ink))` for hover/active washes.
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

## Radius & elevation

- Default interactive radius: **6px** (buttons, inputs, cards, table wraps).
- Product shell: **`box-shadow: none !important`** — no decorative shadows.
- Marketing also forces no box-shadow for a flat editorial read.

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

- `.nav-item` + active state washes with `--accent` only (no second brand color).
- One Account entry point; one theme control (avoid duplicate moon + Appearance).

### Auth

- `.auth-page` / `.auth-panel` / `.form-card.auth-card` — centered, same surface language as product forms.

### Marketing-only

- `.marketing-container`, `.marketing-section`, `.section-bg-alt`, `.marketing-preview`, `.reveal-on-scroll`.
- Reusable: `MarketingSection`, `MarketingFeatureList` (`cards` | `grid` | `rail`), `MarketingTrustStrip`.
- Atmosphere: soft accent radial washes on `.marketing`; sections stay transparent so it shows; only `.section-bg-alt` paints a fill.
- Hierarchy: hero (brand + title + lede + CTAs + preview) → compact trust → problem cards → product preview early → step rail → feature grid → FAQ → CTA.
- No fake logos/testimonials/blog. Primary CTA → `/signup`; WhatsApp callback secondary.
- Footer: hairline `border-top: var(--border)`.

### Status / data

- Payment/reminder chips use semantic status; overdue/alert may use `--alert`.
- Money and dates: `.mono-data`.

---

## Motion

| Surface | Policy |
|---------|--------|
| Product | Hover/focus transitions on buttons/nav only; no scroll-storytelling |
| Marketing | Reveal fade-up OK; respect `prefers-reduced-motion` |
| Global | Calm; no Framer/AOS on dashboard |

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
- Inventing new hex for “just this screen.”

---

## Change control

Visual changes update **this file + `globals.css` together**. Feature work that needs new components should extend existing classes first. Layout execution prompts: [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md).

Transactional email HTML uses a parallel email-safe token map and table shell — see [`email-design-system.md`](email-design-system.md); do not invent a second brand for mail.
