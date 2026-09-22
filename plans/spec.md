# Current initiative — Tenant guest invite modes

**Updated:** 2026-09-22  
**Owner:** Engineering  
**Status:** in progress

## Goal

Replace single-entry “duration from now” guest codes with two invite modes
(Visit / Open), a scheduled validity window (date + time), unlimited scans
inside that window (in/out at the gate), and a QR on the tenant Access card
for estate staff to scan from the guest’s phone.

## Acceptance

- [x] Tenant picks **Visit** (named one-off) or **Open** (reusable in window)
- [x] Tenant sets **start + end** (or quick 1/2/4/6h from now); window ≤ 6h;
      start at most 7 days ahead
- [x] `max_uses` null for tenant-minted guests (no single-entry burn)
- [x] Pass card shows 6-digit code + QR encoding the same pass
- [x] `effective_status` includes `scheduled` when `valid_from` is in the future
- [x] Tests + phase5 smoke updated; migration `036` applied

## Guardrails

- No gate hardware / Admit API yet — QR is presentation only
- Do not invent US visitor-CRM features; keep Nigerian estate gate copy
- Cap active tenant-minted guests (Visit + Open combined); Open soft-cap = 1

## Next

Staff Admit endpoint that increments `uses_count` from scanned QR / typed code.
