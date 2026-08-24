# Rentora authenticated product audit

**Source:** https://rentora.co.uk  
**Audited:** 2026-07-31  
**Viewports:** desktop `1440×900`, mobile `390×844`  
**Accounts used:** landlord/agent + tenant (credentials not stored in this doc)  
**Screenshots:** [`docs/rentora-auth-screenshots/`](rentora-auth-screenshots/)

---

## Executive finding

**Landlord/agent product surfaces are not reachable without an active paid subscription.** After login, the landlord account is forced to `/dashboard/user/subscriptions` (“Not Subscribed”) and cannot open the landlord dashboard, properties, tenants, or payments. Checkout asks for a card on **£180/year** or **£20/month** — no free-trial path was shown.

**Tenant product is fully accessible without subscription.** The rest of this audit documents the tenant app in depth, plus the landlord paywall/onboarding gate.

---

## Screenshot index

### Auth & landlord gate
| Screen | Desktop | Mobile |
|--------|---------|--------|
| Login | [00-login-desktop-1440.png](rentora-auth-screenshots/00-login-desktop-1440.png) | [00-login-mobile-390.png](rentora-auth-screenshots/00-login-mobile-390.png) |
| Landlord subscription gate | [01-subscription-gate-desktop-1440.png](rentora-auth-screenshots/01-subscription-gate-desktop-1440.png) | [01-subscription-gate-mobile-390.png](rentora-auth-screenshots/01-subscription-gate-mobile-390.png) |
| Subscribe / plan + card | [03-subscribe-new-desktop-1440.png](rentora-auth-screenshots/03-subscribe-new-desktop-1440.png) | [03-subscribe-new-mobile-390.png](rentora-auth-screenshots/03-subscribe-new-mobile-390.png) |

### Tenant app
| Screen | Desktop | Mobile |
|--------|---------|--------|
| Overview (home) | [11-tenant-overview-desktop-1440.png](rentora-auth-screenshots/11-tenant-overview-desktop-1440.png) | [11-tenant-overview-mobile-390.png](rentora-auth-screenshots/11-tenant-overview-mobile-390.png) |
| User menu | [11b-tenant-user-menu-desktop-1440.png](rentora-auth-screenshots/11b-tenant-user-menu-desktop-1440.png) | [11b-tenant-user-menu-mobile-390.png](rentora-auth-screenshots/11b-tenant-user-menu-mobile-390.png) |
| Messages | [12-tenant-messages-desktop-1440.png](rentora-auth-screenshots/12-tenant-messages-desktop-1440.png) | [12-tenant-messages-mobile-390.png](rentora-auth-screenshots/12-tenant-messages-mobile-390.png) |
| Tasks | [13-tenant-tasks-desktop-1440.png](rentora-auth-screenshots/13-tenant-tasks-desktop-1440.png) | [13-tenant-tasks-mobile-390.png](rentora-auth-screenshots/13-tenant-tasks-mobile-390.png) |
| Payments | [14-tenant-payments-desktop-1440.png](rentora-auth-screenshots/14-tenant-payments-desktop-1440.png) | [14-tenant-payments-mobile-390.png](rentora-auth-screenshots/14-tenant-payments-mobile-390.png) |
| Tenancies | [15-tenant-tenancies-desktop-1440.png](rentora-auth-screenshots/15-tenant-tenancies-desktop-1440.png) | [15-tenant-tenancies-mobile-390.png](rentora-auth-screenshots/15-tenant-tenancies-mobile-390.png) |
| Invite landlord (CTA) | [15b-invite-landlord-desktop-1440.png](rentora-auth-screenshots/15b-invite-landlord-desktop-1440.png) | [15b-invite-landlord-mobile-390.png](rentora-auth-screenshots/15b-invite-landlord-mobile-390.png) |
| Rents | [16-tenant-rents-desktop-1440.png](rentora-auth-screenshots/16-tenant-rents-desktop-1440.png) | [16-tenant-rents-mobile-390.png](rentora-auth-screenshots/16-tenant-rents-mobile-390.png) |
| Fees | [17-tenant-fees-desktop-1440.png](rentora-auth-screenshots/17-tenant-fees-desktop-1440.png) | [17-tenant-fees-mobile-390.png](rentora-auth-screenshots/17-tenant-fees-mobile-390.png) |
| Applications | [18-tenant-applications-desktop-1440.png](rentora-auth-screenshots/18-tenant-applications-desktop-1440.png) | [18-tenant-applications-mobile-390.png](rentora-auth-screenshots/18-tenant-applications-mobile-390.png) |
| Notifications inbox | [19-tenant-notifications-desktop-1440.png](rentora-auth-screenshots/19-tenant-notifications-desktop-1440.png) | [19-tenant-notifications-mobile-390.png](rentora-auth-screenshots/19-tenant-notifications-mobile-390.png) |
| Settings hub | [20-tenant-settings-desktop-1440.png](rentora-auth-screenshots/20-tenant-settings-desktop-1440.png) | [20-tenant-settings-mobile-390.png](rentora-auth-screenshots/20-tenant-settings-mobile-390.png) |
| Bank cards | [21-settings-bank-cards-desktop-1440.png](rentora-auth-screenshots/21-settings-bank-cards-desktop-1440.png) | [21-settings-bank-cards-mobile-390.png](rentora-auth-screenshots/21-settings-bank-cards-mobile-390.png) |
| Email | [22-settings-email-desktop-1440.png](rentora-auth-screenshots/22-settings-email-desktop-1440.png) | [22-settings-email-mobile-390.png](rentora-auth-screenshots/22-settings-email-mobile-390.png) |
| Telephone | [23-settings-telephone-desktop-1440.png](rentora-auth-screenshots/23-settings-telephone-desktop-1440.png) | [23-settings-telephone-mobile-390.png](rentora-auth-screenshots/23-settings-telephone-mobile-390.png) |
| Password | [24-settings-password-desktop-1440.png](rentora-auth-screenshots/24-settings-password-desktop-1440.png) | [24-settings-password-mobile-390.png](rentora-auth-screenshots/24-settings-password-mobile-390.png) |
| Notification preferences | [25-settings-notification-prefs-desktop-1440.png](rentora-auth-screenshots/25-settings-notification-prefs-desktop-1440.png) | [25-settings-notification-prefs-mobile-390.png](rentora-auth-screenshots/25-settings-notification-prefs-mobile-390.png) |

---

## 1. Login

- URL: `/auth/login`
- Fields: Email, Password, Remember me, **Login**
- Links: Forgot password, Create account
- Cookie banner on first visit (countdown close)
- Same form for landlord and tenant; role is determined after auth

**Mobile:** centered card; usable.

---

## 2. Landlord / agent — post-login gate (onboarding = paywall)

### What happens after login
1. Auth succeeds.
2. Redirect to  
   `/dashboard/user/subscriptions?intended=https://rentora.co.uk/dashboard/landlords/{id}`
3. Screen: **Not Subscribed** — “You don't currently have an active plan with Rentora.”
4. Primary CTA: **Subscribe** → `/dashboard/user/subscriptions/new`
5. Invoices empty: *There's nothing here!*

### Navigation structure (landlord, unsubscribed)
**None.** No sidebar, no property nav, no account settings. Only logo + Subscribe + legal footer.

Attempting `/dashboard`, `/dashboard/landlords/{id}`, `/dashboard/properties`, `/dashboard/user/profile`, etc. either rebounds to subscriptions or 404s.

### Subscribe / “trial” checkout
- Headline: **Welcome to Rentora!**
- Plan choice:
  - **£180/year** — “Most popular. Save 25%.”
  - **£20/month** — “Commitment free.”
- Requires **bank card** (name, number, expiry, CVC) + billing address
- CTA: **Subscribe**
- **No free trial, skip, or “start without card” path** was visible

> Marketing site still advertises ~£15/mo; authenticated checkout shows **£20/mo / £180/yr**. Treat as pricing inconsistency.

### Landlord screens requested — status
| Requested area | Accessible? |
|----------------|-------------|
| Dashboard/home | **No** — subscription gate only |
| Add property | **No** |
| Tenant/unit management | **No** |
| Payment recording/view | **No** |
| Notifications/reminders settings | **No** |
| Account/profile settings | **No** (URLs 404 / gate) |

**Implication for Smart Prop:** Rentora’s landlord funnel is **paywall-first**. Product empty states and property UX cannot be audited until a card is attached or Rentora enables a true trial on this account.

---

## 3. Tenant — navigation structure

**Base:** `/dashboard/tenants/{id}/…`

### Desktop sidebar
| Item | Role |
|------|------|
| Overview | Home / calendar + tasks |
| Messages | Landlord chat |
| Tasks | To-dos (+ New Task) |
| Payments | Payment history (statement-like) |
| Tenancies | Join/list tenancies |
| Rents | Due / upcoming rents |
| Fees | Non-rent charges |
| Applications | Listing applications |
| Logout | Sign out |

**Header (not in sidebar list, but in page chrome):** Search · Notifications (bell) · Settings (gear) · Profile menu (`{Name}` / **TENANT**)

**Profile menu:** Switch profile · New profile (multi-profile support)

### Mobile
- Same destinations; nav collapses (hamburger / drawer pattern).
- Overview mobile still exposes full link list when menu open ([11c-tenant-overview-mobile-nav-390.png](rentora-auth-screenshots/11c-tenant-overview-mobile-nav-390.png)).

### How nav changes
- Structure is **stable across tenant pages** (same sidebar).
- Active item highlights (e.g. Overview).
- Settings / Notifications are header icons → separate routes, not always sidebar-highlighted.

---

## 4. Tenant — onboarding after login

On **Overview**:
- Dismissible welcome card: **“Welcome to Rentora, {name}!”**
- Explains dashboard hints; points users to menu / top icon to explore.
- Calendar + Schedule for coming days (“Nothing planned.”)
- Tasks strip: *There's nothing here!*

This is soft onboarding (hints), not a multi-step wizard. No forced property/tenancy setup for tenants.

---

## 5. Tenant — empty states (major screens)

| Screen | Empty copy | Next action |
|--------|------------|-------------|
| Overview schedule | Nothing planned. | Explore calendar / wait for events |
| Overview tasks | There's nothing here! | Implicit → Tasks |
| Messages | No messages / haven’t exchanged any | Wait for landlord / start chat (if enabled) |
| Tasks | No tasks / You haven't got anything to do! | **New Task** |
| Payments | No payments / You haven't made any payments yet. | Needs tenancy + rent (dead-end until linked) |
| Tenancies | No tenancies found / haven't joined yet | **Invite your landlord** (+ copy that landlord invites you) |
| Rents | No rents / There aren't any rents yet. | Depends on tenancy |
| Fees | No fees | Depends on landlord |
| Applications | No applications | **Find a new home** |
| Notifications | You don't have any notifications | Explains inbox is backup if email/SMS off |
| Bank cards | You haven't added a card yet | **New Card** |

Empty states are generally strong: italic placeholder + short explanation + CTA where relevant.

**Weak CTAs observed**
- **Invite your landlord** / **Find a new home** clicks did not navigate to a distinct URL in automation (likely modal or in-place UI). Worth verifying manually — risk of looking like a dead control.
- **Payments** empty has no primary “Pay rent” until a tenancy exists — correct, but easy to feel stuck.

---

## 6. Tenant — payments

- Route: `/payments`
- Framed as bank-statement style history (payee, tenancy, property).
- Empty for this trial tenant (no tenancy linked).
- **Recording payments as tenant** is not a separate “log cash” flow here; paying happens once rents/fees exist (card via Bank Cards settings).
- Receipt concept: notification prefs say successful payment email “serves as your receipt.”

Landlord-side payment recording could not be audited (paywalled).

---

## 7. Tenant — notifications & reminders settings

### Inbox
`/notifications` — empty inbox; copy: useful if email/SMS disabled.

### Preferences
`/settings/notification-preferences` — matrix of events × **Email** / **SMS** (all checked by default in audit).

Events include (non-exhaustive):
- Offline payment accepted / rejected / landlord-added
- Payment fails / succeeds / needs manual confirmation
- Fee due / fee late
- Message received
- Rent due / late / due soon (3 days) / extended
- Invited to tenancy
- Fee made for tenancy
- Tenancy rolls fixed → periodic

SMS gated: must **add and verify telephone** first.  
Telephone settings showed **Unconfirmed Telephone Number** + SMS confirm link prompt.

---

## 8. Tenant — account / profile settings

**Hub:** `/settings`

| Section | Destination | Purpose |
|---------|-------------|---------|
| Bank Cards | `/bank-cards` | Add cards for rent pay (**New Card**) — typo in UI: “**Mange** your bank cards.” |
| Email | `/settings/email` | Update email |
| Telephone | `/settings/telephone` | Update / confirm phone |
| Password | `/settings/password` | Points to password-reset process (**Reset Password**) |
| Notification Preferences | `/settings/notification-preferences` | Email/SMS matrix |

No separate “display name / avatar” profile editor found under `/settings/profile` (404).

---

## 9. Tenant / unit management (tenant lens)

There is **no landlord-style unit CRUD** for tenants. Closest surfaces:

| Screen | Meaning |
|--------|---------|
| Tenancies | Join/list tenancies (invitation-based) |
| Rents | Per-tenancy rent schedule / pay |
| Fees | Extra charges |
| Applications | Apply to public listings |

Without a landlord invite, tenancy/rent/fee lists stay empty — expected for a fresh tenant trial.

---

## 10. Cross-cutting UX notes

| Topic | Observation |
|-------|-------------|
| Role split | Landlord = paid SaaS; Tenant = free companion app |
| Pricing mismatch | Marketing ~£15 vs checkout £20/mo or £180/yr |
| Copy quality | Strong empty-state explanations; occasional typos (“Mange”, “recipt”) |
| Visual system | Tenant app: dark slate sidebar + white cards; Landlord gate: marketing-like blue geometric background |
| Multi-profile | Tenant header supports Switch profile / New profile |
| Dead-end risk | Landlord unsubscribed state has only Subscribe (no browse-readonly mode) |

---

## What could not be completed

Because the landlord account has **no active plan**, these requested landlord flows were **not screenshot-able**:

1. Landlord dashboard with properties  
2. Add property flow  
3. Tenant/unit management (landlord side)  
4. Landlord payment recording  
5. Landlord notification/reminder settings  
6. Landlord account/profile settings  

**To finish the landlord half of this audit:** activate a subscription/trial on the landlord account (or provide an already-subscribed landlord login), then re-run the same screenshot checklist.

---

## Takeaways for Smart Prop

1. **Don’t hard-paywall before first property** — Rentora’s landlord gate blocks all learning; Smart Prop’s onboarding wizard is a clearer first-run.
2. **Tenant empty states are a good model** — short explanation + one CTA (Invite landlord / Add card / Find home).
3. **Notification preference matrix** (event × Email/SMS) is a useful pattern for reminders/receipts.
4. **Align marketing price with checkout** — Rentora’s £15 vs £20 inconsistency erodes trust; avoid the same trap.
5. **Role-specific shells** (dark sidebar tenant app vs light marketing gate) keep personas distinct — consider separate landlord vs tenant chrome if you add tenant login later.
