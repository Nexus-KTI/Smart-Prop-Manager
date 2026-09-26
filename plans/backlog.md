# Backlog

## Now

1. **Optional headed polish** — browser OTP + Paystack UI on  
   [`docs/tenant-money-loop-smoke.md`](../docs/tenant-money-loop-smoke.md)  
   (API procedural gate **PASS** 2026-09-26; reconfirmed same day via  
   `scripts/smoke_money_loop.py`).
2. **Headed live** —  
   [`docs/phase5-smoke.md`](../docs/phase5-smoke.md) +  
   [`docs/landlord-ada-loop-smoke.md`](../docs/landlord-ada-loop-smoke.md) when convenient.
3. **Twilio Phone alignment** — still open if OTP SMS fails  
   ([`docs/auth-dashboard-ops.md`](../docs/auth-dashboard-ops.md)).

## Next

Growth & Pro (landlord Naira subscription, then bank feeds / partner NIN-BVN)
only after landlords already chase rent weekly in the app. No rent take-rate.
No artisan payout rail until ops demand is real.

## Product gate

- Applications/listing **HOLD lifted** 2026-09-25 (explicit plan/build ask).  
- Default remains: no US TC features; listing ≠ publications.

## Deferred / waived

- Native Render Cron — waived (GH Actions outbox **done**)
- Larger leasing CRM / photos — after Slice E if demand
- Bank feeds, partner NIN/BVN API, deep multi-owner agent orgs — Later

## Closed recently

- Property-scoped staff invites (all properties or a named subset)
- Public vacant listing `/list/{token}` handing off to `/apply/{token}`
- Tenancy docs draft counsel banner; production `DOCS_*` flags stay false
- Phone marketing header: mark-only; Start free in drawer
- Approve claim mint: sync contact, surface `claim_error`, tick checklist for activate
- One unit photo and apply note on `/apply/{token}`
- Application submit/decide notify (outbox + HTML)
- Applications decide loop: WhatsApp share, Lagos questions, answers on the card, approve → unit payments
- Living plan refresh; Auth/Twilio handoff docs  
- Outbox GH Actions; gate/repair notify; email kit; signup `038`
