# Current initiative — Tenant maintenance landlord notify

**Updated:** 2026-09-24  
**Owner:** Engineering  
**Status:** closed (code)

## Goal

When Tunde submits a repair on `/tenant/requests`, Ada gets a best-effort
channel notify so tenant-originated `maintenance_requests` are not silent
until she opens the board. Same work-order object — no new phase.

## Acceptance

- [x] `POST /maintenance/me` enqueues landlord notify after insert (never fails create)
- [x] HTML via `tenant_maintenance_submitted`; prefs event `maintenance_update`
- [x] Idempotency `tenant-maintenance:{request_id}`
- [x] Tests for template + enqueue

## Already in product (not re-built)

- Tenant create with `origin='tenant'`, photo, cancel, message thread
- Landlord triage + artisan assign on same row

## Next

Broader Phase 5 smoke (Tunde → Ada triage → Sola) when you have a signed-in
browser; ops (outbox deploy, Twilio). Optional UX polish on work-orders
`origin` badge if triage is unclear.
