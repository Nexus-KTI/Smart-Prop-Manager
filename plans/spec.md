# Current initiative — Approve to first rent

**Updated:** 2026-09-25  
**Owner:** Engineering  
**Status:** claim handoff shipped (code)

## Goal

An approval should hand the applicant the existing tenancy claim link so the
money loop can start. Same claim invite as unit Payments. No new tenancy product.

## Acceptance

- [x] Approve returns `claim_path` when the tenancy invite succeeds
- [x] Landlord sees the claim path next to unit payments
- [x] Applicant decide mail uses that claim URL when one exists

## Guardrails

Reuse `POST /tenancies/{id}/invite`. A failed invite must not undo the approval.

## Previous

Applications decide loop, notify, and one apply photo are shipped in code.

**Updated:** 2026-09-25  
**Owner:** Engineering  
**Status:** shipped (code)

## Goal

The apply URL is the listing. Ada shares it (copy or WhatsApp), the applicant
answers Lagos-lite questions, and the decide card shows where + answers.
Approve opens unit payments for the draft tenancy.

## Acceptance

- [x] Unit card: copy apply link + WhatsApp share
- [x] Public preview includes rent; apply page shows address + rent
- [x] Questions: move-in, occupation, guarantor name, guarantor phone
- [x] `/applications` shows property · unit · answers
- [x] Approve returns `unit_id` + `tenancy_id`; toast + Open unit payments link
- [x] pytest `tests/test_applications_decide.py`
- [x] Submit notifies the landlord (`application-submit:{id}`); approve/reject notifies the applicant (`application-decide:{id}:{status}`); skip when the applicant has no contact (`tests/test_application_notify.py`)
- [x] One photo and a 280-character note on `/apply/{token}` (`tests/test_unit_apply_photo.py`)

## Guardrails

No new listing route, no FCRA/Zillow. Photo and note are columns on `units` (`sql/039`).

## Next (not this slice)

- [x] Outbox notify on submit (landlord) and decide (applicant)
- [x] One unit photo and a short note on the same `/apply/{token}` page
