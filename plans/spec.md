# Current initiative — Gate admit notify

**Updated:** 2026-09-24  
**Owner:** Engineering  
**Status:** closed (code)

## Goal

When a guest pass is admitted at the gate, notify the **landlord** (unit owner)
and/or the **issuing tenant** on their preferred channel so the custody trail
is not only an in-app log.

## Acceptance

- [x] On successful `POST /access/admit`, enqueue notify to landlord and issuing
      tenant (when contact known), best-effort / never fail admit
- [x] Reuse delivery outbox + notification prefs; HTML email via
      `render_transactional_email` (details: code, unit, admitter, when)
- [x] WhatsApp/SMS plain text mirrors email facts
- [x] Idempotency key per admit event id (no duplicate blast on retry)
- [x] Tests for enqueue payload; no schema migration
- [x] Update [`docs/gate-visibility.md`](../docs/gate-visibility.md) — admit
      notify moved to shipped

## Guardrails

- No estate-as-org, police export, camera QR, IoT
- Admit only (not revoke/issue)
- Skip landlord when they are the admitter; skip issuer when they are
  admitter or landlord
- `gate_admit` prefs event defaults allow (no settings matrix row yet)

## Next

Product bet: **tenant-originated maintenance → existing work-order object**
(Phase 5). Ops: headed Ada walk, delivery-outbox deploy, prod Twilio.
