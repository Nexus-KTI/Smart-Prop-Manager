# Tenancy documents — NDPA evidence pack

**Status:** engineering template only; Nigerian counsel and a certified DPO
must complete and approve it before any production capability is enabled.

Primary regulatory reference: Nigeria Data Protection Commission,
[NDP Act General Application and Implementation Directive 2025](https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf).
Record the exact review decisions in the
[`tenancy-docs-policy-approval-packet.md`](tenancy-docs-policy-approval-packet.md)
before engineering creates immutable policy rows.

## Scope locked for the first release

- Requested agreements and references only.
- Claimed tenants may submit against their own draft or pending-verification
  tenancy.
- Government ID copies, NIN/BVN artifacts, screening, free-form uploads,
  automated decisions, e-signature and staff access are excluded.
- Receipt/read and privacy-notice acknowledgments are evidence of notice or
  receipt, not consent and not a signature.

## Controller and processor role assessment

- [ ] Counsel confirms the landlord determines purpose and use of tenancy
      documents and acts as controller for that content.
- [ ] Counsel confirms KTI/Nexora processes tenancy content on documented
      landlord instructions and records the required DPA terms.
- [ ] Counsel assesses KTI's separate controller role for account, security,
      fraud-prevention, support and platform-audit records.
- [ ] The product routes data-subject requests to the responsible controller
      while KTI provides processor assistance where required.

Approver:

Decision date:

Legal memorandum:

## Record of processing activities

Complete one approved processing-policy version per purpose. Do not activate a
database policy row until these fields are approved.

### Agreement collection

- Purpose:
- Personal-data categories:
- Data subjects:
- Lawful basis:
- Legitimate Interest Assessment required/result:
- Recipients and access roles:
- Processing locations:
- Cross-border transfer ground/instrument:
- Retention anchor and period:
- Deletion/restriction exceptions:
- Privacy-notice version:
- Approved notice-content SHA-256:
- Controller instruction/DPA version:

### Reference collection

- Purpose:
- Personal-data categories:
- Data subjects, including third parties named in a reference:
- Lawful basis:
- Legitimate Interest Assessment required/result:
- Recipients and access roles:
- Processing locations:
- Cross-border transfer ground/instrument:
- Retention anchor and period:
- Deletion/restriction exceptions:
- Privacy-notice version:
- Approved notice-content SHA-256:
- Controller instruction/DPA version:

## Transparency and data minimisation

- [ ] Collection-time notice identifies controller/processor, lawful basis,
      categories, purpose, method, authorized recipients and recipient purpose.
- [ ] Notice explains access, correction, erasure, restriction, objection,
      portability, internal remediation and the right to complain to NDPC.
- [ ] Notice is understandable on mobile and is presented before upload.
- [ ] Product stores notice version and presentation timestamp without
      misrepresenting notice as consent.
- [ ] Request templates prohibit IDs/NIN/BVN and discourage unrelated personal
      data in free text.
- [ ] Reason codes are preferred over free-form review and privacy-case notes.

## DPIA, registration and DPO

- [ ] Certified DPO records whether this software deployment requires a DPIA
      under the Act/GAID and whether filing with NDPC is required.
- [ ] If required, the DPIA is completed, signed, filed and approved before
      processing starts.
- [ ] KTI and participating controllers assess whether they are controllers or
      processors of major importance and record registration/CAR obligations.
- [ ] DPO/privacy owner, escalation route, training schedule and periodic audit
      schedule are named.

DPO:

DPIA reference/outcome:

NDPC filing reference:

Registration assessment/reference:

## Processor and transfer register

Record legal entity, service, data categories, purpose, locations, transfer
ground, DPA terms, deletion support, breach commitment and approval for:

- Supabase database and private Storage:
- Render/API hosting:
- ClamAV operator/host:
- Notification providers:
- Error monitoring:
- Backup and support access:

No new subprocessor may receive tenancy-document content without DPO/counsel
review and an updated register.

## Data-subject rights operations

- [ ] Intake supports access, correction, erasure, restriction, objection and
      portability.
- [ ] Identity is verified proportionately without collecting an ID copy in
      this release.
- [ ] Controller ownership, scope, third-party data and legal-claim exceptions
      are reviewed before disclosure or erasure.
- [ ] Due dates come from approved policy; the application does not invent a
      statutory deadline.
- [ ] Decisions, restrictions, exports, refusals and completion are evidenced.
- [ ] Automated deletion/export remains disabled.

## Retention and legal hold

- [ ] Counsel approves a purpose-specific anchor and period for each policy.
- [ ] Active requests, current tenancy need, privacy restrictions and
      unreleased legal holds block deletion and purge atomically.
- [ ] Holds record authorized actor, reason, source, time and one-time release.
- [ ] Dry-run output is reviewed by a named operator before destructive mode.
- [ ] Residual objects, backups and audit metadata have documented disposal.

## Security and incident response

- [ ] Private bucket, 8 MB request limit, structural validation, generated
      object paths, ClamAV, short signed links and least privilege are verified.
- [ ] Access review, backup/restore, secret rotation, monitoring and incident
      owners are documented and exercised.
- [ ] Qualifying breaches are assessed for NDPC notification within 72 hours;
      high-risk affected data subjects are notified immediately as applicable.
- [ ] Incident evidence records circumstances, period, categories, approximate
      subjects/records, harm assessment, containment and contact owner.

Incident owner:

DPO escalation:

NDPC notification procedure:

Data-subject notification procedure:

## Release approval

- Counsel:
- Certified DPO:
- Security:
- Product:
- Operations:
- Supabase branch evidence:
- No-PII lifecycle evidence:
- Production release owner:
- Rollback owner:
