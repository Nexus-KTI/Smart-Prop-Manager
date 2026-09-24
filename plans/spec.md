# Current initiative — Close ops residue + headed proof

**Updated:** 2026-09-24  
**Owner:** Engineering / Ops  
**Status:** in progress (outbox drain live; Auth + headed + Twilio remain)

## Goal

Keep money as the commercial beachhead. Finish residual ops/proof so Phase 5
notify and chase SMS are trustworthy — no new product modules without an
explicit call.

## Acceptance

- [x] Durable outbox drain live without Render Cron card  
      — `POST /jobs/delivery-outbox` + [`.github/workflows/delivery-outbox.yml`](../.github/workflows/delivery-outbox.yml)  
      — Secret `CRON_SECRET` on repo; manual run OK (`claimed`/`sent` > 0)
- [ ] Supabase Auth: leaked-password protection enabled (Dashboard)
- [ ] Headed: [`docs/phase5-smoke.md`](../docs/phase5-smoke.md) +  
      [`docs/landlord-ada-loop-smoke.md`](../docs/landlord-ada-loop-smoke.md)
- [ ] Supabase Phone Twilio aligned with prod sender; NG SMS chase works
- [x] Origin labels Tenant vs You; gate/admit + tenant repair notify shipped
- [x] Living plan matches Free-tier outbox reality (Render Cron waived)

## Findings

- Kings-Hubbot **Smart-Prop-Manager** Free web is live; Cron Job needs a card → waived.
- GH Actions schedule every ~5 min drains outbox (cold start ≤90s).
- Advisor still WARN: leaked-password disabled (MCP cannot toggle Auth).
- Applications / listing page: **hold** until product decision.

## Not this initiative

US TenantCloud skips; Estate OS → prod; hard paywall; bank rec; leasing CRM
before applications decision.
