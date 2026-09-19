# Backlog

## Residual resilience — closed

1. Sync notify → outbox — done
2. Receipt step-idempotency — done
3. Server/marketing AbortSignal — done
4. Verify + ops notes — done
5. JWT transport backoff — done
6. Landlord payment/renewal retry → outbox — done
7. Remote 032/033 verify-only migration stamps — done

## Deferred ops

- Deploy `smart-prop-delivery-outbox` from `render.yaml` (not live in the
  accessible Render workspace; blueprint defines `*/5 * * * *`).
- Headed Ada live confirm — needs signed-in browser or CDP.
- Production Twilio — blocked on operations configuration.
- Enable Supabase Auth leaked-password protection (advisor WARN).

## Done earlier

- Resilience preflight, financial idempotency, durable outbox, client lifecycle,
  distributed limits, web invalidation (waves 1–5)
