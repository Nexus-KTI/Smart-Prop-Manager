# Tenant money loop — smoke checklist

Prove landlord ↔ tenant pay path end-to-end (local).

## Prep
- [ ] API on `:8001`, web on `:3000`
- [ ] Landlord logged in; unit has **tenant contact** (phone/WhatsApp)
- [ ] Fresh tenant phone/email available for signup/claim

## Steps
1. **Landlord — Payments** for the unit  
   - Status starts **No tenancy** / **Not invited**  
   - Click **Start tenancy & invite** (or **Invite tenant**)  
   - Copy or WhatsApp the claim link; note notify result (sent / failed / not configured)

2. **Tenant**  
   - Open claim link (or `/signup` as tenant → Claim invite)  
   - Verify OTP / sign in  
   - Home shows **Almost there** (linked, not active yet)

3. **Landlord — same Payments page**  
   - Badge **Claimed — activate occupancy** + nudge copy  
   - If checklist blockers: open **Tenancy dossier**, tick required, return  
   - Click **Activate occupancy** → toast unlocks pay

4. **Tenant — Home**  
   - Sees amount due  
   - **Pay rent** (Paystack test) or landlord records manual payment  
   - Receipts list shows paid row  
   - Action cards deep-link to **Utilities** (landlord wait banner) and **Requests** (honest empty)

5. **Tenant — module gates** (optional)  
   - Before claim: Requests/Utilities show “landlord hasn’t shared a unit” + Claim CTA  
   - Linked pending: “occupancy not active” banner  
   - Active: **New request** form works; landlord sees rows on unit Payments → Repair requests  

6. **Landlord — triage**  
   - On Payments, change status New → In progress → Resolved  

## Pass criteria
- Invite reachable from Payments (not only dossier)  
- Claimed state offers **Activate** without hunting dossier (unless blockers)  
- After activate, tenant pay works  
- Requests / Utilities never show bare “No data” without who must act  
- Active tenant can submit a repair; landlord can update status on Payments  

## Fail notes
Record: unit id, tenancy status, invite notify error, activation blockers, request id.
