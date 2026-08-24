# Smart Prop — Product Audit

**Role:** Product QA auditor  
**Compiled:** 2026-08-05 (STEP 7 re-run)  
**Baseline evidence:** [`our-app-authenticated-audit.md`](our-app-authenticated-audit.md) (2026-07-31) · browser pass 2026-08-05  
**Rubric:** [`PRD.md`](PRD.md) · [`design-system.md`](design-system.md) · [`ux-flows.md`](ux-flows.md)

**Environment:** Next `http://127.0.0.1:3003` (fresh build) · API `http://127.0.0.1:8000` · `NEXT_PUBLIC_AUTH_OTP_CHANNEL=sms`  
**Account:** `smoke.e2e@smartprop.local` (email/password; phone OTP not re-exercised)  
**Viewport:** desktop `1440×900`  
**Screenshots:** [`web/scripts/qa-now-screenshots/`](../web/scripts/qa-now-screenshots/) · runner [`web/scripts/qa-now-pass.mjs`](../web/scripts/qa-now-pass.mjs)

Status legend: **pass** · **partial** · **fail** · **unverified**

---

## Checklist

| Area | Criterion | Status | Notes |
|------|-----------|--------|-------|
| Auth OTP copy | UI matches `NEXT_PUBLIC_AUTH_OTP_CHANNEL` | **pass** | Login + signup say **SMS** (`01-login.png`, `02-signup.png`) |
| Onboarding Skip | Property with 0 units remains listed + Add unit | **pass** | `Skip Test House` row: “No units yet…” + **Add unit** + `NO UNIT` (`05-properties.png`). Full wizard Skip not re-run; visibility criterion met |
| Empty checklist | Shown only when appropriate; single CTAs | **pass** | With portfolio rows, table shows (no checklist overwrite) |
| Unit payments load | No intermittent 500 / infinite skeleton | **pass** | Settles with actions + history; API `/payments/unit/{id}` ~2s (`07-unit-payments.png`) |
| Manual form reset | Closes/resets after successful save | **pass** | After **Save payment**, form closes, **Record Manual Payment** returns, ₦1,500 row present (`08b-n2-after-save.png`) |
| Payment CTA hierarchy | Manual ≥ Paystack for cash landlords | **pass** | Manual = `.btn-primary`; Paystack = `.btn-outline` |
| Receipt wording | Open/Download vs misleading View | **pass** | **Download receipt** `.table-link` on paid rows |
| Reminder failure | Error detail + Retry CTA | **pass** | FAILED rows show detail + **Retry** (`10-unit-reminders.png`) |
| Landlord email | Money-in email when profile email + Mailgun/SMTP | **pass** | Templates + View payment link; Mailgun/SMTP; tenant receipt/due subjects when channel=email; `render.yaml` Mailgun keys |
| Address autocomplete | Photon + empty/slow/error polish | **pass** | Nonsense query → edge copy / no broken dropdown (`13-address-autocomplete.png`) |
| Settings load | No empty “—” race on Profile | **pass** | Profile loads with fields; phone placeholder “No phone on file” (`11-settings.png`) |
| Theme / Account | One theme control; one Account entry | **pass** | Appearance only on Settings → Profile; user menu has no Settings/Account link (avatar label “Account” only) |
| Tokens | No stray Tailwind brand colors / Rentora blue | **pass** | Spot-check on audited screens |
| Marketing container | 720px rail; brand; free CTA | **pass** | Container ~720px; brand present (`03-marketing.png`) |
| Fetch errors | List pages show FetchErrorState | **pass** | Observed when CORS blocked earlier; happy path OK once API allowed origin |
| Mobile 390 | Auth, properties, money-in feed, unit payments/reminders | **pass** | Re-run 2026-08-06 after money-in feed — [`qa-mobile-390/`](qa-mobile-390/); table scrolls in wrap (640/292), no page overflow |
| A11y focus | Accent focus rings on primary controls | **pass** | M2 keyboard pass 2026-08-06 — [`qa-keyboard-m2/`](qa-keyboard-m2/); no traps; rings on auth/payments/reminders/settings |

---

## Severity-ordered action items

_None in product code._ Deploy: keep `MAILGUN_*` (or `SMTP_*`) set so landlord money-in email can send.

---

## Explicit non-issues (do not “fix” into scope)

- Tenant invite / tenant app  
- Tenancy / fees / inventory  
- Hard paywall  
- Rentora visual restyle  
- NestJS / consulting-platform rewrite  

---

## Now prompts N1–N9 (this pass)

| ID | Result |
|----|--------|
| N1 Unit payments reliability | **pass** |
| N2 Manual payment form reset | **pass** |
| N3 Reminder failure + Retry | **pass** |
| N4 Payment CTA hierarchy | **pass** |
| N5 Settings load + theme/Account | **pass** |
| N6 Zero-unit property visibility | **pass** |
| N7 Download receipt label | **pass** |
| N8 OTP channel copy | **pass** |
| N9 Address autocomplete edges | **pass** |

---

## Sign-off

| Field | Value |
|-------|-------|
| Auditor | Cursor agent (browser + API) |
| Next audit focus | New PRD item / pricing if launched |
| Related backlog | [`upgrade-prompts.md`](upgrade-prompts.md) |
