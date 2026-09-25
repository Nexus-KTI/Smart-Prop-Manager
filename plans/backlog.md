# Backlog

## Now

1. **Headed live** — tick [`docs/phase5-smoke.md`](../docs/phase5-smoke.md) +  
   [`docs/landlord-ada-loop-smoke.md`](../docs/landlord-ada-loop-smoke.md) in a  
   signed-in browser (or CDP `9222`). Agent pytest gate **22 passed** 2026-09-25.
2. **Twilio Phone alignment** — still open if OTP SMS fails  
   ([`docs/auth-dashboard-ops.md`](../docs/auth-dashboard-ops.md)).

## Next

Approve → existing tenancy claim link, then the tenant money loop (activate, pay).

## Product gate

- Applications/listing **HOLD lifted** 2026-09-25 (explicit plan/build ask).  
- Default remains: no US TC features; listing ≠ publications.

## Deferred / waived

- Native Render Cron — waived (GH Actions outbox **done**)
- Larger leasing CRM / photos — after Slice E if demand

## Closed recently

- One unit photo and apply note on `/apply/{token}`
- Application submit/decide notify (outbox + HTML)
- Applications decide loop: WhatsApp share, Lagos questions, answers on the card, approve → unit payments
- Living plan refresh; Auth/Twilio handoff docs  
- Outbox GH Actions; gate/repair notify; email kit; signup `038`
