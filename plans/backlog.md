# Backlog

## Now

1. **Ops unblock** — deploy `smart-prop-delivery-outbox` on the **Nexora**
   Render account (not the MCP “My Workspace” that only has ProjectX/kronix).
2. Enable Supabase **leaked password protection** in Auth settings.
3. Headed Phase 5 smoke ([`docs/phase5-smoke.md`](../docs/phase5-smoke.md)).

## Next (product)

4. Larger bets (applications / listing page) need an explicit product decision.

## Deferred ops

- Deploy `smart-prop-delivery-outbox` from `render.yaml` (blueprint in-repo;
  not present in the Render MCP workspace checked 2026-09-24).
- Headed Ada / Phase 5 live confirm — needs signed-in browser or CDP.
- Production Twilio — blocked on operations configuration.
- Enable Supabase Auth leaked-password protection (advisor WARN) —
  [docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Closed recently

- Work-order **From** labels (Tenant vs You)
- Tenant maintenance → landlord notify on submit
- Gate admit notify (landlord + issuer outbox)
- Gate role visibility; email kit; signup attribution `038`

## Done earlier

- Resilience preflight, financial idempotency, durable outbox, client lifecycle,
  distributed limits, web invalidation (waves 1–5)
