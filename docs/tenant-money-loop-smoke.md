# Tenant money loop — smoke checklist

Prove landlord ↔ tenant pay path end-to-end (local).

## Prep
- [x] API on `:8000` (or `:8001`), web on `:3000` or `:3001`
- [x] Procedural API smoke (no headed OTP): `python scripts/smoke_money_loop.py`  
      (service-role mint session; invite → claim → activate → manual pay)
- [x] Paystack key split (2026-09-26):
  - Root `.env`: `PAYSTACK_SECRET_KEY=sk_test_…` (API only; verified against Paystack)
  - `web/.env` + `web/.env.local`: `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_…`
  - Root `PAYSTACK_PUBLIC_KEY` unused — do not rely on it
- [ ] Optional headed: landlord logged in + fresh tenant OTP in browser

## Steps (API procedural — `scripts/smoke_money_loop.py`)
1. **Landlord** — create property/unit → start tenancy → checklist → invite → claim link  
2. **Tenant** — claim token (admin magic-link session)  
3. **Landlord** — activate occupancy  
4. **Landlord** — manual payment with `Idempotency-Key`  

## Headed — Paystack rent + saved card (test keys)

Use Paystack test card `4084084084084081`, any future expiry, CVV `408`, PIN `0000` if asked.

1. **Pay rent once** — active unit Payments (landlord) or tenant Home → Pay rent  
2. **Save card** — tenant Profile has an email → Settings → Cards → Add card (₦100 verify)  
3. **Autopay** — tenant Home → Autopay → select card → enable  
4. **Due job** (optional) — `POST /reminders/jobs/due` with `CRON_SECRET`, or wait for  
   GitHub Actions `reminders-due` (daily ~07:00 WAT). Confirms charge when rent is due.

## Pass criteria
- Invite reachable from Payments (not only dossier) — UI code + API invite PASS  
- Claimed state offers **Activate** without hunting dossier (unless blockers) — PASS  
- After activate, money path works — **PASS** via `scripts/smoke_money_loop.py` (manual pay)  
- Paystack secret reaches Paystack test API — **PASS** (agent 2026-09-26)  
- Public key present for web Inline — **PASS** (env placement)  
- Headed Paystack popup + save card — **yours** (browser)  
- Requests / Utilities honest empty states — PASS (code)  
- Active tenant repair + landlord triage — optional headed  

## Last agent run
**2026-09-26:** `python scripts/smoke_money_loop.py` → **PASS**  
(invite → claim → activate → manual pay).  
Paystack `sk_test` authenticated to api.paystack.co.  
Reminders/autopay cron: `.github/workflows/reminders-due.yml`.

## Fail notes
Record: unit id, tenancy status, invite notify error, activation blockers, request id,
Paystack reference if checkout fails.
