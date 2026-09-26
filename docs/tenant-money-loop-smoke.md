# Tenant money loop — smoke checklist

Prove landlord ↔ tenant pay path end-to-end (local).

## Prep
- [x] API on `:8000` (or `:8001`), web on `:3000` or `:3001`
- [x] Procedural API smoke (no headed OTP): `python scripts/smoke_money_loop.py`  
      (service-role mint session; invite → claim → activate → manual pay)
- [ ] Optional headed: landlord logged in + fresh tenant OTP in browser

## Steps (API procedural — `scripts/smoke_money_loop.py`)
1. **Landlord** — create property/unit → start tenancy → checklist → invite → claim link  
2. **Tenant** — claim token (admin magic-link session)  
3. **Landlord** — activate occupancy  
4. **Landlord** — manual payment with `Idempotency-Key`  

Optional headed UI steps (Paystack / repair triage) remain in the interactive list below.
## Pass criteria
- Invite reachable from Payments (not only dossier) — UI code + API invite PASS  
- Claimed state offers **Activate** without hunting dossier (unless blockers) — PASS  
- After activate, money path works — **PASS** via `scripts/smoke_money_loop.py` (manual pay)  
- Requests / Utilities honest empty states — PASS (code)  
- Active tenant repair + landlord triage — optional headed  

## Last agent run
**2026-09-26:** `python scripts/smoke_money_loop.py` → **PASS**  
(invite → claim → activate → manual pay). Headed OTP/Paystack still optional.

## Fail notes
Record: unit id, tenancy status, invite notify error, activation blockers, request id.
