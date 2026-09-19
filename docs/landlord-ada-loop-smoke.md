# Landlord Ada money / lease loop — smoke (2026-08-27)

Covers Nexora slices shipped while waiting on TenantCloud landlord login  
(`docs/tenantcloud-landlord-audit.md` §4.4).

## Prep
- [x] FastAPI + Next.js running (`:8000` / `:3000` respond 200, 2026-09-15)
- [ ] Ideally: 1 overdue occupied unit (with contact), 1 vacant unit, 1 paid-cycle unit — confirm in your signed-in browser

## Static / code gate (no session)
- [x] Properties occupancy + payment filters (`PropertiesDashboard.tsx`)
- [x] Vacant → Start tenancy CTA
- [x] Payments Money in / Overdue / Due soon (`payments/page.tsx`)
- [x] Reminders Action Needed hub — Urgent / Overdue / Ending soon / Failed (`reminders/page.tsx` + `GET /reminders/actions`)
- [x] Bell overdue + leases ending + failed → `/reminders?filter=…` (`NotificationsBell.tsx`)
- [x] Unit cycle due + Log next rent early (`UnitPaymentsClient.tsx` + `nextDueDateForUnit`)
- [x] Expenses empty + Help tip; Reports rent roll actions + `property_id`
- [x] Tenancies Ending soon + `?occupancy=vacant` deep-link

## Headed (landlord session)

_Agent Playwright 2026-09-15 → redirected to `/login` (no landlord cookie). Live ticks below stay for your browser session._

### Properties
1. `/properties` — Occupancy All/Occupied/Vacant + Payment All/Overdue/Due soon/Paid/Pending stack  
2. Vacant unit row → **Start tenancy** → dossier  
3. Overdue occupied → Record payment / Remind  
4. Header `{n} overdue → Chase` → `/reminders?filter=overdue` (count from Action needed summary, not first units page); if failed sends → Retry link → `/reminders?filter=failed`  
5. `/properties?occupancy=vacant` opens with Vacant pressed  

### Payments
1. `/payments` — segment Money in / Overdue / Due soon  
2. Overdue list → Record payment / Remind  
3. Empty money-in with overdue → Open overdue unit  
4. Unit `/payments/[id]` — Amount due this cycle; if PAID → next due + **Log next rent early**  

### Reminders & bell
1. `/reminders` opens **Action needed** (Urgent ranked list from `GET /reminders/actions`: overdue + ending soon + failed + due soon)  
2. Filters: Urgent / Overdue / Ending soon / Failed; URL `?filter=` matches the bell; bulk remind for overdue-with-contact  
3. Failed row → Retry; no-contact overdue → Add contact; lease ending → `/tenancies?filter=ending_soon`  
4. Topbar bell → Overdue / Leases ending / Failed sends → `/reminders?filter=…` (not `/ops`); footer Action needed; primary-rail **Action needed** (CircleAlert, not Bell) badge shows `summary.urgent`; header bell badge is **messages unread only** (no duplicate chase count)  

### Tenancies / Expenses / Reports
1. `/tenancies` — All / Active / Ending soon; Ending soon count from Action needed summary; `/tenancies?filter=ending_soon` deep-link; empty ending-soon with signal → Action needed; All/Active capped honesty when list hits 200; Payments on row; empty portfolio → Find vacant units  
2. `/expenses` — empty Add expense; Payments header link; capped honesty when list hits 200  
3. `/reports` — expenses total links to Expenses; row Payments + Tenancy/Start tenancy; rent-roll honesty when units/expenses hit 500  

### Work orders / Applications
1. `/work-orders` — Open/Done section counts from portfolio summary (not only newest 100); empty Open with open_count > 0 shows honesty copy; primary-rail badge = open_count  
2. `/applications` — pending decide line + rail badge; capped honesty at 100  

### Help
1. Tips resolve: chase → Action needed; leases → Tenancies; money out → Expenses; rent roll → Reports  

## Automated (optional)
```bash
python -m pytest tests/test_unit_status_aggregate.py tests/test_portfolio_money_in.py tests/test_bulk_reminders_mismatch.py tests/test_dashboard_empty_property.py -q
```
**2026-08-27:** that subset → **10 passed**.  
**2026-09-15:** that subset → **10 passed**.

## Pass criteria
- Friday path: Properties → Payments / Action needed without hunting under More for chase  
- Vacant → Start tenancy and paid cycle → next due are obvious  
- Header bell = summary menu only (chase counts not on bell badge); rail **Action needed** owns the red urgency count; Help stays separate  

## Blocked without
- Landlord TC live crawl (Phase B→D) — still needs email/OTP or cookie import  
- Headed checks above — landlord product session  

**Static gate:** PASS · **pytest subset:** PASS (10) · **static-headed-gate (code):** PASS (2026-09-15) · **Headed live:** blocked — agent has no landlord cookie (`/properties` → `/login`) · **TC live:** pending credentials

**2026-09-06 procedural:** Auth H1–H4 automated + static PASS (`docs/auth-hardening-smoke.md`, 24 tests). Invite-only web/API flags aligned `true`/`1`. Ada headed still pending landlord session (restart Next after env change).

**2026-09-15 chrome:** Landlord header bell badge narrowed to unread messages only so Action needed rail owns `summary.urgent`. Help (`?`) unchanged. Bell honesty hint: clears when chase/reply — not mark as read.

**2026-09-15 headed attempt:** Prep servers PASS; pytest PASS; static re-walk of all headed checklist items PASS (no P0). Live headed walk **blocked** until you confirm in a signed-in browser (open `/properties`, check Action needed badge vs empty header chase badge, then walk Friday path). Next ops after live PASS: prod Twilio.

**2026-09-15 proceed retry:** pytest **10 passed**; `:8000` up; gstack browse + `cookie-import-browser chrome --domain localhost` → **DPAPI decryption failed** (Windows cannot decrypt Chrome cookies for the agent). Still `/properties` → `/login`. Unblock: your headed walk, or Chrome launched with `--remote-debugging-port=9222` while signed in.