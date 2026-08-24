# Smart Prop — authenticated flow audit

**App:** http://localhost:3000  
**Audited:** 2026-07-31  
**Account:** `+2348139608051` (OTP login)  
**Viewports:** desktop `1440×900`, mobile `390×844`  
**Screenshots:** [`docs/our-app-screenshots/`](our-app-screenshots/)

### Method notes
- Existing portfolio data was cleared once via API so empty-state and onboarding could be exercised (account already had properties, so login normally skips onboarding).
- Receipt PDFs open as a **browser download**, not an in-app page; UI evidence is the **View Receipt** row, plus saved file [`18-receipt.pdf`](our-app-screenshots/18-receipt.pdf).
- Some Next.js unit-payment routes returned **HTTP 500** intermittently during the session (skeleton table stuck); API still served payment history. Flagged below.

---

## Screenshot index

| Step | Desktop | Mobile |
|------|---------|--------|
| Login | [01-login-desktop-1440.png](our-app-screenshots/01-login-desktop-1440.png) | [01-login-mobile-390.png](our-app-screenshots/01-login-mobile-390.png) |
| OTP | [02-login-otp-desktop-1440.png](our-app-screenshots/02-login-otp-desktop-1440.png) | [02-login-otp-mobile-390.png](our-app-screenshots/02-login-otp-mobile-390.png) |
| Post-login (verifying) | [03-post-login-desktop-1440.png](our-app-screenshots/03-post-login-desktop-1440.png) | — |
| Dashboard (existing data) | [04-dashboard-populated-desktop-1440.png](our-app-screenshots/04-dashboard-populated-desktop-1440.png) | [04-dashboard-populated-mobile-390.png](our-app-screenshots/04-dashboard-populated-mobile-390.png) |
| Onboarding Welcome | [05-onboarding-welcome-desktop-1440.png](our-app-screenshots/05-onboarding-welcome-desktop-1440.png) | [05-onboarding-welcome-mobile-390.png](our-app-screenshots/05-onboarding-welcome-mobile-390.png) |
| Onboarding Property | [06-onboarding-property-desktop-1440.png](our-app-screenshots/06-onboarding-property-desktop-1440.png) | [06-onboarding-property-mobile-390.png](our-app-screenshots/06-onboarding-property-mobile-390.png) |
| Onboarding Unit (+ Skip) | [07-onboarding-unit-desktop-1440.png](our-app-screenshots/07-onboarding-unit-desktop-1440.png) | [07-onboarding-unit-mobile-390.png](our-app-screenshots/07-onboarding-unit-mobile-390.png) |
| After Skip | [08-dashboard-after-skip-desktop-1440.png](our-app-screenshots/08-dashboard-after-skip-desktop-1440.png) | [08-dashboard-after-skip-mobile-390.png](our-app-screenshots/08-dashboard-after-skip-mobile-390.png) |
| Empty dashboard | [09-dashboard-empty-desktop-1440.png](our-app-screenshots/09-dashboard-empty-desktop-1440.png) | [09-dashboard-empty-mobile-390.png](our-app-screenshots/09-dashboard-empty-mobile-390.png) |
| Add property | [10-add-property-desktop-1440.png](our-app-screenshots/10-add-property-desktop-1440.png) | [10-add-property-mobile-390.png](our-app-screenshots/10-add-property-mobile-390.png) |
| Add unit | [12-add-unit-desktop-1440.png](our-app-screenshots/12-add-unit-desktop-1440.png) | [12-add-unit-mobile-390.png](our-app-screenshots/12-add-unit-mobile-390.png) |
| Dashboard with unit | [13-dashboard-with-unit-desktop-1440.png](our-app-screenshots/13-dashboard-with-unit-desktop-1440.png) | [13-dashboard-with-unit-mobile-390.png](our-app-screenshots/13-dashboard-with-unit-mobile-390.png) |
| Payments list | [14-payments-list-desktop-1440.png](our-app-screenshots/14-payments-list-desktop-1440.png) | [14-payments-list-mobile-390.png](our-app-screenshots/14-payments-list-mobile-390.png) |
| Unit payments | [15-unit-payments-desktop-1440.png](our-app-screenshots/15-unit-payments-desktop-1440.png) | [15-unit-payments-mobile-390.png](our-app-screenshots/15-unit-payments-mobile-390.png) |
| Manual payment form | [16-manual-payment-form-desktop-1440.png](our-app-screenshots/16-manual-payment-form-desktop-1440.png) | [16-manual-payment-form-mobile-390.png](our-app-screenshots/16-manual-payment-form-mobile-390.png) |
| Payment recorded + View Receipt | [17-payment-recorded-desktop-1440.png](our-app-screenshots/17-payment-recorded-desktop-1440.png) | [17-payment-recorded-mobile-390.png](our-app-screenshots/17-payment-recorded-mobile-390.png) |
| Receipt artifact | [18-receipt.pdf](our-app-screenshots/18-receipt.pdf) (download; UI = View Receipt on 17/18 PNGs) | |
| Reminders portfolio | [19-reminders-log-desktop-1440.png](our-app-screenshots/19-reminders-log-desktop-1440.png) | [19-reminders-log-mobile-390.png](our-app-screenshots/19-reminders-log-mobile-390.png) |
| Unit reminder log | [19b-unit-reminders-desktop-1440.png](our-app-screenshots/19b-unit-reminders-desktop-1440.png) | [19b-unit-reminders-mobile-390.png](our-app-screenshots/19b-unit-reminders-mobile-390.png) |
| Settings · Profile | [20-settings-profile-desktop-1440.png](our-app-screenshots/20-settings-profile-desktop-1440.png) | [20-settings-profile-mobile-390.png](our-app-screenshots/20-settings-profile-mobile-390.png) |
| Settings · Notifications | [21-settings-notifications-desktop-1440.png](our-app-screenshots/21-settings-notifications-desktop-1440.png) | [21-settings-notifications-mobile-390.png](our-app-screenshots/21-settings-notifications-mobile-390.png) |
| Settings · Security | [22-settings-security-desktop-1440.png](our-app-screenshots/22-settings-security-desktop-1440.png) | [22-settings-security-mobile-390.png](our-app-screenshots/22-settings-security-mobile-390.png) |
| User menu | [23-user-menu-desktop-1440.png](our-app-screenshots/23-user-menu-desktop-1440.png) | [23-user-menu-mobile-390.png](our-app-screenshots/23-user-menu-mobile-390.png) |
| Signed out | [24-signed-out-desktop-1440.png](our-app-screenshots/24-signed-out-desktop-1440.png) | [24-signed-out-mobile-390.png](our-app-screenshots/24-signed-out-mobile-390.png) |

---

## Flow by step

### 1. Login → OTP
- Phone tab default (NG +234). Primary CTA: **Send verification code**.
- OTP step shows destination `+2348139608051` and **Verify and sign in** / **Use a different number**.
- Verify can sit on “Verifying…” for several seconds before redirect (slow but succeeds).
- Copy mismatch: subtitle says “Sign in with **WhatsApp** or email” while helper text says code is sent by **SMS**.

**Mobile:** centered auth card; works. No major layout break.

### 2. Post-login routing
- Returning users with ≥1 property land on `/properties` (onboarding skipped).
- Onboarding only auto-runs when the portfolio has zero properties.

### 3. Onboarding (3 steps + Skip)
Forced via `/onboarding` after clearing portfolio.

| Step | UI | Next action |
|------|-----|-------------|
| 1 Welcome | Stepper + “Welcome, {name}” + **Continue** | Clear |
| 2 Property | Name / address / type + **Continue** / **Back** | Clear |
| 3 Unit | Full unit form + **Continue** / **Back** + **Skip for now** | Clear |

**Skip path:** only on step 3. Creates property then routes to `/properties` without a unit.

**Issues**
- A property with **no units does not appear** in the properties table (table is unit-centric). After Skip, if other units exist they dominate; the new property is easy to “lose.”
- No Skip on Welcome/Property — only unit step (by design, but not obvious).

### 4. Dashboard empty state
Settled empty state (after delete):

- Stats: ₦0 / ₦0 / 0  
- Card: **“No units yet.”** + **Add your first unit**  
- Header still has **Add property**

**Issues**
- Empty CTA “Add your first unit” goes to `/onboarding` when there are no properties — good — but if a property exists with zero units, the empty card + “Add unit” header can disagree about where to go.
- First paint often shows **skeleton stats/table** before empty card (easy to screenshot as “stuck loading”).
- Duplicate **Account** control: sidebar footer + top-right.

### 5. Add property → add unit
- `/properties/new` and `/properties/{id}/units/new` forms are clear; primary green submit.
- After property create, flow can continue into unit create (deep link with property id).
- Dashboard with unit shows stats, PAID/OVERDUE badges, Edit unit / Edit property.

**Spacing:** generous whitespace; table + stat cards consistent with rest of app. Mobile keeps sidebar collapse / stacked header actions.

### 6. Payments → manual payment → receipt
- `/payments` lists units; copy tells user to open a unit (no inline record action) — one extra click, not a dead end.
- Unit page: **Record Manual Payment** (secondary) + **Pay with Paystack** (primary). Hierarchy implies Paystack is preferred even for landlords logging cash — may be wrong emphasis.
- Manual form: amount + optional reference; **Save payment**.
- After success: row with `manual` / **PAID** / **View Receipt**.

**Receipt**
- `receipt_url` is a public Supabase Storage PDF.
- Clicking **View Receipt** triggers a **file download**, not an in-app viewer (browser-dependent).
- Evidence: [`18-receipt.pdf`](our-app-screenshots/18-receipt.pdf).

**Broken / risky**
- `/payments/[unitId]` intermittently returned **500** with indefinite skeletons (Next client page). API `/payments/unit/{id}` still OK.
- Manual form can remain open after a successful save (duplicate-payment risk).
- Red Next.js **“2 Issues”** badge appeared during payment views (dev overlay — hide in prod, but signals runtime errors).

### 7. Reminders log
- Portfolio reminders: select units + **Remind selected**; status chips (e.g. PAID).
- Unit log (`/reminders/[unitId]`): type / channel / status / sent at.
- Observed row: `receipt` · `whatsapp` · **failed** when recording payment (channel mismatch vs SMS-default settings).

**Issues**
- Unit reminders page sometimes captured as long-running skeleton (slow client fetch / error).
- Failed outbound messages have no obvious retry/explain CTA on the row — log feels like a dead-end for recovery.

### 8. Settings (3 tabs)
| Tab | Contents | Notes |
|-----|----------|-------|
| Profile | Name, business, phone (read-only), email, Appearance Light/Dark, Save | Phone “—” / empty fields when `fetchMe` lags; duplicate theme control (sidebar moon + Appearance) |
| Notifications | Reminder/receipt channel (SMS / WhatsApp / Email) | Aligns with product; WhatsApp caveats in copy |
| Security | Phone change OTP + password (if email identity) | Clear secondary flows |

**Issues**
- Profile load race: avatar “?”, name empty, phone “—” despite authenticated phone user.
- Two theme toggles (sidebar + Profile Appearance).

### 9. Sign out
- User menu → sign-out posts to `/auth/signout` → `/login`.
- Works; returns to phone login card.

---

## Cross-cutting findings

### Broken transitions
1. **Unit payments page 500 / stuck skeletons** — highest severity in this pass.  
2. **OTP → dashboard latency** — long Verifying state, no progress beyond button label.  
3. **Skip unit → invisible property** — property without units absent from main list.  
4. **Receipt = download** — fine functionally, abrupt vs “view” wording.

### Inconsistent spacing / chrome
- Auth + onboarding: centered cards, large padding — polished.
- Dashboard: airy stats + table; mobile compresses OK.
- Duplicate Account chips (sidebar + topbar) waste space and confuse hierarchy.
- Dev **“2 Issues”** badge overlapping sidebar footer.

### Dead-ends / weak next actions
| Screen | Problem |
|--------|---------|
| Property after Skip (no units) | Not listed; user must remember **Add unit** |
| Payments index | Must open unit — OK, but no empty-state CTA if list empty beyond copy |
| Reminder row `failed` | No retry / error detail CTA |
| Receipt link | Leaves app via download; no “done / back” context |
| Profile while loading | Looks like empty account with no loading label on fields |

### Copy / product consistency
- Login: WhatsApp vs SMS messaging conflict.
- Paystack styled as primary over “Record Manual Payment” on unit payments.
- Onboarding brand “Smart Prop” vs longer product name elsewhere.

---

## Severity summary

| Severity | Item |
|----------|------|
| High | `/payments/[unitId]` intermittent 500 / infinite skeleton |
| High | Skip-created (or unit-less) properties invisible on Properties list |
| Medium | Receipt “View” downloads PDF with no in-app confirmation |
| Medium | Settings/profile & Account avatar load race (`?`, empty fields) |
| Medium | Reminder/receipt WhatsApp `failed` with no recovery UI |
| Low | Login WhatsApp vs SMS copy; duplicate Account + theme controls |
| Low | Manual payment form stays open after save |

---

## What worked well
- Phone OTP login completes end-to-end.
- Onboarding stepper (Welcome → Property → Unit) is clear; **Skip for now** is explicit.
- True empty state (“No units yet” + CTA) is clear once data settles.
- Manual payment → PAID → receipt PDF generation works (API + Storage).
- Settings three-tab structure is understandable.
- Sign-out cleanly returns to login.
- Visual system (forest green primary, mono amounts, status badges) is consistent across dashboard surfaces.
