# Current initiative — Applications loop (Phase 3 extension)

**Updated:** 2026-09-25  
**Owner:** Engineering  
**Status:** next — Slice A not started  
**Plan:** [`docs/applications-listing-build.md`](../docs/applications-listing-build.md)

## Goal

Improve existing rental applications so Ada can decide with context and hand
off to tenancy claim — then optional public vacant listing. Not a new PRD phase.

## First acceptance (Slice A only)

- [ ] `/applications` shows property · unit · screening answers on submitted rows
- [ ] List API enriches labels (no US screening)
- [ ] pytest covers list enrichment shape
- [ ] Gap-analysis “today” row updated (intake exists)

## Guardrails

- Reuse `rental_applications`; no Estate OS; no FCRA/Zillow/fees USD
- Listing page = Slice E after A–D; publications stay bulletins

## Prior initiative (ops residue)

- [x] Outbox drain via GH Actions + HTTP
- [x] Leaked-password — user reported done 2026-09-25 (re-check advisor if WARN lingers)
- [ ] Headed Phase 5 + Ada live — agent gate green; **your signed-in walk** still required
- [ ] Twilio Phone alignment — still Dashboard ([`auth-dashboard-ops.md`](../docs/auth-dashboard-ops.md))
