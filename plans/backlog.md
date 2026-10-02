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
4. **Landlord `/dashboard` headed look** — phone dry run 2026-10-02
   (smoke landlord, 393px): N lockup, 4 KPIs, property cards, recent activity,
   no sideways scroll. That account has no first name, so the hero is the
   greeting only. Confirm the name on your own phone
   ([`docs/design-system.md`](../docs/design-system.md) → `/dashboard`).

## Next

Growth & Pro (landlord Naira subscription, then bank feeds / partner NIN-BVN)
only after landlords already chase rent weekly in the app. No rent take-rate.
No artisan payout rail until ops demand is real.

- **Tenancy docs: local counsel click-through** — router is built (see
  `plans/spec.md`). Needs a local ClamAV (`DOCS_CLAMAV_HOST`) and the private
  `tenancy-docs` bucket on a Supabase branch before upload/open/acknowledge can
  be clicked. Launch stays behind
  [`docs/tenancy-docs-launch-gate.md`](../docs/tenancy-docs-launch-gate.md).
  Review fixes from 2026-10-02 are in, flags still off: retry with the same
  `Idempotency-Key` replays the stored submission (a key reused on another
  request returns 409); `orphan_cleanup_pending` rows are hidden from list and
  open; upload/delete authorize before flag and input checks; "Open" opens the
  tab during the click via `openTenancyDocumentInNewTab`; upload handlers are
  sync `def`. Each list item now carries `can_delete` (retention elapsed, no
  legal hold, tenancy not active) — any future Delete button must use it, not
  `capabilities.delete`. The DB RPC still also refuses on open holds and open
  requests, which `can_delete` does not check.

## Product gate

- Applications/listing **HOLD lifted** 2026-09-25 (explicit plan/build ask).  
- Default remains: no US TC features; listing ≠ publications.

## Deferred / waived

- Native Render Cron — waived (GH Actions outbox + **reminders-due** done)
- Larger leasing CRM / photos — after Slice E if demand
- Bank feeds, partner NIN/BVN API, deep multi-owner agent orgs — Later

## Closed recently

- Tenancy docs router: multipart upload, audited open, receipt acknowledgment, hold-safe delete, requests/review via 029 RPCs (20 xfails now real tests; flags still off)
- Nexora favicon, app icons, manifest, link preview; lowercase logo wordmark

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
