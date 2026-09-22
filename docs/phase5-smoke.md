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
2. **Issue access code** → Who = **Tenant** → pick linked tenant → set valid-until → Issue (move-in)  
3. Tenant → **Access** → sees move-in code (linked to account)  
4. Tenant → **Create guest code**: Visit or Open · Starts now (1/2/4/6h) or pick date & time · QR + digits; revocable by tenant  
5. Cap: at most 3 active tenant-minted guests (≤6h window); at most 1 Open; landlord still sees/revokes all on `/access`  
6. Guest path (landlord): Who = Guest + check “Show on tenant’s Access” → tenant sees guest code  
7. Revoke works; expired/read-time status shows correctly  

## 3. Artisan + work order (F51)
1. Landlord → **Work orders** → **Invite artisan** → copy claim link  
2. Artisan signs up/logs in → opens claim link → completes profile → lands on `/artisan`  
3. Tenant (or landlord **New job** on Payments) creates a repair request  
4. Landlord Payments → **Invite artisan** on the row → pick roster artisan → set window end → issue gate code  
5. Artisan **Your jobs** shows job + gate code → **Mark done**  
6. Landlord board / Payments shows resolved  
7. On resolved job: **Log other payment** opens unit Payments with manual “other” form ready  

## Pass criteria
- Tenant utilities reflect landlord publish  
- Tenant-linked gate codes appear on `/tenant/access` without WhatsApp as system of record  
- Tenant can mint/revoke Visit/Open guest codes (scheduled or from-now, ≤6h, max 3 active / 1 open, QR on card) after claimed tenancy  
- Artisan claim → assign → complete works end-to-end  
- Resolved job offers charge deep-link to Payments  

## Fail notes
Record: unit id, invite token, request id, pass id, API error detail.
