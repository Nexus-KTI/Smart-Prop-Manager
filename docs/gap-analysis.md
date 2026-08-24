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
