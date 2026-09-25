# Current initiative — Tenant money loop after claim

**Updated:** 2026-09-25  
**Owner:** Engineering  
**Status:** in progress

## Goal

After application approve → claim, landlord can activate and money can move
(Paystack or manual) without a hung claim link or empty checklist trap.

## Acceptance

- [x] Reused tenancy gets applicant contact/name before claim mint
- [x] Approve returns `claim_error` when mint fails (UI does not pretend they got a link)
- [x] Approve ticks required occupancy checklist (application decide = paper path)
- [~] Smoke: `docs/tenant-money-loop-smoke.md` — code/API/tests PASS; headed OTP/Paystack **BLOCKED** (needs your signed-in browser)

## Guardrails

Do not invent NIN/BVN partner verify. Optional identity checklist stays optional.

## Previous

Mobile marketing chrome (mark-only + phone drawer CTA); applications claim handoff.
