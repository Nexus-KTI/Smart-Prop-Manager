# Backlog

## Now

1. **Headed Friday chase** — tick  
   [`docs/landlord-ada-loop-smoke.md`](../docs/landlord-ada-loop-smoke.md)  
   in a signed-in landlord browser (Properties → Payments / Action needed).  
   Agent Ada + phase5 pytest gate **22 passed** 2026-09-26.
2. **Headed phase5** —  
   [`docs/phase5-smoke.md`](../docs/phase5-smoke.md)  
   (gate admit + tenant repair → artisan) when you have sessions.
3. **Twilio Phone alignment** — only if OTP SMS fails  
   ([`docs/auth-dashboard-ops.md`](../docs/auth-dashboard-ops.md)).

## Next

Growth & Pro (landlord Naira subscription, then bank feeds / partner NIN-BVN)
only after landlords already chase rent weekly in the app. No rent take-rate.
No artisan payout rail until ops demand is real.

- **Tenancy docs router** — `routers/tenancies.py` still serves the base64
  upload. Build the hardened endpoints `tests/test_tenancy_docs.py` describes
  (multipart + `validate_document`/`scan_document`, active-tenant only, legal
  hold delete, requests/review via `029` RPCs, cleanup on failure), then drop
  the `ROUTER_GAP` xfail markers. Spec first; launch stays behind
  [`docs/tenancy-docs-launch-gate.md`](../docs/tenancy-docs-launch-gate.md).

## Product gate

- Applications/listing **HOLD lifted** 2026-09-25 (explicit plan/build ask).  
- Default remains: no US TC features; listing ≠ publications.

## Deferred / waived

- Native Render Cron — waived (GH Actions outbox + **reminders-due** done)
- Larger leasing CRM / photos — after Slice E if demand
- Bank feeds, partner NIN/BVN API, deep multi-owner agent orgs — Later

## Closed recently

- Paystack key split; saved-card + Autopay; you confirmed headed Paystack
- Paystack key split + saved-card/autopay cron path documented
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
