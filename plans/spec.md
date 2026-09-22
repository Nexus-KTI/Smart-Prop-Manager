# Current initiative — Gate staff Admit + custody trail

**Updated:** 2026-09-22  
**Owner:** Engineering  
**Status:** closed (code)

## Goal

Caretaker/landlord admits visitors by typed gate code or pasted QR payload,
and every issue / admit / revoke is logged so admin can trace who minted a
code and who scanned it at the gate.

## Acceptance

- [x] `POST /access/admit` with property_id + raw (code or QR)
- [x] Rejects revoked / expired / scheduled / max_uses exhausted
- [x] `GET /access/passes?property_id=` uses `ctx.owner_id` (staff-visible)
- [x] Admit panel on landlord `/access` (type/paste; no camera)
- [x] `created_by_label` / `last_admitted_by_label` on passes
- [x] `access_pass_events` chain-of-custody + `GET /access/pass-events`
- [x] Tests + phase5 smoke; migration `037` applied

## Guardrails

- No camera SDK; no separate Admit permission
- Events always logged (owners and tenants included) — unlike Phase 4 staff audit which skips owners
- USB keyboard-wedge scanners work via the Admit input

## Next

Optional: phone camera QR decode; filter activity by pass id.
