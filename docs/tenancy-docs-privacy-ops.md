# Tenancy documents — privacy operations runbook

Use only after the evidence pack, policy versions, AAL2 operator access and
Supabase-branch exercise are approved. This runbook does not replace counsel or
the certified DPO.

## Rights request

1. Confirm the request was received and preserve its immutable policy version
   and computed review date.
2. Determine whether the landlord controls the requested tenancy content or
   KTI controls the relevant account/security record. Route controller action
   accordingly; KTI assists the landlord as processor.
3. Verify identity proportionately through the authenticated account and known
   tenancy facts. Do not request an ID/NIN/BVN upload in this release.
4. With an allowlisted AAL2 session, record identity verification. Link only
   in-scope documents and mark restrictions or erasure review explicitly.
5. Review third-party data, legal claims, regulatory duties, tenancy need and
   other counsel-approved exceptions before disclosure, correction or erasure.
6. Prepare exports and redactions outside automatic product actions. Record
   evidence and an approved outcome code; never paste document contents into
   free-text notes.
7. Communicate the reviewed decision through the approved channel, retain its
   evidence, and close or refuse the case. No case action automatically deletes
   a blob.

## Restriction and legal hold

- Restricted/erasure-review scope receives a first-class privacy-request hold
  in the same database transition.
- Separate claim, regulator and incident holds use the AAL2 admin RPC.
- Only an allowlisted AAL2 operator may release a hold. Record a bounded release
  reason and confirm no other active hold remains.
- Do not release a hold merely because a privacy case closes; the assigned
  controller/DPO must approve release.

## Retention

1. Confirm the immutable processing policy and anchor are approved.
2. Run `python scripts/tenancy_docs_retention.py` without commit options.
3. Review every eligible item and every blocker: active tenancy, open request,
   open privacy restriction, cached hold or first-class hold.
4. Commit only during an approved window with both the server purge flag and
   command confirmation. Investigate every failed object deletion.
5. Re-run commit mode after investigation to reconcile any
   `deletion_evidence_pending` or `purge_evidence_pending` operation; object
   deletion is idempotent and completion evidence is finalized transactionally.
6. Preserve purge metadata and append-only lifecycle evidence.

## Security incident

1. Contain access by disabling all document/request/submission/review/privacy
   flags. Rotate affected secrets and revoke privileged sessions.
2. Preserve logs and legal holds. Record circumstances, period, data and
   subject categories, approximate counts, likely consequences, containment
   and contacts.
3. Escalate immediately to the incident owner and DPO. Counsel/DPO determine
   whether the breach qualifies for NDPC notification within 72 hours and
   whether high risk requires immediate data-subject notification.
4. Use approved notices and channels. Record notification time, recipients,
   content version and any reason for a counsel-approved exception.
5. Restore from tested backups only after containment. Review access, keys,
   subprocessors and corrective actions before staged re-enablement.

## Subprocessors and locations

Before launch, the evidence pack must name the legal entity, processing
purpose, data categories, storage/support locations, transfer safeguard, DPA,
breach commitment, deletion support and owner for Supabase, Render, ClamAV,
notification providers, monitoring and backups.

## Access, backup and key review

- Quarterly and after personnel changes: review admin allowlist, AAL2 factors,
  service-role access, hosting/support access and private bucket policies.
- At the approved cadence: restore a synthetic no-PII backup and record RTO/RPO
  evidence.
- Rotate service, storage, notification and scanner secrets after incidents and
  at the approved cadence; record owner, time and verification.

## Rollback

Set `DOCS_READ_ENABLED`, `DOCS_UPLOAD_ENABLED`, `DOC_REQUESTS_ENABLED`,
`TENANT_DOC_SUBMISSIONS_ENABLED`, `DOC_REVIEW_ENABLED`,
`PRIVACY_CASES_ENABLED` and `DOCS_RETENTION_PURGE_ENABLED` to `false`. Existing
signed links can remain valid for at most 15 minutes; investigate them and
preserve relevant disclosure evidence.
