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

- **Tenancy docs: local counsel click-through** — router is built (see
  `plans/spec.md`). Needs a local ClamAV (`DOCS_CLAMAV_HOST`) and the private
  `tenancy-docs` bucket on a Supabase branch before upload/open/acknowledge can
  be clicked. Launch stays behind
  [`docs/tenancy-docs-launch-gate.md`](../docs/tenancy-docs-launch-gate.md).
  **Fix before any flag goes on** (review 2026-10-02, merged dark):
  1. Submission retry with the same `Idempotency-Key` returns 409 — router
     status check runs before the RPC replay (`routers/tenancies.py` ~1380).
  2. Rows flagged `orphan_cleanup_pending` still list/open as clean — filter
     them out of list and open.
  3. Upload/delete check flags and input before authorization — authorize first.
  4. Dossier/tenant "Open" calls `window.open` after an await — mobile popup
     blockers eat it; open during the click or navigate the tab.
  5. Upload handlers are `async def` with blocking DB/ClamAV/storage calls —
     make them sync `def` (threadpool).
  Also: real DB refuses delete inside retention, so landlord delete is always
  409 while `capabilities.delete` says true; add tests for cross-tenancy open,
  open when not clean / flag off, and submission retry.

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
