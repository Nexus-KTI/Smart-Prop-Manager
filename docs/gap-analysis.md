# Gap analysis — Rentora vs Smart Prop

**Sources:** [`rentora-audit.md`](rentora-audit.md) · [`rentora-authenticated-audit.md`](rentora-authenticated-audit.md) · [`rentora-demo-audit.md`](rentora-demo-audit.md) · [`our-app-authenticated-audit.md`](our-app-authenticated-audit.md)  
**Compiled:** 2026-07-31  
**Scope:** Landlord-first product for Smart Prop v1. Tenant companion app and Rentora paywall are noted only where they inform recommendations.

---

## Summary

Rentora’s landlord happy path (demo) is **Property → Tenancy → Invite tenant → Fees → Documents → Inventory → Payments + email**. Smart Prop’s path is **Property → Unit (with tenant fields) → Manual/Paystack payment → PDF receipt + channel notify**. We should close high-ROI UX gaps that already match our model (address autocomplete, landlord payment email, empty states, reliability) and **not** rebuild Rentora’s tenancy/fee/inventory stack without validated demand.

Also see Phase 2 notes in [`upgrade-prompts.md`](upgrade-prompts.md).

---

## Gap table

| Category | Rentora pattern | Our app | Recommendation | Priority | Status |
|----------|-----------------|---------|----------------|----------|--------|
| Address entry | Autocomplete search → structured UK address lines + optional name (`/properties/new` in demo) | Plain text address (Photon autocomplete now wired; lat/lng optional via migration) | Keep autocomplete; ensure lat/lng columns applied in Supabase; polish empty/error when geocoder is slow | High | adopt now — high priority |
| Landlord payment notice | Email on money-in: “Money in: £X from {tenant} ({property})” + View Payment | Tenant receipt via preferred channel + PDF; landlord email on paid now implemented | Keep landlord email on manual + Paystack paid paths; require profile email + SMTP; match clear subject line | High | adopt now — high priority |
| First-run / paywall | Landlord product hard-gated behind paid subscription (no trial in auth audit); demo shows checklist tasks after login | Free landlord app; Welcome → Property → Unit wizard with Skip on unit step | Keep free first property; strengthen empty states and checklist-style next actions (don’t copy paywall) | High | adopt now |
| Empty states | Strong copy + one CTA (“There's nothing here!”, Invite landlord, New Task, etc.) | Mixed: clear “No units yet”; weaker recovery on failed reminders; Skip can orphan unit-less properties | Adopt Rentora-style short explanation + single CTA on empty/error rows; fix unit-less property visibility | High | adopt now |
| Properties list vs units | Properties and Tenancies are first-class nav items; empty tenancy still has a hub | Dashboard/list is **unit-centric**; property with zero units can disappear after Skip | Always list properties (even with 0 units) + CTA “Add unit”; keep unit table as secondary | High | adopt now |
| Payment reliability | Demo shows stable payments ledger | `/payments/[unitId]` intermittent 500 / infinite skeletons; form can stay open after save | Fix unit payments page errors; close/reset manual form after success; hide dev error overlay in prod | High | adopt now |
| Receipt UX | Email serves as receipt; “View Payment” deep link | Supabase Storage PDF; “View Receipt” downloads file | Keep PDF; optionally open in new tab and toast “Receipt saved”; wording: Download / Open receipt | Medium | adopt now |
| Onboarding checklist | Overview tasks: “Add your first property”, “Verify your account” | 3-step wizard; no persistent checklist after Skip | Light checklist on empty dashboard (Add property → Add unit → Record payment) | Medium | adopt now |
| CTA hierarchy (payments) | Tenancy hub: Make a payment as clear next action | Paystack primary, Manual secondary — wrong emphasis for cash landlords | Make **Record manual payment** equal or primary for landlords; Paystack as alternate | Medium | adopt now |
| Notification prefs | Event × Email/SMS matrix (tenant audit); rich event list | Single channel for reminders/receipts (SMS / WhatsApp / Email) | Keep single channel for v1; expand to event matrix only if users ask | Medium | defer |
| Reminder failure recovery | N/A in landlord demo; tenant inbox explains backup role of notifications | Failed receipt/reminder rows with no retry/explain CTA | Add error detail + Retry on failed reminder rows | Medium | adopt now |
| Profile / settings polish | Settings hub with clear sections; phone confirm for SMS | Profile load race (`?`, empty fields); duplicate Account + theme controls | Fix `fetchMe` loading state; one theme control; one Account entry point | Medium | adopt now |
| Auth copy / OTP | Email + password login | Phone OTP; copy says WhatsApp vs SMS inconsistently | Align login copy with actual OTP channel (`NEXT_PUBLIC_AUTH_OTP_CHANNEL`) | Low | adopt now |
| Marketing design system | `#3183c8`, Noto Sans + Nunito, “included”, callback CTA, minimal motion | Forest green product UI; marketing pages separate | Borrow marketing patterns (price clarity, included language, callback) on landing only; don’t restyle app chrome to Rentora blue | Low | defer |
| Pricing trust | Marketing ~£15 vs checkout £20/£180 inconsistency | Invite-only / no public landlord paywall in product | If/when paid plans launch, one price story across marketing + checkout | Medium | defer |
| Tenancy as separate entity | Tenancy hub: term, rent, balance, payments, docs, inventory, tasks | Unit holds rent + tenant fields; no tenancy object | Stay unit-centric for v1; revisit only with validated multi-tenant/term demand | — | defer — no validated need |
| Fee workflows | One-off fees (e.g. lost keys) with due date, balance, Make a payment | Rent-focused payments only | Do not build fee types until a landlord requests non-rent charges | — | defer — no validated need |
| Room inventory | Room-scoped condition text + photos; mobile capture in demo | None | Defer; no validated need for check-in/out inventory | — | defer — no validated need |
| Document upload / compliance | Typed docs (Gas Cert, EPC…), expiry reminders, share with tenant | None (noted in upgrade-prompts Phase 2) | Defer; reuse receipts Storage pattern when a real user asks ([`upgrade-prompts.md`](upgrade-prompts.md)) | — | defer |
| Tenant invite / login | Invite by email/SMS; full free tenant app (messages, rents, fees, applications) | Landlord-only; tenant is contact fields + outbound notify | Skip tenant accounts/invite login for v1 | — | skip — out of scope for v1 |
| Tenant messaging / tasks | In-app Messages + Tasks for tenants (and landlord tasks in demo) | No chat; reminders are outbound only | Skip in-app messaging for v1 | — | skip |
| Money In / Money Out ledger | Portfolio payments with Pending/Sent/Total + filters | Unit payment history + portfolio unit list | Optional later: portfolio money-in feed; not required for v1 | Low | defer |
| Search (global) | Header search across landlord/tenant shells | No global search | Defer until portfolio size justifies it | Low | defer |
| Role-specific shells | Dark tenant sidebar vs landlord chrome; multi-profile | Single landlord shell | Skip until tenant login exists | — | skip |

---

## Adopt-now focus (ordered)

1. **Address autocomplete** — ship/finish geocoding storage + UX (high).
2. **Landlord payment email** — keep on all paid paths; SMTP + profile email (high).
3. **Unit-less properties visible** + stronger empty-state CTAs (high).
4. **Unit payments page reliability** + form reset after manual save (high).
5. Receipt open/download wording, payment CTA hierarchy, reminder retry, profile load polish (medium).

---

## Explicitly out of v1

| Item | Why |
|------|-----|
| Tenant invite / tenant login app | Out of scope for v1 (landlord-only product) |
| In-app tenant messaging / applications | Depends on tenant accounts |
| Tenancy entity, fees, room inventory | No validated need; Rentora demo complexity without local demand |
| Hard paywall before first property | Anti-pattern from Rentora auth audit — do not copy |

---

## Notes on evidence gaps

- Rentora **landlord product UI** was not fully auditable while unsubscribed; landlord flow detail comes primarily from the **demo video**.
- Smart Prop audit reflects localhost OTP landlord flows as of 2026-07-31; address autocomplete and landlord payment email were implemented after that audit and are marked **adopt now — high priority** as product decisions to keep and harden.

---

# TenantCloud vs Nexora Estate OS — 2026-08-24

**Sources:** Marketing and pricing pages on [tenantcloud.com](https://www.tenantcloud.com) (homepage, Features sub-pages, Use Cases Landlord/Tenant, Resources landlord forms, Pricing, Get Started); Help Center articles on [support.tenantcloud.com](https://support.tenantcloud.com) (listing syndication wizard, applications/screening, e-sign, bank reconciliation, tenant maintenance intake, Assurant renters insurance).  
**Compiled:** 2026-08-24  
**Scope:** Competitive research only. **Does not change** [`PRD-nexora-estate-os.md`](PRD-nexora-estate-os.md). “Fit” notes are **discussion material**, not a decision to add a phase or module.

**Evidence limits:** The 14-day trial was advertised and `/get-started` was reachable in the browser, but **in-product screens were not captured** (signup would create a real account; card/commitment gate was not confirmed end-to-end). Flows below are from public marketing + Help Center, which describe the product UI in step-by-step language. Some marketing pages reuse identical FAQ/pricing blocks across feature URLs (e.g. rent-reporting page mixing application copy); Help Center is treated as the more reliable source for mechanics.

**Screenshots (marketing, not app chrome):** [`tenantcloud-screenshots/`](tenantcloud-screenshots/) — homepage, rental application, accounting, rent reporting, pricing, get-started, syndication, leases, leads, maintenance, landlord forms.

**Personas (this file only):** Ada (small landlord), Bode (power user), Chinedu (caretaker), Funke (PM), Tunde (tenant), Sola (artisan) — same names as the Estate OS PRD.

---

## What TenantCloud is (observed positioning)

US all-in-one PMS: list → apply/screen → e-sign lease → collect rent → books + optional bank rec → tenant portal (pay, maintain, insurance, credit reporting). Public plans Starter / Growth / Pro / Business (~$15–$25 / $35 / $60 / custom from ~$100). Feature gates that matter for gaps: **bank reconciliation Pro+**; **listing website & logo Pro+**; **custom applications Pro+**; **lease builder + state-specific landlord forms** higher tiers; **team management** Business (limited team seats on Growth/Pro in the compare table). Screening marketed as applicant-paid (Asurint & TransUnion). **Rent reporting: U.S. residents only.**

Use cases: Landlord, Property Manager, Tenant, Service Pro, Owners. Resources: landlord forms (US attorney-reviewed templates); Fair Housing is referenced in application FAQs (FHA protected classes) rather than a dedicated page that resolved at `/property-management/fair-housing` (404 at research time).

---

## Priority gap table

| Category | What TenantCloud actually does (observed) | Our product today (PRD as written) | Personas if we built something similar | Fit note **for discussion** (not a roadmap add) |
|----------|-------------------------------------------|------------------------------------|----------------------------------------|------------------------------------------------|
| **Rental applications** | Landlord lists a unit or invites a lead. Applicant fills an online form: personal/household, residential history, employment/income, background; customizable templates; up to **40 pre-screening questions** (suggested: move-in date, pets, parking, smoke, income, deposit, broken lease, eviction — with Fair Housing caveats). Fees ~$20–$100, US state rules. Co-applicants get their own links. Drafts expire in **5 days**. **Screening is optional-or-required per listing**, not always automatic: Application Settings can require a TransUnion “Full Check” ($40; Essential vs Premium +$5; income verification can be included/excluded). If required, applicant must pay and complete screening when applying. Landlord can also request screening **after** apply from the application Actions / Screenings tab. Reports US-only; applicant identity verification. Marketing: Asurint & TransUnion. | **Thin intake ships:** unit invite → `/apply/{token}` → decide on `/applications` → draft tenancy. Gaps: decide UI lacks unit/answers; no auto claim handoff; no Lagos guarantor fields; no public listing page. Procedural build: [`applications-listing-build.md`](applications-listing-build.md). | Ada/Bode filling vacancies; Funke at volume; Tunde as applicant. Chinedu/Sola: weak fit. | **Phase 3 extension** (not a new phase). Skip US FCRA partners. |
| **Listing website / syndication** | Vacant unit flow (Help): Listings & Applications → List unit+ → **Property Information** (amenities, photos, description) → **Leasing Details** (rent, deposit, pets) → **Application Settings** (online apps, fee, **require screening package**) → **Marketing**. Listing website must be **activated** first (subdomain under Settings → Domain Settings). **Free syndication:** TenantCloud, Rentler, Realtor.com, Apartments.com. **Premium ~$30:** Zillow, Rent.com, Redfin, ApartmentGuide, Zumper. Account **verification** required for popular sites. Listings live **30 days** then auto-unlist unless auto-refresh (Business). AI listing copy (Cloudia) is a separate paid feature. | No listing site, no syndication. Vacancies are operational, not marketed in-product. | Ada/Bode/Funke marketing units. Tunde searching listings (their tenant portal). | **New module** vs Lagos channels (PropertyPro, Jiji, Instagram, agents) — US portals are not a local analog. A **landlord-owned listing page** is closer to Pro “listing website” than Zillow syndication. |
| **Online leases** | **Both** template generation **and** e-sign. After move-in / lease create: Request e-signature → pick Basic Residential / saved template / landlord forms → place Signature, Initials, Date Signed, Textbox; assign parties; optional Default Signatures; send. Statuses: draft / pending / signed. Connected tenants auto-share. Can upload PDF instead of e-sign. State-specific attorney-reviewed forms (lease, pet addendum, 24-hour notice, lead paint, etc.) — **US customers**, Growth+ for forms in Help. | Phase 3: store/share tenancy docs; no in-app e-sign or US form library observed in PRD. | Ada/Bode/Funke (landlords/PM); Tunde signs. | **Phase 3** could absorb “upload + request signature” without US templates. Nigerian stamp/duty and paper still dominate — discussion, not a copy of state forms. |
| **Accounting / reconciliation** | Income **and** expenses: invoices (rent, deposits, cleaning, maintenance), receipts, recurring txns, tags, multiple bank accounts/legal entities (tiered). Reports include rent roll, P&L, **1099**, tax prep / Schedule E style (US). Homepage mentions QBO. **Reconciliation (Pro+):** Financials → Reconciliation → connect bank feed → pick period → associate existing payments → **manual match** of statement lines to in-app txns (auto-suggest; multi-match; ignore personal; create missing payment; transfer). Help: “automatic bank reconciliation” feeds exist, **matching is currently manual**. Need online payments + at least one bank. Re-reconcile if you post into a closed period. | Phase 1: unit rent log, Paystack/manual, receipts — not full books. No bank-statement matching. | Bode/Funke (books, owners); Ada if she wants expense tracking. | Income/expense **could be discussed inside money phases**; **bank rec** looks like a **later finance module** (Open Banking / Nigerian banks ≠ Plaid-style US feeds). 1099/Schedule E = **US-only**. |
| **Rent reporting** | Marketing + FAQ: **U.S. residents only.** Tenant **opt-in**. Reports to **Equifax, Experian, TransUnion** (FAQ). $4.95/mo ongoing; historical up to 24 months ($49.95 + monthly on marketing). Late payments can hurt credit. Landlord invites; tenant controls enrollment. | Not in PRD. | Tunde (credit building); Ada/Funke as optional perk. | **US-market-specific. No plausible Lagos equivalent** as a consumer-bureau rent tradeline product. CRC/FirstCentral do not operate like this rent-to-FICO pipeline. **Skip for Nigeria unless a local bureau partnership appears.** |
| **Lead tracking** | Lightweight **leasing CRM**, not a generic sales CRM. Leads created when someone contacts via listing site, requests a tour, or applies. Landlord: statuses, assign to team, follow-up tasks, log calls/notes, activity timeline (inquired / toured / applied / contacted). **Invite to Apply** sends application link. SMS caps 10/15/20/custom by plan. | Contacts live on the unit/tenant; no prospect pipeline. | Funke (volume); Ada/Bode with vacancies. | Could sit with **applications/listings** if those exist; otherwise a **new leasing CRM**. WhatsApp follow-up is the local analog, not SMS caps. |
| **Tenant maintenance requests** | Tenant must be **connected + shared lease**. Dashboard **Request repair** or Requests → + Add. Step 1: location (if multi-lease), **priority**, photos (up to 10) / 15s video / files, category, sub-category, title, details. Step 2: allow entry if absent, preferred day/time → Complete. Landlord gets feed + email. Tenant tracks status and messages landlord / assigned Service Pro. Landlord board: New / In progress / In review / Resolved / Canceled. Vendor: Service Pro portal, Thumbtack partner (US local pros), auto-assign on higher tiers. | Phase 5 **F51**: landlord-initiated artisan work orders; Sola receives jobs. **No tenant-submitted intake.** Chinedu handles complaints informally. | **Tunde** intake; Ada/Bode/Funke/Chinedu triage; **Sola** as assignee (like Service Pro). | Strongest **existing-phase candidate: Phase 5** — add tenant-originated requests that become the same work-order object landlords already initiate. Not a new phase unless you want a separate “complaints” product. Thumbtack = US. |
| **Insurance** | **Partner referral, not TenantCloud’s own carrier.** Help: **Assurant**, **USA only**, from ~$16/mo by state. Landlord can require at Move-in (Renters → Leases → Move in → Tenants) or later on an active lease. Tenant buys via Assurant **or uploads external proof**. Optional gate: cannot sign or pay until proof. Not for mobile/manufactured, storage, commercial, room, garage. Tenant portal: purchase or submit existing policy. | Not in PRD. | Ada/Funke (lease requirement); Tunde (buy/upload). | **US product.** Lagos analog would be a **local insurer partner or proof-of-policy upload** on tenancy — discussion under Phase 3 docs, not Assurant. |

---

## Other surfaces (thinner pass)

| Surface | Observed | Relevance |
|---------|----------|-----------|
| **Tenant screening (standalone)** | TransUnion Full Check; local county searches; income verification; US properties/applicants only. | US FCRA. Lagos: bank statements, employer letter, guarantor — not this stack. |
| **Team management** | Business-tier roles, property permissions, calendar, PM mode. | Overlaps Phase 4 Funke/staff conceptually. |
| **Reports** | Rent roll, P&L, owner statements, 1099, vacant units, insurance, etc. | Mix of useful ops reports vs US tax. |
| **AI Assistant** | Listing description (Cloudia); marketing, not a full ops copilot. | Optional copy aid; not a gap vs PRD. |
| **Service Pro** | Vendor portal + Thumbtack; maps to Sola + marketplace, US-shaped. | |
| **Landlord forms / Fair Housing** | Forms catalog is US legal templates. Fair Housing is compliance copy on applications, not a product feature. | Do not copy FHA forms. NDPA / local tenancy law is the analog if we ever write resources. |

---

## US-market-specific (likely irrelevant to a Lagos landlord)

1. **Rent reporting to Equifax / Experian / TransUnion** — explicit U.S. residents only.  
2. **Assurant renters insurance** — USA only.  
3. **TransUnion / Asurint / FCRA screening, county criminal, US eviction files.**  
4. **Syndication to Zillow, Apartments.com, Realtor.com, Rentler, Redfin, Zumper, etc.**  
5. **1099, Schedule E / US tax reports, ACH fee schedule in USD.**  
6. **State-specific landlord forms, lead-based paint disclosure, Massachusetts application-fee bans, etc.**  
7. **Thumbtack contractor network.**

---

## Evidence gaps (this pass)

- No authenticated landlord or tenant dashboard screenshots.  
- Exact applicant form field-by-field UI not walked.  
- Tenant e-sign UI (the signer’s clicks) not observed — only landlord “Request e-signature” Help steps.  
- Whether `/get-started` collects a card before trial was not completed.
