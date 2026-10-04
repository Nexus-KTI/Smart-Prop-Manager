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
   no sideways scroll. A temporary name rendered “Good evening, Ada”, then
   was cleared. Confirm it on your own phone
   ([`docs/design-system.md`](../docs/design-system.md) → `/dashboard`).

## Next

- **Worker cutover** (needs a paid Render worker): follow
  `docs/ops-checklist.md` → "Background worker cutover" (deploy worker, set
  `OUTBOX_INLINE_FLUSH=0`, disable both GitHub workflows).
- **Headed realtime check** (slice 2): two signed-in browsers on one chat —
  new message, thread preview, unread badge, and "Seen" update live.
- **Set `ALLOWED_HOSTS`** on Render (`smart-prop-manager.onrender.com`) after a
  deploy confirms the Host header; add custom domains first.
- **Decide: refunded rent** — today a Paystack refund is recorded
  (`refunded_amount`) and alerted, rent stays `paid`. Option: a `refunded`
  status that puts the rent back on the chase list (touches ~20 screens).
- **Headed `/dashboard` check on your phone** (slice 5). Agent dry run 2026-10-04
  (smoke landlord, 393px + 1280px, local API): KPIs and cards match the overview API,
  one `/properties/portfolio/overview` request (no `/properties/` pages or summary),
  no overflow, no console errors; a stubbed overview rendered overdue / due-soon /
  "Next due" / vacant cards, photos, and the alert line. OpenTelemetry only if Sentry
  tracing stops being enough.
- **Decide: partial payments / arrears** — with no ledger, overdue is one period per
  charge and any paid row counts as paid. A real balance needs a charges ledger.
- **Sentry alert rules:** alert on `alert:outbox` (dead letters) and
  `alert:paystack` (refunds/disputes) once `SENTRY_DSN` is set on Render.
- **Optional RLS tidy:** merge landlord/tenant/artisan per-action splits (103
  `multiple_permissive_policies` WARNs left). Low value at current row counts.
- **Decide: archive vs delete** for units/properties (product call; slice 3 kept
  hard delete, now one cascading statement).

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

- Hardening — long-term slice 5: dashboard "Overdue rent" KPI (past-due charges on let units) and property cards served by `GET /properties/portfolio/overview` from the snapshot (`sql/056` adds `photo_url`); dashboard drops the all-pages `/properties/` fetch; vacant units off Action needed rent items and ops overdue

- Hardening — long-term slice 4: `portfolio_unit_snapshot` read model (`sql/055`) — Action needed and ops overdue in one call; status rules on the Lagos date with weekly/daily periods matching the web

- Hardening — long-term slice 3: access tokens verified locally against the ES256 signing keys with GoTrue fallback and `AUTH_LOCAL_JWT` switch (`lib/jwt_verify.py`); 2 API workers (`WEB_CONCURRENCY`); one ERROR alert per outbox dead letter; Paystack ledger 12-month retention (`sql/054`)

- Hardening — long-term slice 2: security headers + gzip + opt-in `ALLOWED_HOSTS` (`lib/edge.py`); Paystack webhook event ledger keyed by body hash, refund/dispute recording + ops alerts (`sql/053`); realtime scoped to the user's threads and the open thread (unread badge, messages hub)

- Hardening — long-term slice 1: daily retention live through GitHub Actions (`sql/052`, `lib/retention.py`, `POST /jobs/retention`; outbox 30 d, product events 180 d, reminder log 18 mo); background worker built but not deployed (`lib/worker.py`, `scripts/worker.py`, commented `render.yaml` block); `OUTBOX_INLINE_FLUSH` switch; shared `init_sentry()`

- Hardening — RLS initplan rewrite: 68 policies call `(select auth.uid())`, 16 duplicate "Owners …" policies dropped (`sql/051`); advisor initplan 84 → 0; `tests/test_rls_initplan.py` guards later migrations

- Hardening — short-term slice 3: one-statement unit/property delete, atomic tenancy/artisan claim + staff conditional claim, application decide and chat send as RPCs (`sql/050`), newest-first messages with `before` cursor + "Load earlier messages", reminder job paging, embedded transactions capped at 36, per-request access lookup cache (`lib/request_cache.py`)

- Hardening — short-term slice 2: outbox lease sized to the batch + release before expiry, defer without spending an attempt (`sql/048`), provider 4xx dead-letters, per-phone/user/unit/bulk/invite send limits, `Idempotency-Key` on reminder send/retry, chat, and gate admit (`sql/049`, `web/lib/attemptKey.ts`), atomic gate admit RPC

- Hardening — short-term slice 1: `X-Request-ID` + JSON logs + access line (`lib/observability.py`), circuit breakers on Twilio/Mailgun/Paystack (`lib/circuit.py`), remaining FK indexes (`sql/047`, advisor clean), error boundaries for dashboard/tenant/admin/artisan/root + `global-error.tsx`
- Hardening — Immediate milestone: core indexes (`sql/043`), saved-card retry reuses its key + already-paid / in-flight 409s, receipts dedupe by `reminders.transaction_id` (`sql/044`), one-query unread count (`sql/045`), upload routes off the event loop with capped reads, constant-time cron secret, GitHub Actions as the only scheduler, `GET /ready`, per-unit saved-card lock (`sql/046`), manual-payment key reuse, bucket setup once per process

- Read caching: shell reads shared + 20s browser cache (`web/lib/api-cache.ts`), 60s verified-token cache in `lib/auth.py`, one shared Supabase socket pool with fast connect retries (`lib/db.py`)
- Messages: photos, short videos, voice notes, and PDF/Word documents on chat and maintenance threads (`sql/041_message_media.sql`, `sql/042_message_documents.sql`)
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
