# Tenancy documents — remote 028 drift record

**Inspection:** 2026-09-16, production metadata queries and security hardening.

## Observed state

- The migration ledger has no `028_tenancy_document_hardening` entry. Its
  latest document-related entry is `027_tenancy_autopay`.
- `tenancy_documents` already has the 028 checksum, uploader, scan, soft-delete,
  legal-hold and purge columns and constraints.
- `tenancy_document_acknowledgments` and `tenancy_document_events` exist with
  RLS enabled, expected foreign keys, select policies and integrity triggers.
- The four 028 functions exist. Production fingerprints observed:
  - `prevent_acknowledgment_mutation`: `561dde55cc2918267e86caf02f45002e`
  - `set_tenancy_document_event_tenancy`: `ea9e009db5b5544f4297646fa7042134`
  - `set_tenancy_document_owner`: `fa8e5d7618a4d3dfacf15df6f7738e74`
  - `validate_document_acknowledgment`: `407203f644221b920fd2c1accda459f3`
- Local `sql/028_tenancy_document_hardening.sql` SHA-256:
  `69a0de96351e43ac51359937d7893e97258d452e25ef35057ea67d8d988f84e0`.

The remote database now also contains the 029 tables, functions, columns,
triggers and RLS policies, but neither 028 nor 029 is represented in the
migration ledger. Migration `tenancy_document_remote_security_hardening` is
recorded and verified: browser-role table grants, exposed internal trigger RPCs
and the targeted mutable function search paths are all zero.

Migration `tenancy_document_028_029_remote_reconciliation` records verified
028/029 object fingerprints without replaying either migration. The private
`tenancy-docs` bucket is provisioned with an 8 MB limit and PDF/JPEG/PNG MIME
allowlist.

Both approved policy tables are empty, so collection and privacy capabilities
must remain disabled.

## Required branch reconciliation

1. Create a Supabase development branch from the current production schema.
2. Repeat the column, constraint, policy, trigger and function inventory and
   save it with the branch reference.
3. Compare every 028 object with the local file. Do not replay 028.
4. On that branch only, apply a preflight-only ledger reconciliation migration
   named `028_tenancy_document_hardening_reconciled`. It must assert all
   required objects/columns and include the local SHA-256 in its migration
   comment; it must not recreate objects.
5. Apply `029_tenancy_document_collection_review` and run the no-PII lifecycle,
   RLS, RPC-grant and append-only evidence smoke.
6. Counsel/DPO/security review the branch evidence before any separately
   approved production migration or capability change.

## Current blocker

No development branch exists. Production remains unverified for transactional
workflow behavior, and policy-backed capabilities must remain disabled until
counsel/DPO-approved policy values are inserted and the no-PII smoke passes.
