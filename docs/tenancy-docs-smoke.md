# Tenancy documents — disabled and staging smoke

Production flags must remain false. Run available-state checks only on a
Supabase branch with synthetic, non-PII files and the launch-gate prerequisites.

## Production-safe disabled states

- Landlord with no tenancy: dossier shows **Start tenancy**; no document CTA.
- Landlord with a tenancy: Documents says secure storage is unavailable; no
  environment-variable name, file picker, false empty state, or upload CTA.
- Tenant with no linked tenancy: Documents offers **Claim invite**.
- Tenant with linked pending tenancy: requested collection explains it is
  awaiting legal approval; it does not offer free-form upload or another claim.
- Active tenant while reads are off: documents unavailable; rent payment and
  receipt messaging remains present.
- Cross-tenancy URL and pending/ended tenant API access return 403.

## Supabase-branch available states

1. Verify fresh `011 → 017 → 028 → 029` and the drifted-028 path. Never replay
   028 blindly. Confirm 029 fails clearly when 028 objects are absent.
2. Provision a private `tenancy-docs` bucket and private ClamAV service. Insert
   synthetic approved processing/privacy policies for branch testing.
3. Enable all document, request, submission, review and privacy flags in branch
   staging; set the approved acknowledgment version.
4. Landlord requests only agreement/reference. Reject ID, NIN/BVN, `other`,
   free-form tenant uploads and unsupported tenancy statuses.
5. Unclaimed tenants cannot submit. A claimed pending tenant sees purpose,
   lawful basis, notice link/version and a notice-read statement—not consent.
6. Reject empty, oversized, spoofed MIME, wrong signature, malware and
   cross-tenancy upload attempts.
7. Upload a synthetic clean PDF. Confirm generated ID/checksum object path.
8. Confirm only submitter and owner see pending revisions; active tenants see
   accepted files only. Every 15-minute link has a `document_opened` event.
9. Race replacements/reviews and repeat idempotency keys. Confirm one version
   and decision wins and no orphan object remains.
10. Accept one request and request bounded changes on another. Confirm history,
    predecessor and notification-failure evidence.
11. A document without `requires_ack` returns 409 on acknowledgment.
12. A required acknowledgment returns the original event on repeat and copy
    never calls it a signature.
13. Delete as landlord; confirm object removal, soft-deleted metadata and event.
14. Intake each privacy-request type. AAL1/non-admin operator actions fail;
    AAL2 can verify identity, link scope and record reviewed outcomes without
    automatic export, redaction or erasure.
15. Make documents due with active tenancy, open request, privacy restriction
    and hold. Every blocker survives a purge race; dry run reports reasons.
16. Set every capability flag false and confirm every document operation stops.
