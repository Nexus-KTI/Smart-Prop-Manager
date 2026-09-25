# Current initiative — Applications decide loop

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

## Guardrails

No new listing route, no FCRA/Zillow, no SQL migration (`rent_amount` already on units).

## Next (not this slice)

- [x] Outbox notify on submit (landlord) and decide (applicant)
- Photos or a separate marketing page — only if the apply link is not enough
