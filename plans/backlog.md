# Backlog

## Now

1. **Tenant money loop smoke (headed)** — finish  
   [`docs/tenant-money-loop-smoke.md`](../docs/tenant-money-loop-smoke.md)  
   in a signed-in browser (OTP + Paystack/manual). Agent gate: code/API/tests  
   aligned 2026-09-25; live claim→pay still needs you.  
2. **Headed live** — also  
   [`docs/phase5-smoke.md`](../docs/phase5-smoke.md) +  
   [`docs/landlord-ada-loop-smoke.md`](../docs/landlord-ada-loop-smoke.md) when convenient.
3. **Twilio Phone alignment** — still open if OTP SMS fails  
   ([`docs/auth-dashboard-ops.md`](../docs/auth-dashboard-ops.md)).

## Next

Public billing / Growth & Pro later items (bank feeds, partner NIN/BVN) only with
commercial evidence — not Now.

## Product gate

- Applications/listing **HOLD lifted** 2026-09-25 (explicit plan/build ask).  
- Default remains: no US TC features; listing ≠ publications.

## Deferred / waived

- Native Render Cron — waived (GH Actions outbox **done**)
- Larger leasing CRM / photos — after Slice E if demand
- Bank feeds, partner NIN/BVN API, deep multi-owner agent orgs — Later

## Closed recently

- Phone marketing header: mark-only; Start free in drawer
- Approve claim mint: sync contact, surface `claim_error`, tick checklist for activate
- One unit photo and apply note on `/apply/{token}`
- Application submit/decide notify (outbox + HTML)
- Applications decide loop: WhatsApp share, Lagos questions, answers on the card, approve → unit payments
- Living plan refresh; Auth/Twilio handoff docs  
- Outbox GH Actions; gate/repair notify; email kit; signup `038`
