# Applications + landlord listing — procedural build

**Updated:** 2026-09-25  
**Status:** decide loop shipped 2026-09-25 (share + questions + card + approve handoff)  
**Stance:** Phase 3 extension — reuse `rental_applications` + existing claim invite.  
**Not a new PRD phase. Not Estate OS.**

## Goal

Close the Lagos vacant-unit loop:

**Invite/list → applicant applies → landlord decides → claim/activate tenancy**

Money beachhead stays primary commercially; this is vacancy ops for Ada when a unit is empty.

## Already shipped (do not rebuild)

- Schema `rental_applications` (`sql/017_…`)
- API: open invite, public token preview, submit (auth), decide → draft tenancy  
  ([`routers/applications.py`](../routers/applications.py))
- Web: `/applications`, `/apply/[token]`, unit “Invite to apply”
- Publications = estate bulletin for **tenants** — not vacancy marketing

Gap-analysis “no intake” row is **stale** vs code.

## Out of scope

FCRA / TransUnion / Asurint · USD application fees · Zillow/portal syndication ·  
landlord “listing website” subdomain product · leasing CRM tours · bureau screening ·  
co-applicant US flows · Estate OS explorer edits

---

## Shipped (2026-09-25)

- WhatsApp share of `apply_url` on the unit leasing card
- Preview questions: move-in, occupation, guarantor name, guarantor phone
- Apply page shows property, unit, address, rent
- Decide cards show where + answers
- Approve returns `tenancy_id` and links to unit payments

## Build slices (ordered)

### Slice A — Decide inbox quality (S) — done
**Why:** Landlord cannot see unit context or answers when deciding.  
**Touch:** [`ApplicationsClient.tsx`](../web/components/ApplicationsClient.tsx), list API enrich (property/unit labels), show `screening_answers`.  
**Accept:** Submitted row shows property · unit · answers; Approve/Reject unchanged.

### Slice B — Approve → claim handoff (S)
**Why:** Approve only creates draft tenancy; claim still manual.  
**Touch:** approve path in `routers/applications.py` + [`UnitTenantInviteCard`](../web/components/UnitTenantInviteCard.tsx) / tenancy invite helpers; toast/deep-link to claim.  
**Accept:** After approve, landlord gets claim link (or auto-send if contact present); applicant with `applicant_user_id` can open claim.

### Slice C — Lagos-lite questions (S)
**Why:** Hardcoded 3 US-ish Qs; need guarantor / move-in / occupation.  
**Touch:** apply submit + preview in `routers/applications.py`, [`ApplyClient.tsx`](../web/components/ApplyClient.tsx); store in `screening_answers` jsonb (no migration unless needed).  
**Accept:** Form + decide UI show guarantor name/phone, preferred move-in, occupation.

### Slice D — Notify (S/M)
**Why:** Silent submit/decide.  
**Touch:** outbox + email templates (pattern from gate/maintenance notify); prefs `messages` or new allow-by-default event.  
**Accept:** Landlord notified on submit; applicant notified on decide.

### Slice E — Landlord listing page (M) — after A–D green
**Why:** True “list vacant unit” surface; share to WhatsApp/Jiji by URL.  
**Touch:** new public route (e.g. `/list/[unitToken]` or property slug) — **not** publications; vacant unit rent/area/blurb; CTA → existing apply invite.  
**Accept:** Public page for a vacant unit; Apply opens/creates application token flow; no syndication partners.

### Slice F — Hygiene (S) — with A
pytest open→submit→approve→draft; refresh gap-analysis “today”; smoke doc `docs/applications-smoke.md`.

---

## Procedural order when implementing

1. Spec acceptance for **Slice A** only in `plans/spec.md`  
2. Implement A + F tests → green  
3. B → C → D  
4. Product check before E (listing page)  
5. Headed smoke on apply→decide→claim

## Explicit defer

- Multi-prospect CRM pipeline  
- Photos/video on listing (can follow E)  
- Application fee collection (Paystack) until asked
