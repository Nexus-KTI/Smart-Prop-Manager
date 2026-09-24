# Backlog

## Now

1. **Phase 5 smoke / ops** — headed Tunde→Ada→Sola maintenance loop when
   signed-in browser available; delivery-outbox deploy; prod Twilio.

## Next (product)

2. Optional: clearer `origin=tenant` badge on work-orders board if triage is
   unclear in headed QA.
3. Larger bets (applications / listing page) need an explicit product decision
   — not from gap-analysis alone.

## Deferred ops

- Deploy `smart-prop-delivery-outbox` from `render.yaml` (not live in the
  accessible Render workspace; blueprint defines `*/5 * * * *`).
- Headed Ada live confirm — needs signed-in browser or CDP.
- Production Twilio — blocked on operations configuration.
- Enable Supabase Auth leaked-password protection (advisor WARN).

## Closed recently

- Tenant maintenance → landlord notify on submit
- Gate admit notify (landlord + issuer outbox)
- Gate role visibility (staff / landlord / tenant scopes)
- Transactional email kit (details/alert + invite/job/task/gate HTML)
- Signup attribution (`038` applied remote)

## Done earlier

- Resilience preflight, financial idempotency, durable outbox, client lifecycle,
  distributed limits, web invalidation (waves 1–5)
