# Current initiative — Residual resilience wave

**Updated:** 2026-09-17  
**Owner:** Engineering (Cursor agents)  
**Status:** closed (code + remote DDL stamps); Render outbox cron not yet live

## Goal

Close the remaining gaps after the first resilience hardening waves: sync
notification call sites that bypass the outbox, partial receipt replay risk,
and server/marketing fetches without abort timeouts.

## Acceptance

- [x] Interactive reminders, invites, and claim notifications enqueue through
  the leased delivery outbox (same retry/backoff as cron due reminders)
- [x] Payment receipt delivery is step-idempotent (landlord notice, tenant
  receipt, and chat post do not re-send after partial success)
- [x] `web/lib/api-server.ts` and `web/lib/public-leads.ts` use AbortSignal
  timeouts aligned with browser `apiFetch`
- [x] Targeted regression tests cover enqueue paths and receipt step guards
- [x] Spec/backlog and ops notes reflect residual wave status
- [x] Apply/reconcile `032` + `033` (verify-only migration stamps; DDL was
  already live)
- [x] JWT transport retry uses 150ms backoff between attempts
- [x] Landlord payment-retry and renewal-retry enqueue through the outbox
- [ ] Deploy `smart-prop-delivery-outbox` cron on Render (defined in
  `render.yaml`; not present in the accessible Render workspace yet)

## Guardrails

- Reuse existing `delivery_outbox` / `enqueue_notification` — no Redis/Celery.
- Do not re-apply full `sql/032` financial DDL (objects already live).
- Do not auto-retry Paystack charge POSTs.
- Prefer stable idempotency keys per notice kind + entity.

## Advisors (post-stamp)

- INFO: `delivery_outbox` and `rate_limit_buckets` have RLS with no policies
  (intentional service-role-only, same pattern as `product_events`).
- WARN: Auth leaked-password protection disabled (pre-existing Auth setting).

## Next

Create/sync the Nexora Render services from `render.yaml` so
`smart-prop-delivery-outbox` runs every five minutes, then smoke paid receipt
and chase enqueue → deliver.
