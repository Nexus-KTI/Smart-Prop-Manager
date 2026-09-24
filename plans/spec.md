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

- Render MCP (`emmanuel@…` / My Workspace) ≠ Nexora host.
- **Live API:** Kings-Hubbot → **Smart-Prop-Manager**
  (`srv-danbl2rbc2fs73drq7c0`, https://smart-prop-manager.onrender.com), Free,
  auto-deploy `main` through `9a147ae`.
- Outbox cron still not created there — Dashboard steps in ops-checklist §5.
- Supabase advisor WARN: leaked password protection disabled.
- RLS-no-policy INFO on service-role tables is intentional.