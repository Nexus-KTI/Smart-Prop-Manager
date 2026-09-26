# Current initiative — Prove money live, then sell Growth later

**Updated:** 2026-09-26  
**Owner:** Engineering + you (headed)  
**Status:** API money loop green; headed OTP / Paystack UI still yours

## Goal

Trust rent-and-chase before any Nexora billing. Keep free cash/transfer
recording. Growth is a landlord subscription later — not a cut of rent.

## Acceptance

- [x] Procedural invite → claim → activate → manual pay  
      (`scripts/smoke_money_loop.py` **PASS** 2026-09-26, reconfirmed)
- [ ] Headed tick of [`docs/tenant-money-loop-smoke.md`](../docs/tenant-money-loop-smoke.md)  
      (OTP + optional Paystack UI)
- [ ] Headed Ada chase + phase5 when convenient
- [ ] Twilio Phone only if OTP SMS fails

## Monetization (locked for now)

- Landlord pays Nexora later (Growth Naira subscription for portfolio / staff).
- No take of rent. No artisan payout rail. Paystack fees stay Paystack’s.
- Bank feeds / NIN-BVN / public billing only with commercial evidence.

## Guardrails

Do not build Growth checkout in this pass. Do not enable production `DOCS_*`.
