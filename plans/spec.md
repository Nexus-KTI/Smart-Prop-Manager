# Current initiative — Ops unblock + headed smoke

**Updated:** 2026-09-24  
**Owner:** Engineering / Ops  
**Status:** blocked on Nexora Render account + signed-in browser

## Goal

Get durable delivery live and prove Phase 5 notify loops headed.

## Acceptance

- [ ] Render team that hosts `smart-prop-api` has cron `smart-prop-delivery-outbox`
      from `render.yaml` (`*/5 * * * *`)
- [ ] Supabase Auth: leaked-password protection enabled (Dashboard)
- [ ] Headed: [`docs/phase5-smoke.md`](../docs/phase5-smoke.md) admit notify +
      tenant repair notify + From/Origin labels
- [x] Origin labels: Tenant vs You on work-orders + unit repair card
- [x] Ops checklist notes wrong MCP Render workspace; auth advisor link

## Findings (2026-09-24)

- Connected Render workspace has **no** Smart Prop services (ProjectX/kronix only).
- Supabase advisor WARN: leaked password protection disabled.
- RLS-no-policy INFO on service-role tables is intentional (incl. `access_pass_events`).
