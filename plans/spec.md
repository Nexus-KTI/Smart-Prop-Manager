# Current initiative — Gate admit notify

**Updated:** 2026-09-24  
**Owner:** Engineering  
**Status:** next (not started)

## Goal

When a guest pass is admitted at the gate, notify the **landlord** (unit owner)
and/or the **issuing tenant** on their preferred channel so the custody trail
is not only an in-app log.

## Acceptance

- [ ] On successful `POST /access/admit`, enqueue notify to landlord and issuing
      tenant (when contact known), best-effort / never fail admit
- [ ] Reuse delivery outbox + notification prefs; HTML email via
      `render_transactional_email` (details: code, unit, admitter, when)
- [ ] WhatsApp/SMS plain text mirrors email facts
- [ ] Idempotency key per admit event id (no duplicate blast on retry)
- [ ] Tests for enqueue payload; no schema migration unless a real gap appears
- [ ] Update [`docs/gate-visibility.md`](../docs/gate-visibility.md) — move
      “admit notify” from out-of-scope to shipped

## Guardrails

- No estate-as-org, police export, camera QR, IoT
- Do not spam on revoke/issue — **admit only** in this slice
- Prefer existing `access_pass_events` row as the notify trigger identity

## Closed just before this

- Gate role visibility (staff-first / landlord portfolio / tenant issuer trail)
- Email kit: details/alert primitives + invite/job/task HTML templates
- Remote `038_signup_attribution` applied

## After this

Product bet: **tenant-originated maintenance → existing work-order object**
(Phase 5). Ops: headed Ada walk, delivery-outbox deploy, prod Twilio.
