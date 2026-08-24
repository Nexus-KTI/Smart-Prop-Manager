# Rentora demo video audit

**Source video:** `docs/rentora-demo-mp4/Rentora Demo.mp4`  
**Frames:** `docs/rentora-demo-frames/frame-001.png` … `frame-121.png` (every 3s)  
**Demo host:** `https://demo.rentora.co.uk`  
**Persona shown:** Landlord **Aaron L** (sidebar role label LANDLORD)  
**Method:** Scene-change clustering across 121 frames; near-duplicates collapsed into single steps. Representative frame IDs noted per step.

---

## Flow overview

| Step | Screen | Representative frames |
|------|--------|------------------------|
| 0 | Brand splash | 001–002, 120–121 |
| 1 | Marketing landing | 003–006, 117–119 |
| 2 | Login | 007–008 |
| 3 | Landlord overview | 009–011 |
| 4 | Create property | 012–016 |
| 5 | Create tenancy | 017–020 |
| 6 | Tenancy detail (new) | 021–024 |
| 7 | Create / invite tenant | 025–028 |
| 8 | Create fee | 036–037 |
| 9 | Fee detail | 038–042 |
| 10 | Create document (compliance) | 043–056 |
| 11 | Tenancy hub (docs + inventory CTA) | 060–066 |
| 12 | Create inventory (+ mobile capture) | 067–071 |
| 13 | Inventory room detail | 072–076 |
| 14 | Payments ledger | 077–095, 100–104 |
| 15 | Payment email notification | 096–099 |
| 16 | Tenancies list | 105–116 |
| — | Closing splash | 120–121 |

---

## Step 0 — Brand splash

**Frames:** 001–002 (open), 120–121 (close)  
**Screen:** Static title card  

**UI:** White background; blue house-styled **R** + **Rentora**; URL `rentora.co.uk`; thin blue top rule.  

**Action:** Intro / outro branding only.  

**Copy:** `Rentora` · `rentora.co.uk`

---

## Step 1 — Marketing landing (landlords)

**Frames:** 003–006; reprise logged-in 117–119  
**URL:** `https://demo.rentora.co.uk`  

**UI:**
- Header: Rentora logo · **Login** · **Get Started** (green)
- Hero: headline + blue **Get Started** · tenant link
- Right: device mockups + illustrated character
- Logged-in reprise (117): **Logout** + green **Dashboard** instead of Login/Get Started

**Action:** Introduce product; cursor idle in hero space before login.  

**Copy:**
- “Hey, landlords.”
- “Start accepting credit cards.”
- “Manage your properties, get paid directly, save a bunch of money and more…”
- “Are you a tenant? >”

---

## Step 2 — Login

**Frames:** 007–008  
**URL:** `/auth/login`  

**UI:** Centered card — “Welcome back!” · EMAIL · PASSWORD · **Remember me** (checked) · blue **Login** · “Forgot your password?” · “Don't have an account? Create one” · Terms & Policies footer.  

**Action:** Focus in Email field (cursor visible); preparing credentials. Browser also has Gmail tab `demo@rentora.co…`.  

**Copy:** Welcome back! · Login · Forgot your password? · Create one

---

## Step 3 — Landlord overview (home)

**Frames:** 009–011  
**URL:** `/dashboard/landlords/{id}/overview`  

**UI:**
- **Sidebar:** Overview (active) · Tasks · Properties · Tenancies · Tenants · Payments · Rents · Fees · References · Logout
- **Header:** Search… · bell · gear · **Aaron L / LANDLORD**
- Calendar (Feb 2019) + Schedule (“Nothing planned.”)
- Tasks checklist with completed items:
  - “Add your first property.”
  - “Verify your account.”

**Action:** Land on dashboard after login; hover schedule dates; establish empty schedule + completed onboarding tasks.  

**Copy:** Add your first property. · Verify your account. · Nothing planned.

---

## Step 4 — Add property

**Frames:** 012–016  
**URL:** `/properties/new`  

**UI:**
- Title: **Create a property**
- **Address:** “What's the address of the property?” · SEARCH with autocomplete for “32 Ings Lane”
- Structured fields after pick: LINE 1–3 · TOWN · COUNTY · POSTCODE (e.g. Arksey, Doncaster, DN5 0TA)
- **Name:** “Optionally use your own naming” · NAME prefilled “32 Ings Lane”

**Action:** Type address → select from UK address suggestions → review auto-filled lines.  

**Copy:** Create a property · SEARCH · NAME · e.g. REN7024, Mum's, …

---

## Step 5 — Create tenancy

**Frames:** 017–020  
**URL:** `/tenancies/new?property=…`  

**UI:** **Create a tenancy** form  
- **Basics:** “Which property are you letting, and for how long?” · Property `32 Ings Lane` · Term **Fixed** · Starts `18/02/2019` · Duration `12` months · checkbox **Roll onto periodic**
- **Rent:** “How much is the rent, and when do you want to collect it?” · Monthly Rent £ · Collection **Advance**
- Primary: blue **Create Tenancy**

**Action:** Configure fixed rolling tenancy + rent collection method; fill monthly rent.  

**Copy:** Create a tenancy · Roll onto periodic · Create Tenancy

---

## Step 6 — Tenancy detail (fresh)

**Frames:** 021–024  
**URL:** `/tenancies/{id}`  

**UI:**
- Header: **Tenancy at 32 Ings Lane** · ⋯ menu
- Meta: Property · Period `18 Feb 2019 – 17 Feb 2020` · Duration 12 months · Collection Advance · Term Fixed, rolling
- **Balance** card: £550 · “£0 paid to date” · **Make a payment >**
- **Recent Payments:** *There's nothing here!*
- **Tasks:** “Add tenants to 32 Ings Lane.”

**Action:** Review newly created tenancy; point at empty payments; next task is adding tenants.  

**Copy:** Make a payment · There's nothing here! · Add tenants to 32 Ings Lane.

---

## Step 7 — Invite / create tenant

**Frames:** 025–028  
**URL:** `/tenants/new?tenancy=…`  

**UI:**
- **Create a tenant**
- Tenancy: “Which tenancy would you like to add a tenant to?” → `32 Ings Lane`
- Tenant: “Would you like to add a new or existing tenant?” · NAME · EMAIL OR MOBILE NO  
  Helper: “If you enter a mobile no, we'll send an invite via SMS”
- **Create Tenant**
- Success modal: green check · **Tenant created!** · **Add another** · green **Go to Tenancy**  
  (Modal body also says tenancy ready for tenants — slightly mixed wording)

**Action:** Enter `johnw@rentora.co.uk` → Create Tenant → success modal. Taskbar later shows email “Tenant invite: John W…”.  

**Copy:** Create a tenant · Create Tenant · Tenant created! · Go to Tenancy

---

## Step 8 — Create fee (one-off charge)

**Frames:** 036–037  
**URL:** `/fees/new?tenancy=…`  

**UI:** Create fee form  
- Charge against `32 Ings Lane` · amount **£50** · DUE `18/02/2019`  
- Reason: TITLE (typing “Lost…”) · NOTES  
  Helper: “Keep it short and to the point.”  
- **Create Fee**

**Action:** Add “lost keys” style fee.  

**Copy:** How much do you want to charge? · What are you creating this fee for? · Create Fee

---

## Step 9 — Fee detail

**Frames:** 038–042  
**URL:** `/fees/{id}`  

**UI:** **February Fee** (or similar) · Due date · Property · Tenancy · Description  
Balance badge **Due** · £50 · £0 paid · **Make a payment >** · Recent Payments empty  

**Action:** Show fee as outstanding charge linked to tenancy.  

**Copy:** Due · Make a payment · There's nothing here!

---

## Step 10 — Upload compliance document

**Frames:** 043–056  
**URL:** `/documents/new?tenancy=…`  

**UI — Create a document:**
- Tenancy `32 Ings Lane`
- Title / Description / **Type** dropdown: Gas Certificate, Legionnaires, Electrical Check, Contract, EPC, Insurance, Right to Rent…
- **Expiry:** “If the document expires… we'll remind you beforehand.” + date picker
- **Sharing:** checkbox **Share with my tenant(s)**
- **Files:** Select files… · uploaded `gas-certificate.pdf` ✓
- **Create Document**
- OS file picker shown selecting `gas-certificate.pdf` from Documents folder

**Action:** Pick type **Gas Certificate** · title “Gas Cert 111” · expiry · share with tenants · upload PDF · create. Brief follow-on may open mail (`Waiting for mail.google.com…` ~057).  

**Copy:** Create a document · Gas Certificate · Share with my tenant(s) · Create Document

---

## Step 11 — Tenancy hub after docs/fees

**Frames:** 060–066  
**URL:** `/tenancies/{id}` (scrolled lower)  

**UI additions vs Step 6:**
- Outstanding row: **Lost keys** · Due · £50.00 of £50
- **Documents:** + New Document · cards “How to rent…” (OTHER) · “Gas Cert 111” (GAS)
- **Inventory:** + New Inventory · *There's nothing here!*
- Balance may show **£600** (rent + fee) with still £0 paid

**Action:** Tour tenancy as operating hub; cue inventory creation.  

**Copy:** + New Document · + New Inventory · Lost keys · Gas Cert 111

---

## Step 12 — Create inventory (desktop + mobile)

**Frames:** 067–071  
**URL:** `/inventories/new?tenancy=…`  

**UI:**
- Room section **Bedroom #1** with condition description (walls, lights, carpet, doors…)
- Files: “Upload your files/photos.” · `bedroom-1.jpg` … with green checks
- Split demo: phone camera PHOTO mode capturing room / syncing uploads
- Mobile chrome: hamburger · Rentora · **Create Inventory**

**Action:** Document room condition and attach photos from phone + desktop.  

**Copy:** Bedroom #1 · Upload your files/photos. · Create Inventory · Backup your description with photos/files.

---

## Step 13 — Inventory room detail

**Frames:** 072–076  
**URL:** `/inventories/{id}` (Bedroom #1)  

**UI:** Room title · DESCRIPTION paragraph · Files gallery of three bedroom photos · ⋯ menu  

**Action:** Review completed inventory evidence; hover thumbnails.  

**Copy:** Bedroom #1 · DESCRIPTION · Files

---

## Step 14 — Payments ledger

**Frames:** 077–095, 100–104  
**URL:** `/payments`  

**UI:**
- Summary cards: **PENDING** · **SENT** · **TOTAL** (amounts update during demo, e.g. Pending £570→£617.50 · Total £2,090.00)
- List with Filter: property · person/entity · badge **Money In** (blue) / **Money Out** (green) · amount · date  
  Examples: 32 Ings Lane / John W · 20 Paradise Square / Bobby Tables · Money Out to **RENTORA**

**Action:** Open Payments from sidebar; review money-in from tenants and money-out (platform payouts/fees).  

**Copy:** PENDING · SENT · TOTAL · Money In · Money Out · Filter

---

## Step 15 — Payment notification email

**Frames:** 096–099  

**UI:** Gmail overlay on Payments dashboard  
- Subject: **Money in: £50.00 from John W (32 Ings Lane)**  
- Body: itemized receipt · line “March RENT - 18/03/2019” · CTA **View Payment**  

**Action:** Show automated landlord email when money arrives (also mirrored in OS taskbar toasts: “Money in: £600.00 from…”).  

**Copy:** Money in · View Payment · itemized summary… receipt for your records

---

## Step 16 — Tenancies list

**Frames:** 105–116  
**URL:** `/tenancies`  

**UI:** Title **Tenancies** · Filter · **+ New Tenancy**  
Table: TENANTS (address + name) · BALANCE (£0.00 · £550 / mo) · TERM (dates + Fixed term rolling / non-rolling) · pagination Viewing 1–2 of 2  

Rows:
1. 32 Ings Lane · John W · Fixed term, rolling  
2. 20 Paradise Square · Bobby Tables · Fixed term, non-rolling  

**Action:** Portfolio-level tenancy list after setup + payments.  

**Copy:** + New Tenancy · £550 / mo · Fixed term, rolling

---

## Closing

Returns to marketing landing (logged-in Dashboard CTA) then brand splash (Step 0).

---

## Landlord navigation structure (from demo)

Persistent left nav after login:

Overview · Tasks · Properties · Tenancies · Tenants · Payments · Rents · Fees · References · Logout  

Header always: Search · Notifications · Settings · profile (Aaron L / LANDLORD).

---

## Empty-state patterns shown

| Place | Copy |
|-------|------|
| Schedule | Nothing planned. |
| Recent Payments | There's nothing here! |
| Inventory (before create) | There's nothing here! |
| Overview tasks (done) | Checked “Add your first property” / “Verify your account” |
| Tenancy tasks | Add tenants to 32 Ings Lane. |

---

## Implications for Smart Prop

1. **Happy-path order:** Property → Tenancy (term + rent) → Invite tenant → Fee → Document (+ expiry + share) → Inventory (+ photos) → Payments ledger + email receipt.
2. **Tenancy is the hub** — balance, payments, tasks, documents, inventory all hang off it.
3. **Compliance docs** are first-class (type taxonomy, expiry reminders, share-with-tenant).
4. **Inventory** is room-scoped text + photos; demo stresses mobile capture.
5. **Money story** = Money In (tenant) vs Money Out (to landlord via Rentora) with email receipts.
6. **Onboarding tasks** on Overview double as checklist (property + verify account before payouts).
