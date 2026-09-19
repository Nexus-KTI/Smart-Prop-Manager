# TenantCloud — Landlord / PM portal audit (procedure)

**Status:** Phase A ✅ · Phase B partial (trial form reached) · Phase C/D Help-backed IA confirmed · live in-app chrome still blocked on OTP/session  
**Started:** 2026-08-26  
**Last procedural run:** 2026-08-27  
**Prerequisite:** Tenant role closed — [`tenantcloud-tenant-product-audit.md`](tenantcloud-tenant-product-audit.md) §6–7  
**Related:** Marketing/Help gap table in [`gap-analysis.md`](gap-analysis.md) (TenantCloud section); Nexora tenant smoke [`tenant-settings-smoke.md`](tenant-settings-smoke.md)

---

## 0. Goal

Capture **how a landlord/PM actually works** in TenantCloud day-to-day, then map only NG-relevant patterns to Nexora (Ada / Bode / Funke / Chinedu).  
Do **not** expand scope into Owner or Service Pro until this role is closed.

---

## 1. Procedure (do in order)

### Phase A — Prep (no login required) ✅

1. Confirm tenant audit closed and deferrals accepted. ✅  
2. Map public landlord marketing IA (`tenantcloud.com/landlord`). ✅ — see §4 A2  
3. Map Help Center “for landlords” article clusters. ✅ — see §4 A3  
4. List expected in-app nav hypotheses before login (to falsify live). ✅ — see §2  

### Phase B — Auth

1. Sign in as **landlord/PM** (not the Emmanuel tenant session).  
2. Prefer an account with at least one property + unit; note plan tier if shown.  
3. Record: login method, any OTP/reCAPTCHA, landing URL after auth.  
4. If cookie import fails (DPAPI), use headed browse + handoff once.

### Phase C — Shell + home (screenshot each)

| Step | Capture |
|------|---------|
| C1 | Global chrome: sidebar labels, header utilities, FAB |
| C2 | Dashboard / home widgets (balances, tasks, outstanding) |
| C3 | Empty vs populated differences if visible |

### Phase D — Core money path (priority)

| Step | Area | Capture |
|------|------|---------|
| D1 | Properties / units list | Empty CTA, filters, add property |
| D2 | Property / unit detail | Tabs or sections |
| D3 | Tenants / leases | Invite, move-in, statuses |
| D4 | Rent / invoices / transactions | Post rent, reminders, overdue |
| D5 | Online payments / payouts settings | If reachable without card wall |

### Phase E — Ops path

| Step | Area | Capture |
|------|------|---------|
| E1 | Maintenance board | Columns/statuses, assign vendor |
| E2 | Messages / publications | Landlord-side hub |
| E3 | Access / keys / vendors | If present |

### Phase F — Leasing path (thin if US-heavy)

| Step | Area | Capture |
|------|------|---------|
| F1 | Listings / syndication | Note US portals; extract **listing page** pattern only |
| F2 | Applications / screening | Note FCRA US; extract **intake pipeline** only |
| F3 | E-sign / forms | Upload+sign vs state templates |

### Phase G — Books / team (thin)

| Step | Area | Capture |
|------|------|---------|
| G1 | Expenses / reports | Which reports exist |
| G2 | Bank reconciliation | Skip deep match UI if Pro-gated |
| G3 | Team / roles | Seats, property permissions |

### Phase H — Settings

| Step | Capture |
|------|---------|
| H1 | Account settings tabs (compare to tenant) |
| H2 | Company / branding / domain / payment setup |

### Phase I — Close role

1. Fill evidence log (section 4).  
2. Write **Nexora disposition** table (adopt / adapt / defer / skip).  
3. Mark landlord role COMPLETE before starting Owner or Service Pro.

---

## 2. Hypothesized landlord nav (to verify live)

From marketing + Help “left-side menu” copy — **Help-confirmed groups (2026-08-27):**

| Hypothesized group | Labels / notes | Confidence |
|--------------------|----------------|------------|
| Home | Dashboard (Customize dashboard widgets) | Help |
| **Property Operations** | **Portfolio** → Properties · Units (vacant/occupied filters, + Add property) | Help article |
| People | **Contacts** (tenants, owners, service pros) | Help |
| **Financials** | **Transactions** (Revenues / Expenses), recurring rent invoices, mortgage | Help |
| Ops | **Maintenance** / Requests (board + statuses) | Help |
| Docs | Documents / Forms | Help |
| Reports | Reports left-side | Help |
| Leasing | Listings · Applications · Screenings · Move-in | Marketing + Help clusters |
| Comms | Messenger / Property board | Marketing |
| Admin | Calendar · Tasks · Team · Settings | Help clusters |

Falsify exact URLs and rail labels in live Phase C.

---

## 3. Nexora mapping rules (while auditing)

| If TC shows… | We care if… | Otherwise |
|--------------|-------------|-----------|
| USD ACH / Zillow / TransUnion / 1099 / Assurant | — | **Skip** (US-only) |
| Property → unit → tenant → rent → chase | Matches Ada/Bode money loop | **Adopt/adapt** |
| Maintenance board → vendor | Matches F51 artisans | **Adapt** |
| Owner statements | Funke→Ada transparency | Note for later Owner portal |
| Listing website (own subdomain) | Stronger than syndication | **Discuss** as optional marketing page |
| Team property permissions | Phase 4 staff | **Compare** to our memberships |

---

## 4. Evidence log

| ID | URL / screen | Result | Screenshot |
|----|--------------|--------|------------|
| A1 | Tenant audit closed | ✅ COMPLETE | — |
| A2 | Marketing `/landlord` | ✅ | browse |
| A3 | Help Landlord collection | ✅ 346 articles | — |
| A4 | Nav hypotheses | ✅ refined 2026-08-27 (§2) | — |
| B0 | Cookie import Chrome | ❌ DPAPI (Chrome open / locked) 2026-08-27 | — |
| B1a | `/signup/role` | ✅ Landlord vs Tenant radios; Next disabled until select | `screenshots/b1-qualify-done.png` (post-qualify) |
| B1b | Landlord qualify | ✅ Persona · units · years → Next | same |
| B1c | `/signup?role=admin&mode=1` | ✅ Trial form: Google **or** Email + first/last + **phone required** + password + “Start my free trial” | same |
| B1d | `/login` | ✅ Google · Apple · Facebook · Email + password · Keep signed in 60 days · reCAPTCHA | — |
| B1e | Complete auth → app shell | 🔶 Auth OK (user **Emmanuel**); stuck on `/on_boarding/subscription` plan picker (step 3 of 3) — click **Start trial** to enter shell | `screenshots/b1e-subscription-plans.png` |
| C1–C2 | Shell / dashboard | ⏳ After B1e Start trial | — |
| D1 | Portfolio / units | 🔶 Help: Property Operations → Portfolio → Units | — |
| D4 | Transactions / rent invoice | 🔶 Help: Financials → Transactions; post next invoice / recurring | — |
| E1 | Maintenance | 🔶 Help: Maintenance / Requests left-side | — |
| F–H | Leasing / books / settings | _pending live_ | |

### 4.3 Phase B–D procedural notes (2026-08-27)

**Auth path observed (landlord trial):**  
`/signup/role` → Landlord → qualify (persona / unit count / years) → `/signup?role=admin&mode=1` → Start free trial → **`/on_boarding/subscription`** (14-day trial plan pick) → Start trial → app shell.

**Subscription step (live 2026-08-27, Emmanuel):** Yearly | Monthly toggle. Plans: **Starter** $15/mo ($180/yr, Beginner) · **Growth** $29.17/mo ($350/yr, Best Value) · **Pro** $50/mo ($600/yr, Most Popular, dark card) · **Business** Custom from $100/mo. Each has **Start trial**. Feature ladders mention Online Rent Payments → PDF Lease Builder → Tax Reports → Team Management. **Nexora disposition:** Skip hard paywall / USD plan grid for v1; note TC gates product behind plan pick before shell.

**Next click for crawl:** **Starter → Start trial** (enough for Portfolio / Transactions / Maintenance audit). Use Growth/Pro only if a live feature is plan-gated mid-crawl.

**Cookie import:** Failed DPAPI again — close Chrome fully before retry, or headed handoff with credentials.

**Money path (Help, not live UI):**  
1. Portfolio (Property Operations) — add property / units / vacant-occupied filters.  
2. Lease / move-in (Help cluster Move In 20 articles).  
3. Financials → Transactions — post recurring rent, next invoice, revenues/expenses.  
4. Stripe online payments (US) — **Skip** for NG; map to Paystack + manual cash/transfer (already in Nexora).

**Nexora preliminary disposition (Help+marketing; refine after live C):**

| TC area | Disposition |
|---------|-------------|
| Property Operations → Portfolio / Units | **Adapt** — we have properties/units; compare empty CTAs + filters live |
| Financials → Transactions / recurring rent | **Adapt** — our Payments + reminder job; invoice “post next” UX to compare |
| Maintenance Requests board | **Adapt** — we have triage + artisan assign + photo |
| Contacts hub | **Discuss** — we split tenants/artisans; TC unified Contacts |
| Stripe / 1099 / syndication / screening | **Skip** US |
| Owner portal statements | **Park** for Owner role pass |
| Dashboard customize widgets | **Defer** — Ada wants fast money list, not widget grid |

### 4.4 Nexora ship while waiting on TC login (2026-08-27)

Without live landlord TC session, closed Ada money-loop gaps from §4.3:

- **Unit Payments** (`/payments/[unitId]`): “Amount due this cycle” + status + Record payment / Chase link  
- **Properties** home: `{n} overdue → Chase` header CTA + link under Units Overdue stat (parity with Payments feed)
- **Nav:** Reminders promoted to primary rail (after Payments); Help chase tip points to `/reminders` (Chase ops stays under More for portfolio managers)
- **Properties:** All / Occupied / Vacant filter (tenant name present = occupied; empty / “-” / no-unit row = vacant)
- **Payments** feed: when overdue units exist, empty state + banner deep-link to first overdue `/payments/[unitId]` (Record path); Reminders stays chase path
- **Notifications bell (landlord):** overdue count from portfolio units (same truth as Properties/Payments); item + footer → `/reminders` (not staff `/ops`)
- **Properties:** Payment status filter (All / Overdue / Due soon / Paid / Pending), stacks with Occupancy
- **Reminders:** Overdue / Due soon / All segment (defaults to Overdue; falls back when empty)
- **Properties:** vacant unit rows → primary **Start tenancy** → `/properties/[id]/units/[unitId]/tenancy` (lease/move-in path)
- **Payments:** Money in / Overdue / Due soon segment — Overdue & Due soon show who-owes unit list with Record / Remind
- **Expenses:** honest empty + Add expense CTA; Payments link in header; Help tip “Where do I log money out?” → `/expenses`
- **Unit Payments (paid cycle):** shows next due date + **Log next rent early** (TC “post next” Adapt — Nexora has no separate invoice post)
- **Tenancies:** All / Active / Ending soon (60d); Payments deep-link per row; empty → Find vacant units (`/properties?occupancy=vacant`); Help tip “Where are my leases?”
- **Reports (rent roll):** empty CTA; month expenses → `/expenses`; row Payments + Tenancy/Start tenancy; `property_id` on rent-roll API; Help tip “Where is my rent roll?”

**Smoke:** [`landlord-ada-loop-smoke.md`](landlord-ada-loop-smoke.md) — static gate PASS; headed + TC live still pending session/credentials.

### 4.5 Auth / brute-force hardening (2026-09-01)

- **AAL2:** `get_current_user` rejects AAL1 when MFA factors verified; Next middleware keeps MFA-pending users on `/login?mfa=1`; phone OTP challenges TOTP via `PhoneOtpFlow`. Factor lookup **fail-closed** (503) when service role missing or Admin API errors — failures are not cached as “no MFA”.
- **SMS diag:** `/notify/sms-delivery` requires `NOTIFY_DIAG_SECRET` + rate limits. Next proxy `/api/notify/sms-delivery` is **admin-session only**; public OTP login no longer auto-probes Twilio.
- **Role:** `PATCH /users/me` only allows landlord→tenant/artisan bootstrap before properties exist.
- **Artisan claim:** clears `invite_token` on success.
- **Rate limits:** claim endpoints + application preview (in-process sliding window).
- **Invite bind:** claim requires **verified** JWT `email` / `phone` to match invite contact — not `user_metadata`. Empty invite contact is rejected (resend invite).
- **Invite-only:** UI gate plus API `INVITE_ONLY_SIGNUP` — new profiles need a short-lived signup ticket (from validated lead invite) or a real claim `invite_token`. Still disable public Auth signups in Supabase Dashboard for closed beta.
- **Auth copy:** email login errors are generic (no phone-vs-email enumeration).
- **Dashboard (2026-09-16):** Attack Protection CAPTCHA should use **Cloudflare Turnstile**. The app sends `captchaToken` when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. Leaked-password protection remains **off** (Pro plan / “Configure in email provider”).
- **Dashboard Rate Limits (live):** email **2/h** (tight — Auth confirm/reset only); SMS **30/h**; sign-up/sign-in **30 / 5 min / IP**; OTP verify **30 / 5 min / IP**; refresh **150 / 5 min / IP**. Product Mailgun reminders are separate from Auth email quota.
- **Manual:** set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the Cloudflare **site** key; keep `TURNSTILE_SECRET_KEY` server-side and save the same secret under Supabase Authentication → Attack Protection → CAPTCHA provider: Turnstile. Raise Auth email/h if reset/confirm emails bounce on quota; leaked-password when plan allows. Set `INVITE_ONLY_SIGNUP` / `SIGNUP_TICKET_SECRET` on the API when running invite-only.

---

### 4.1 Marketing IA (`tenantcloud.com/landlord`) — 2026-08-26

**Primary product pillars (nav / feature links):**

| Pillar | Public URL |
|--------|------------|
| Tenant screening | `/tenant-screening` |
| Rental applications | `/rental-application` |
| Rent reporting | `/rent-reporting` |
| Online leases | `/lease-agreement` |
| Listing website | `/rental-marketing` |
| Listing syndication | `/rental-marketing/listings` |
| Maintenance requests | `/maintenance` |
| Inspections | `/inspections` |
| Rent collection | `/rent-collection` |
| Accounting | `/accounting` |
| Reports | `/reports` |
| Reconciliation | `/reconciliation` |
| Investing | `/investing` |
| Insurance | `/insurance` |
| Lead tracking | `/lead-tracking-tool` |
| Property management | `/property-management` |
| Team management | `/team-management` |
| AI assistant | `/ai-assistant` |

**Audience switcher:** Landlord · Property Manager · Tenant · Service Pro  
**Auth:** Log In → `app.tenantcloud.com/login` · Sign Up → `app.tenantcloud.com/signup`  
**Plans (page copy):** Starter · Growth · Pro (tax reports, separate Owner portal) · Business (team tools)

**Hero themes:** Collect rent on time · Grow portfolio · Get help — not a dashboard mock in first viewport.

**Signup role:** `app.tenantcloud.com/signup/role` known from tenant audit (Landlord → qualify → `/signup?role=admin&mode=1` trial). Live reload often stuck on brand “Loading.” during this pass — do not block Phase A on it.

### 4.2 Help Center — Landlord collection

**Hub:** [Landlord Help Center](https://support.tenantcloud.com/en/collections/14417449-landlord) — **346 articles** (vs Tenant 66 · Service Pro 54 · Owner 41).

| Cluster | Article counts / notes (from collection page) |
|---------|-----------------------------------------------|
| Getting Started | What owner / tenant / Service Pro see |
| Settings | Account (19) · ID verification · Upgrade (15) · Accounting (10) · Rental application (5) · Landlord website (4) · Team (5) · Maintenance settings (3) · Affiliate · Reports |
| Dashboard | Customize · Search |
| Calendar / Tasks | Calendar (5) · Tasks (1) |
| Portfolio | Properties (12) · Units (6) |
| Leasing | Listings (12) · Leads (3) · Applications (10) · Screenings (13) · Move in (20) · Occupancy board (2) · Inspections (4) · Additional services (6) · Move-out (3) |
| Contacts | Tenants (14) · Owner (16) · Service Pros (5) · Communication (5) |
| Get paid | General (5) · Stripe online payments (23) · 1099-K (9) |
| Accounting | Transactions & invoices (32) · Income (2) · Expense (5) · Reconciliation (8) |
| Reports | Types (18) · Navigation (2) |
| Maintenance | Requests (9) · Recurring (2) |
| Documents | Forms (4) · Templates (11) · File manager (3) |

**Help-confirmed left-rail phrases (for Phase C falsification):**  
“Property Operations” → Portfolio (Properties / Units) · Contacts · Maintenance / Requests · Documents.

---

## 5. Blockers

- **B1e:** Completing landlord trial/login needs an email (or Google) the operator can verify — OTP/reCAPTCHA hostile to unattended browse.  
- Cookie import from Chrome fails while Chrome is open (DPAPI).  
- Trial/paywall may gate Financials or syndication — note tier when live.  

---

## 6. Definition of done (landlord role)

- [x] Phase A prep  
- [~] Auth path documented through trial form (full shell pending B1e)  
- [~] Money path D1/D4 Help-confirmed (live UI pending)  
- [~] Maintenance left-rail Help-confirmed (live board pending)  
- [ ] Leasing path noted with US skip list (live)  
- [ ] Settings compared to tenant (live)  
- [~] Preliminary Nexora disposition drafted (§4.3)  
- [x] No Owner/Service Pro crawl started  

---

## 7. Next action (unblock B1e → live C–D)

1. **Handoff:** landlord TC email inbox + password (or Google) while browse is headed, **or**  
2. Close Chrome → cookie-import from a profile already logged in as landlord, **or**  
3. Provide a one-time email we may use for “Start my free trial” and pass the verification code in chat.

Then falsify §2 nav live and screenshot Portfolio → Transactions → Maintenance.
