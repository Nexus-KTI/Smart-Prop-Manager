# Gate visibility — discussion note

**Compiled:** 2026-09-23  
**Updated:** 2026-09-23 (implementation)  
**Status:** Implemented under Phase 5 access (F50) + Phase 4 staff. Does **not** add a PRD phase.  
**Related:** [`sql/037_access_pass_events.sql`](../sql/037_access_pass_events.sql), [`routers/access.py`](../routers/access.py), [`web/components/AccessPassesClient.tsx`](../web/components/AccessPassesClient.tsx), [`web/components/TenantAccessClient.tsx`](../web/components/TenantAccessClient.tsx)

---

## Problem (Lagos estate reality)

A landlord owns units inside an **estate**. Tenants mint guest codes. Estate security / staff **admit** people at the gate. If a guest commits a crime and leaves, the useful question is not “did the landlord see every car?” — it is:

1. Who **admitted** them? (gate staff)  
2. Which **code**?  
3. Who **issued** it? (usually the tenant)  
4. Which **unit / property**?  
5. When?

Gate activity is therefore an **estate ops** concern first, with **scoped landlord** and **issuer (tenant)** accountability — not a landlord-vs-tenant-only feed.

---

## Decision (who sees what)

| Role | Persona | Sees | Does not see |
|------|---------|------|----------------|
| Gate security / caretaker | Chinedu | Live admit UI + recent gate log for properties they are staffed on; code validity; unit; **issuer label** | Other landlords’ estates; money |
| Estate / property manager | Funke (ops) | Estate-wide (portfolio) gate log + drill-down for assigned owners/properties | Unrelated owners |
| Landlord (owner) | Ada / Bode | Gate events **for their properties/units only**; alert-friendly summary when a code on *their* unit is admitted | Full multi-estate noise if they only own one house inside a large estate community (unless they *are* the estate operator) |
| Tenant | Tunde | **Own** guest codes + admits/revokes of those codes | Neighbours’ guests; estate-wide log |

**Primary live viewer of gate activity:** estate staff (security / caretaker / estate manager).  
**Landlord:** scoped audit + incident follow-up on their units — not the sole gate console.  
**Tenant:** issuer accountability (“I invited this person”), not estate surveillance.

---

## What shipped

- Dashboard `/access`: Admit first → Gate activity (issuer + actor) → Issue / pass table.  
- Portfolio toggle **This property | All my properties** → `GET /access/pass-events?scope=portfolio` (ACL via `accessible_property_ids_for_portfolio`).  
- Tenant `/tenant/access`: **Your guests at the gate** via `GET /access/my-pass-events`; last-admit on pass cards.  
- Events expose `issuer_label` (from metadata / created actor).

---

## Out of scope (explicit)

**Product / market**

- Notify landlord or tenant on each admit (WhatsApp/SMS/email) — later  
- Estate-as-org / multi-landlord community entity (one gate for many unrelated landlords)  
- Police/export packs, CCTV, visitor photo ID capture  
- IoT / smart locks / ANPR (PRD F52)  
- Making landlords the only gate-log viewers, or giving tenants estate-wide surveillance  

**Engineering**

- New PRD phase or roadmap rewrite  
- New SQL tables (reuse `access_pass_events`; no `039` unless a real schema gap appears)  
- Separate `/gate` route or mobile-only gate app  
- Changing Admit code/QR format or use-limit rules  
- RLS policies for direct client reads of events (keep API + service role)  
- OS explorer / design-mode wireframes  

---

## Acceptance

- [x] Caretaker with `access_visitor_passes` can admit and see issuer + unit on success and in the recent events list.  
- [x] Landlord sees events only for their portfolio properties (single or All).  
- [x] Tenant sees admits for codes they issued.  
- [x] Event rows always show **issuer** and **admitter**/actor labels when known (criminal-guest audit trail).
