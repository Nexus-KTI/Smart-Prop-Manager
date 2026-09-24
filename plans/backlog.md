# Backlog

## Now

1. **Tenant-originated maintenance intake** — Phase 5 work-order object;
   Tunde submits → triage → Sola. Spec before code; no new PRD phase.

## Next (ops interleave)

2. Headed Ada walk, delivery-outbox service, prod Twilio, leaked-password
   advisor — when next touching deploy.

## Deferred ops

- Deploy `smart-prop-delivery-outbox` from `render.yaml` (not live in the
  accessible Render workspace; blueprint defines `*/5 * * * *`).
- Headed Ada live confirm — needs signed-in browser or CDP.
- Production Twilio — blocked on operations configuration.
- Enable Supabase Auth leaked-password protection (advisor WARN).

## Closed recently

- Gate admit notify (landlord + issuer outbox)
- Gate role visibility (staff / landlord / tenant scopes)
- Transactional email kit (details/alert + invite/job/task HTML)
- Signup attribution (`038` applied remote)
- Residual resilience waves 1–5 + verify stamps

## Done earlier

- Resilience preflight, financial idempotency, durable outbox, client lifecycle,
  distributed limits, web invalidation (waves 1–5)
