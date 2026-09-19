# Tenancy documents — launch gate

**Current state:** prepared in code, disabled in every environment by default.  
**Production rule:** do not enable either document capability until every
required approval below is recorded.

This is an operational checklist, not legal advice and not substitute wording
for Nigerian counsel.

Complete the controller, lawful-basis, ROPA, DPIA, registration, transfer,
rights and incident evidence in
[`tenancy-docs-ndpa-evidence.md`](tenancy-docs-ndpa-evidence.md).
Use
[`tenancy-docs-policy-approval-packet.md`](tenancy-docs-policy-approval-packet.md)
to record the exact counsel/DPO policy and notice decisions.
Approved operators must also follow
[`tenancy-docs-privacy-ops.md`](tenancy-docs-privacy-ops.md).

## Required legal decisions

- [ ] Nigerian counsel approves the landlord ToS and DPA.
- [ ] Counsel confirms the landlord's controller role for tenancy content,
      KTI/Nexora's processor role for that content, and KTI's separate
      controller role (if any) for account, security and audit records.
- [ ] Tenant privacy notice identifies document types, purposes, lawful basis,
      recipients, retention, deletion rights, and complaint route.
- [ ] Counsel approves the exact receipt/read acknowledgment text and confirms
      it is not represented as an electronic signature.
- [ ] The approved ToS, DPA, privacy notice, and acknowledgment each have a
      version identifier and effective date.
- [ ] Set `DOCS_ACK_TEXT_VERSION` to that approved acknowledgment version in
      staging, then production; leave it blank before approval.
- [ ] Product records actor, version, and timestamp for every required
      acceptance.
- [ ] A process exists for access, correction, deletion, legal hold, breach
      response, and regulator/data-subject requests.

## Required security decisions

- [ ] Apply `sql/028_tenancy_document_hardening.sql` on a Supabase branch first.
- [ ] Reconcile the current remote drift: 028 objects exist but the migration
      ledger has no 028 entry. Compare the complete schema/checksum and repair
      branch history; do not blindly replay 028.
- [ ] Apply `sql/029_tenancy_document_collection_review.sql` only after its 028
      preflight succeeds. Verify RPC execution grants exclude `anon` and
      `authenticated`.
- [ ] Provision `tenancy-docs` explicitly as a **private** bucket; never rely on
      runtime bucket creation.
- [ ] Bucket limit is 8 MB and allowed MIME types are PDF, JPEG, and PNG.
- [ ] `DOCS_CLAMAV_HOST` points to a private, monitored ClamAV service.
- [ ] Cross-tenant, pending/ended tenant, staff, and anonymous access tests pass.
- [ ] Signed links expire after 15 minutes and are never issued before a clean
      malware scan.
- [ ] Storage/database orphan cleanup and lifecycle audit events are verified.
- [ ] Backup, restore, breach response, and secret rotation owners are named.
- [ ] Subprocessor legal entity, purpose, processing location, DPA, breach
      commitment and cross-border safeguard are approved for Supabase, Render,
      notifications, monitoring, ClamAV, backup and support access.
- [ ] Restore and key-rotation exercises pass; privileged access is reviewed.
- [ ] Incident runbook records the NDPC 72-hour qualifying-breach path and
      immediate high-risk data-subject notification assessment.

## Retention and deletion

- [ ] Counsel approves each immutable purpose policy's retention anchor and
      period; `730` days remains only the legacy product assumption.
- [ ] Legal-hold creation and release have named authorized operators.
- [ ] Run `python scripts/tenancy_docs_retention.py` in dry-run mode and review
      every candidate before any purge.
- [ ] Commit mode requires both `DOCS_RETENTION_PURGE_ENABLED=true` and
      `--commit --confirm PURGE`.
- [ ] Purge failures alert an operator and successful purges retain metadata and
      an audit event.

## Staged rollout

1. Keep every document, collection, review, privacy and purge flag false.
2. Reconcile 028, apply 029 and provision the private bucket on a branch.
3. Insert only counsel/DPO-approved processing and privacy policy versions.
4. Run no-PII request/upload/review/open/rights/hold/retention exercises.
5. Enable read, request, submission, review and privacy flags in staging only.
6. Complete security, privacy, legal and operational sign-off.
7. Enable production capabilities individually during a monitored window.
8. Roll back instantly by setting every capability flag to `false`; investigate
   any already-issued signed links (maximum lifetime 15 minutes).

## Launch evidence

Record links or identifiers here before production:

- Counsel approval:
- ToS version:
- DPA version:
- Tenant privacy version:
- Acknowledgment text version:
- Supabase branch test:
- 028 drift reconciliation evidence:
- 029 privilege/RLS/immutability test:
- Subprocessor and transfer register:
- Backup/restore exercise:
- Key-rotation exercise:
- DSAR owner:
- Security test report:
- Incident owner:
- Retention owner:
- Release approver:
