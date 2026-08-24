# Smart Prop — UX Flows

**Role:** UX architect  
**Compiled:** 2026-08-04  
**Inputs:** [`PRD.md`](PRD.md) · [`research.md`](research.md) · [`our-app-authenticated-audit.md`](our-app-authenticated-audit.md) · [`gap-analysis.md`](gap-analysis.md)  
**Format:** Wireframe-level flows (screens + decisions). Not visual mockups.

---

## Global chrome

**Product shell:** Sidebar (Properties, Payments, Reminders, Settings) + top utility (theme once, Account once, sign out). Content in `.shell-content`.

**Marketing chrome:** Sticky header (Smart Prop · Sign in · Get started) → sections → footer (brand · WhatsApp · ©).

**Auth chrome:** Centered `.auth-page` / `.auth-card` — no sidebar.

---

## Flow A — Marketing → signup / login

```
[/] Marketing
  ├─ Get started → /signup (or #get-started then signup)
  ├─ Sign in → /login
  └─ WhatsApp callback → lead / #whatsapp-callback
/signup
  ├─ If invite-only without ?invite= → blocked / message
  └─ Success → OTP or session → route by portfolio
/login
  ├─ Phone tab (default NG) → Send code → OTP → Verify
  │     Copy MUST match NEXT_PUBLIC_AUTH_OTP_CHANNEL (sms|whatsapp)
  └─ Email paths as implemented → session
Post-auth router
  ├─ 0 properties → /onboarding
  └─ ≥1 property → /properties
```

**Recovery:** “Use a different number”; slow verify shows button busy state (avoid infinite “Verifying…” with no timeout messaging).

---

## Flow B — Onboarding

```
/onboarding
  1 Welcome     → Continue
  2 Property    → name / address (autocomplete) / type → Continue | Back
  3 Unit        → rent, due day, tenant contact → Continue | Back | Skip for now
```

| Path | Result | Required UX |
|------|--------|-------------|
| Complete unit | Property + unit exist → `/properties` table | Checklist hidden when rows exist |
| Skip unit | Property exists, 0 units → `/properties` | **Property still listed** + CTA **Add unit**; optional `?highlightProperty=` |
| Zero properties later | Empty dashboard | Checklist: Add property → Add unit → Record payment |

Step dots: shared `.onboarding-step-dot` states `complete | active | upcoming` (wizard + checklist).

---

## Flow C — Property → unit

```
/properties
  ├─ Add property → /properties/new → save → unit create or list
  ├─ Row / property → units; Edit property
  └─ Empty / zero units on a property → Add unit → /properties/[id]/units/new
/properties/units/[unitId]/edit → save → back to list or unit context
```

**Kicker pattern (unit hubs):** muted `property · unit` above title; tenant in subtitle — not competing with page title.

---

## Flow D — Unit payments (core job)

```
/payments                          → list units (open a unit)
/payments/[unitId]
  Header: kicker · title · status context
  Actions:
    [Record manual payment]  ← primary or equal for cash landlords
    [Pay with Paystack]      ← alternate
  History table (.data-table-wrap)
    columns: amount, method, status, date, receipt link
```

**Manual happy path**

1. Open form → amount + optional reference → Save.  
2. Success → form **closes/resets**; new PAID row; receipt link.  
3. Tenant notify on preferred channel; landlord email if configured.  
4. Receipt control labeled **Open receipt** / **Download receipt** (not ambiguous “View” if it only downloads).

**Paystack path**

1. Pending → confirm/webhook → PAID + receipt same as manual.

**Error recovery**

| Failure | UX |
|---------|-----|
| Page 500 / stuck skeleton | FetchErrorState + retry; never infinite skeleton |
| Save fails | Inline `.form-error`; form stays open with values |
| Receipt missing | Hide link or show “Receipt unavailable” — no dead button |

---

## Flow E — Reminders

```
/reminders
  ├─ Select units → Remind selected (bulk)
  └─ Open unit → /reminders/[unitId]
/reminders/[unitId]
  Header: property · unit kicker
  Send reminder (type as product supports)
  Log: type · channel · status · sent at
```

**Recovery:** `failed` row → show error detail + **Retry** (`POST /reminders/retry/{id}`). Empty log: short copy + one Send CTA.

---

## Flow F — Settings / channel

```
/settings
  Profile        → name, business, email, phone (read-only), Save
                   Appearance: single theme control (remove duplicate sidebar moon OR remove Appearance — one only)
  Notifications  → reminder/receipt channel: sms | whatsapp | email
  Security       → phone change OTP; password if email identity
```

**Loading:** `fetchMe` in flight → field skeletons or disabled placeholders, not empty “—” that looks like missing account.

---

## Flow G — Sign out

User menu → Sign out → `/auth/signout` → `/login`.

---

## Cross-cutting recovery map

| Situation | Dead-end today (audit) | Target |
|-----------|------------------------|--------|
| Skip unit | Property invisible | Listed + Add unit |
| Failed reminder | No CTA | Detail + Retry |
| Unit payments error | Infinite skeleton | Error state + Retry |
| Empty portfolio | Ambiguous CTAs | Checklist with one path |
| OTP channel copy | WhatsApp vs SMS mismatch | Channel helpers only |
| Duplicate Account / theme | Two controls | One each |

---

## Empty-state copy formula

1. Short title (what’s missing).  
2. One sentence why it matters.  
3. **One** primary CTA.  

Example: “No units yet.” / “Add a flat to track rent and reminders.” / **Add unit**

---

## Marketing section flow (content order)

1. Hero (problem + CTAs + product preview)  
2. Problem (alt bg)  
3. How it works  
4. Product preview (alt bg)  
5. FAQ  
6. Get started CTA (alt bg)  
7. Footer  

All text inside `.marketing-container` (720px). Alternating `--background` / `--background-alt`.

---

## Out of scope flows (do not design in v1)

Tenant invite/login, in-app chat, tenancy hub, fees, inventory, documents expiry, global search — see PRD non-goals.
