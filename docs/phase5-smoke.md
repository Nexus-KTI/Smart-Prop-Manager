# Phase 5 + utilities — smoke checklist

Prove utilities publish, access passes, and artisan work-order loop (local).

## Prep
- [ ] API restarted (includes `utilities`, `access`, `artisans`, extended `maintenance`)
- [ ] Web on `:3000`
- [ ] Landlord account with a property + unit
- [ ] Active tenant linked to that unit
- [ ] Fresh phone/email for artisan claim

## 1. Utilities
1. Landlord → unit **Payments** → **Utility providers** → Add (e.g. Power / AEDC) → Publish  
2. Tenant → **Utilities** → sees provider row (not wait banner)  
3. Landlord toggles Visible off → tenant list empty / wait again  

## 2. Gate codes (F50)
1. Landlord → **Access** → select property with an **active linked tenant**  
2. **Admit at gate** — type a live code (or paste `nexora-pass:…`) → Allowed shows **Issued by** + **Admitted by**; Uses increments; activity log row appears  
3. Confirm **admit notify** (best-effort): landlord (if not the admitter) and issuing tenant get WhatsApp/SMS/email when contact exists; admit still succeeds if notify fails  
4. Toggle **All my properties** on Gate activity → events across portfolio ACL  
5. Tenant → **Access** → **Your guests at the gate** shows admits for codes they issued; last-admit on cards  
6. **Issue access code** → Who = **Tenant** → pick linked tenant → set valid-until → Issue (move-in)  
7. Tenant → **Access** → sees move-in code (linked to account)  
8. Tenant → **Create guest code**: Visit or Open · Starts now (1/2/4/6h) or pick date & time · QR + digits; revocable by tenant  
9. Cap: at most 3 active tenant-minted guests (≤6h window); at most 1 Open; landlord still sees/revokes all on `/access`  
10. Guest path (landlord): Who = Guest + check “Show on tenant’s Access” → tenant sees guest code  
11. Revoke works; expired/read-time status shows correctly  

## 3. Artisan + work order (F51)
1. Landlord → **Work orders** → **Invite artisan** → copy claim link  
2. Artisan signs up/logs in → opens claim link → completes profile → lands on `/artisan`  
3. Tenant creates a repair on `/tenant/requests` (or landlord **New job** on Payments)  
4. Landlord gets **maintenance notify** on tenant submit (channel prefs); board shows **From: Tenant** vs **You**  
5. Landlord Payments → **Invite artisan** on the row → pick roster artisan → set window end → issue gate code  
6. Artisan **Your jobs** shows job + gate code → **Mark done**  
7. Landlord board / Payments shows resolved  
8. On resolved job: **Log other payment** opens unit Payments with manual “other” form ready  

## Pass criteria
- Tenant utilities reflect landlord publish  
- Tenant-linked gate codes appear on `/tenant/access` without WhatsApp as system of record  
- Landlord/caretaker can **Admit** via typed code or QR paste; Uses column updates; **Issued by / Admitted by** + Gate activity trail  
- Admit notify reaches landlord and/or issuer when contacts exist (or skips cleanly)  
- Tenant can mint/revoke Visit/Open guest codes (scheduled or from-now, ≤6h, max 3 active / 1 open, QR on card) after claimed tenancy  
- Tenant repair submit notifies landlord; Origin/From shows Tenant vs You  
- Artisan claim → assign → complete works end-to-end  
- Resolved job offers charge deep-link to Payments  

## Fail notes
Record: unit id, invite token, request id, pass id, API error detail.

---

## Agent gate (2026-09-24)

- [x] pytest: access notify + maintenance notify + cron jobs + Ada money subset → **22 passed**
- [x] Code: `MAINTENANCE_ORIGIN_LABELS` on work-orders + unit repair card
- [x] Outbox HTTP + GH Actions drain proven earlier same day
- [ ] **Headed live** — needs your signed-in landlord / tenant / artisan session  
  (agent has no product cookie; same block as Ada smoke)
