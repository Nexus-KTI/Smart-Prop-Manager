# Current initiative — Tenant money loop after claim

**Updated:** 2026-09-26  
**Owner:** Engineering  
**Status:** closed (API procedural PASS)

## Goal

After invite/claim, landlord can activate and money can move without a hung
claim link or empty checklist trap.

## Acceptance

- [x] Reused tenancy gets applicant contact/name before claim mint
- [x] Approve returns `claim_error` when mint fails
- [x] Approve ticks required occupancy checklist
- [x] Procedural smoke: `python scripts/smoke_money_loop.py` → PASS  
      (invite → claim → activate → manual pay; captcha bypassed via admin magic link)
- [ ] Optional: headed OTP + Paystack UI

## Guardrails

Do not invent NIN/BVN partner verify. Optional identity checklist stays optional.

## Previous

Mobile marketing chrome; applications claim handoff; honest Later copy.
