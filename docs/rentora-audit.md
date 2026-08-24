# Rentora marketing site design audit

**Source:** https://rentora.co.uk/  
**Audited:** 2026-07-22  
**Viewports:** desktop `1440×900`, mobile `390×844`  
**Method:** gstack browse screenshots + computed-style extraction (`getComputedStyle`)

Screenshots live in [`docs/rentora-screenshots/`](rentora-screenshots/).

| Page | Desktop | Mobile |
|------|---------|--------|
| Home `/` | [home-desktop-1440.png](rentora-screenshots/home-desktop-1440.png) | [home-mobile-390.png](rentora-screenshots/home-mobile-390.png) |
| For landlords `/for-landlords` | [for-landlords-desktop-1440.png](rentora-screenshots/for-landlords-desktop-1440.png) | [for-landlords-mobile-390.png](rentora-screenshots/for-landlords-mobile-390.png) |
| Organisation `/for-landlords/organisation` | [organisation-desktop-1440.png](rentora-screenshots/organisation-desktop-1440.png) | [organisation-mobile-390.png](rentora-screenshots/organisation-mobile-390.png) |
| Pricing `/pricing` | [pricing-desktop-1440.png](rentora-screenshots/pricing-desktop-1440.png) | [pricing-mobile-390.png](rentora-screenshots/pricing-mobile-390.png) |

---

## Global system (shared across pages)

### Navigation structure

**Desktop (unchanged on all four pages):**

| Zone | Contents |
|------|----------|
| Left | Rentora wordmark (blue) |
| Center | `Listings` · `Pricing` · `Features ▾` · `Learn ▾` |
| Right | Secondary **Login** · Primary **Create account** |

**Features dropdown** (from DOM link inventory): For Landlords & Agents, Property Listings, Rent Collection, Organisation, Switching Service; tenant sub-links (Card Payments, Organisation, Find a Home) also appear in the mega/sidebar tree.

**Learn dropdown:** See a demo, Blog, Help Center.

**How nav changes between pages:** It does **not**. Same global header/footer chrome; only the active page content and hero messaging change. `Pricing` is always a top-level item (not only under Features).

**Mobile (`390px`):**

- Hamburger (`button.block.focus:outline-none.lg:hidden`) on the left; logo centered.
- Desktop link row and header CTAs collapse into a sidebar/drawer (classes include `sidebar-sublink`).
- Primary in-page CTAs stack full-width under the hero.

**Footer (all pages):** Dark slate bar — Product / Resources / Company / Connect columns; legal links; © Tenant Manager Ltd. Persistent “Any questions? We'll call you.” callback prompt.

### Color palette (computed hex)

| Role | Hex | RGB (computed) | Where used |
|------|-----|----------------|------------|
| Brand / primary | `#3183c8` | `rgb(49, 131, 200)` | Theme meta, logo, primary buttons, `text-blue`, italic “included”, H1 accent spans |
| Primary hover/alt | `#63a2d8` | `rgb(99, 162, 216)` | Pricing card CTA “Get started in minutes” |
| Deep navy CTA | `#203d54` | `rgb(32, 61, 84)` | Home bottom “Get started” (darker primary variant) |
| Heading / ink | `#212934` | `rgb(33, 41, 52)` | H1 / section titles |
| Body / muted | `#5f6b7a` | `rgb(95, 107, 122)` | Body copy, secondary button text, H2 subheads |
| Soft blue surface | `#eff8ff` | `rgb(239, 248, 255)` | Mobile/sidebar Login chip |
| Link blue (darker) | `#2368a2` | `rgb(35, 104, 162)` | Soft Login text |
| Success / price accent | `#38c172` | `rgb(56, 193, 114)` | Mid-page £15 / 1.5% callouts on pricing |
| Footer | `#344454` | `rgb(52, 68, 84)` | Footer background |
| Hairline / border | `#e1e7ec` | `rgb(225, 231, 236)` | Default borders |
| White | `#ffffff` | — | Surfaces, primary button text, landlord pricing card text |
| Theme meta | `#3183c8` | — | `<meta name="theme-color">` |

Page canvas reads as white / very light gray with soft geometric diagonal shapes behind heroes (not a flat solid; shapes are decorative, low contrast).

### Typography

**Loaded families** (Google Fonts stylesheet): Noto Sans (400/700 + italics), Nunito (300/400/600/700). URL also mentions Inter, but computed heading/body fonts resolve to **Noto Sans** and **Nunito**.

| Role | Family | Size (desktop) | Weight | Color | Notes |
|------|--------|----------------|--------|-------|-------|
| H1 | Noto Sans | `48px` | `600` | `#212934` (+ `#3183c8` accent spans) | `letter-spacing: -1.2px`; mobile H1 ≈ `30.4px` |
| Section H2 | Noto Sans | `36px` | `600` | `#212934` | e.g. “A better way…”, “Everything is included” |
| Hero subhead (H2) | Nunito | `24px` | `400` | `#5f6b7a` | Marketing sentence under H1 |
| Feature H3 | Noto Sans | `26px` | `600` | `#5f6b7a` | Feature block titles |
| Body | Nunito | `16px` / `lh 25.6px` | `400` | `#5f6b7a` | Default body |
| “included” tag | Noto Sans | `14px` italic | `400` | `#3183c8` | Repeated micro-label |
| Price £15 (pricing card) | Noto Sans | `96px` | `700` | `#ffffff` (on blue card) | Data/number treatment |
| “Free” (tenants card) | Noto Sans | `36px` | `700` | `#212934` | |
| Fee callouts | Noto Sans | `30.4px` | `600` | `#38c172` | £15 / 1.5% in details section |
| Buttons | Nunito/Noto stack | `16–18px` | `600` | white or muted | |

### Spacing & layout patterns

- **Container:** `.container` → computed `max-width: 1280px`; common padding `48px 24px` (hero) or `0 16px` (inner stacks). Utility classes like `max-w-3xl` appear in markup but container width still resolves to 1280px in samples.
- **Hero:** Desktop often **split** (home: copy left / product art right) or **centered** (for-landlords, organisation, pricing). Mobile: single column, art between copy and CTAs on home.
- **Feature rows:** Flex “grid-layout” / `grid-layout-item` with breakpoint widths (`md:w-1/2`, `lg:w-1/4`) — flex-based columns, not CSS Grid tracks (`grid-template-columns: none`).
- **Vertical rhythm:** Large section padding; icon-in-circle + title + body; product UI mockups in opposing column on feature pages.
- **Radius:** Buttons `4px`; pricing cards appear more rounded (~8px visually).

### CTA hierarchy (global)

| Level | Label | Style (computed) |
|-------|-------|------------------|
| Primary | Create account / Get started | `bg #3183c8`, white text, `pad 12px 24px`, `radius 4px`, `border 3px` matching fill, weight 600 |
| Secondary | Login / Request a callback | White (or soft `#eff8ff`) fill, muted/`#3183c8` text, same padding/radius |
| Tertiary | “Are you looking to rent?” / “Are you a tenant?” | Blue text link + chevron |
| Footer/modal | Request a callback | Primary blue on modal; ghost “No, thanks” |

Pricing-specific: landlord card uses lighter blue CTA `#63a2d8` “Get started in minutes”; tenants card uses gray `#5f6b7a` “Invite your landlord”.

### Copy / reassurance patterns (repeated)

- **All-in-one / unlimited:** “unlimited properties”, “no property limit”, “no storage limit”, “everything is included”
- **No lock-in:** “no minimum term”, “no hidden fees”
- **Money trust:** “You get paid directly”, “We never touch your money”, “check money in against what’s due”
- **Effortlessness:** “You don't have to do anything”, “Get started in minutes / a couple of minutes”
- **Audience scale:** “private landlords… nationwide estate agents”
- **Micro-label:** italic blue **included** after feature titles
- **Audience gate:** “Are you looking to rent?” / “Are you a tenant?”
- **Support:** phone `0800 689 4981`, callback modal

### Motion

- No Framer / AOS / GSAP markers; `document.getAnimations()` count **0** at rest and after scroll.
- Buttons use CSS `transition: all` (hover/focus only).
- Visual motion is mostly **static geometry** in hero backgrounds and product mockups, not scroll-triggered reveals.
- UI chrome: dropdown chevrons, mobile drawer, callback modal open/close.

---

## Page: Home — `/`

**Screenshots:** [desktop](rentora-screenshots/home-desktop-1440.png) · [mobile](rentora-screenshots/home-mobile-390.png)

### 1. Navigation
Global header as above. No page-specific nav items.

### 2. Color
Same system. H1 split: “Manage properties” `#212934` + “Collect rents” `#3183c8` (`.text-blue`). Feature icons sit on light blue circular chips.

### 3. Typography
- H1 `48px` / `600` Noto Sans (mobile ~`30.4px`)
- Subhead H2 `24px` / `400` Nunito
- Mid-page section H2 `36px` / `600` Noto Sans (“A better way to manage properties”)
- Feature H3s `26px`

### 4. Spacing / layout
- Desktop hero: **2-column flex** — copy + dual CTAs left; phone + dashboard illustration right.
- Mobile: stacked — headline → devices → full-width primary then secondary CTA → tenant link.
- Below fold: 4-up benefit strip, then alternating feature blocks (listings / rent collection / organisation) ending in FAQ + dark navy “Get started”.

### 5. Copy patterns
- Headline pair: manage / collect
- Price teaser inline: “£15/mo, unlimited properties, no minimum term - everything is included.”
- Feature explanations + “included”
- FAQ: cost, estate-agency fit, contact

### 6. CTAs
1. Header **Create account** (primary)
2. Hero **Create account** (primary) + **Request a callback** (secondary)
3. Tertiary tenant link
4. Closing **Get started** (`#203d54`) + callback
5. Modal callback

### 7. Motion
None beyond hover transitions; decorative hero shapes only.

---

## Page: For landlords — `/for-landlords`

**Screenshots:** [desktop](rentora-screenshots/for-landlords-desktop-1440.png) · [mobile](rentora-screenshots/for-landlords-mobile-390.png)

### 1. Navigation
Identical global nav. Reached via Features → For Landlords & Agents (and footer Product → For Landlords).

### 2. Color
Same palette. Accent in H1: “…**better for landlords & agents**” in `#3183c8`. Centered hero on pale geometric field.

### 3. Typography
- H1: “We're making renting better for landlords & agents” — `48px` / `600` Noto Sans
- Subhead: `24px` / `400` Nunito
- Same H3 feature sizing as home

### 4. Spacing / layout
- **Centered hero** (unlike home’s split with devices).
- 3-column benefit strip (All-in-one / Direct payments / Landlord and agent friendly).
- Same long-form feature sections as home (listings, rent collection, organised) — shared content pattern, landlord-framed intro.

### 5. Copy patterns
- Audience-first headline; capability list in subhead
- Same “included”, direct-pay, unlimited, no-minimum FAQ block
- Tenant gate: “Are you a tenant?”

### 6. CTAs
Hero **Get started** (primary) + **Request a callback** (secondary); header Create account; closing Get started + callback. Wording shifts from home’s hero “Create account” to “Get started”.

### 7. Motion
None detected (same as global).

---

## Page: Organisation — `/for-landlords/organisation`

**Screenshots:** [desktop](rentora-screenshots/organisation-desktop-1440.png) · [mobile](rentora-screenshots/organisation-mobile-390.png)

### 1. Navigation
Global nav unchanged. This is a **Features** deep-link (sibling of property listings / rent collection).

### 2. Color
Same system. Cross-links “Property listings” / “Rent collection” rendered as `#3183c8` H2s (`20px` / `600`).

### 3. Typography
- H1 “Stay organised” — `48px` / `600`
- Subhead centralized PM sentence — `24px` Nunito
- Feature titles (inventories, documents, calendar, etc.) with blue italic “included”

### 4. Spacing / layout
- Centered hero with diagonal section transition into white content.
- **2-column feature rows:** icon + copy | product UI mock (e.g. inventory “Living room” card).
- Shorter page than home/for-landlords; ends with cross-sell to listings & rent collection + standard closing CTA band.

### 5. Copy patterns
- Organisation vocabulary: inventories, documents, calendar, notifications, messaging
- Reassurance: “unlimited photos”, “safe with us”, “Stay legal!”
- Same “included” microcopy

### 6. CTAs
Same hero pair (**Get started** / **Request a callback**) + header + footer band. Tertiary “Are you a tenant?”

### 7. Motion
None beyond CSS hover; static mockups.

---

## Page: Pricing — `/pricing`

**Screenshots:** [desktop](rentora-screenshots/pricing-desktop-1440.png) · [mobile](rentora-screenshots/pricing-mobile-390.png)

### 1. Navigation
Global nav; **Pricing** is a primary top-level item (highlighted by being the current route in UX, not a different nav schema).

### 2. Color
- Hero title mixes blue + ink (“Increase your ROI” accent pattern).
- **Landlord plan card:** solid `#3183c8` fill, white type, large white £15.
- **Tenant plan card:** white surface, dark type, “Free” in ink.
- Detail fees use green `#38c172` for £15 / 1.5%.

### 3. Typography
- H1 `48px` / `600` Noto Sans — “Increase your ROI with better property management”
- Plan labels H2 `18px` / `400` Nunito
- **Numbers:** £15 at `96px` / `700`; Free at `36px` / `700`; fee figures `30.4px` / `600` green
- Section H2s `36px` (“Everything is included”, “Simple, transparent pricing”)
- Detail H3s `30.4px`

### 4. Spacing / layout
- Centered hero + **2-up pricing cards** (`grid-layout` flex, `md:w-1/2`).
- Tabs/anchors: Core features · Pricing details · FAQs.
- Feature comparison lists with “included”; FAQ accordion-style Q&As.
- Mobile: cards stack; large price still dominates card.

### 5. Copy patterns
- ROI / easy management
- Heavy reassurance: no minimum term, no hidden fees, no London surcharge
- Dual audience: landlords £15 vs tenants Free
- Transparency story: “How can you charge so little? By design.” automation + volume

### 6. CTAs
| Location | Control | Hierarchy |
|----------|---------|-----------|
| Header | Create account | Primary |
| Landlord card | Get started in minutes (`#63a2d8`) | Primary (in-card) |
| Landlord card | or, request a callback | Tertiary text on blue |
| Tenant card | Invite your landlord (`#5f6b7a`) | Secondary/alt |
| Tenant card | or, create an account | Tertiary |
| Lists | Learn more → `/for-landlords` | Text link |

### 7. Motion
No scroll/load animation libraries detected; card emphasis is color/weight, not motion.

---

## Cross-page summary

| Dimension | Pattern |
|-----------|---------|
| Nav | One global header; Features mega-menu holds landlord product pages; Pricing is top-level |
| Brand color | `#3183c8` everywhere for identity + primary actions |
| Type | Noto Sans for display/headings/numbers; Nunito for body/subheads |
| Layout | `1280px` container; flex column layouts; heroes either split (home) or centered (others) |
| Proof language | “included”, unlimited, no minimum term, direct pay / never touch your money |
| CTA model | Blue filled primary · white secondary · blue text tertiary · callback always available |
| Motion | Minimal — hover transitions only; no scroll storytelling |

### Implications for Smart Prop Manager (design borrow list)

1. Keep a **single flat price** story with “everything included” + no lock-in language.
2. Use a **two-font system**: tighter display face for H1/prices, softer body face for explanations.
3. Primary blue CTA + ghost secondary “Talk to us / callback” pair works consistently in header, hero, and closing band.
4. Repeat the italic **included** (or equivalent) micro-label next to feature names.
5. Prefer **flex feature rows with product UI proof** over abstract icon grids alone.
6. Don’t rely on scroll animation — Rentora’s polish comes from whitespace, geometry, and mockups.
