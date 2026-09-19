# Tenancy documents — counsel/DPO approval packet

**Status:** draft for review; not approved policy and not legal advice.  
**Production rule:** do not insert policy rows or enable document capabilities
until the decision record below is completed and signed.

This packet covers the first-release scope only: landlord-requested tenancy
agreements and references. It excludes government IDs, NIN/BVN records,
screening, automated decisions, e-signatures and unrestricted uploads.

## Regulatory references

- Nigeria Data Protection Act 2023, including the processing principles,
  lawful bases and data-subject rights.
- Nigeria Data Protection Commission,
  [NDP Act GAID 2025](https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf).
- NDPC
  [data-subject access request guidance](https://forms.ndpc.gov.ng/dsar-request/),
  which states a 30-day response target for its own DSAR process.

The GAID states that providing information is not itself a request for consent.
Nexora therefore records presentation of the notice, not consent, unless
counsel separately determines that consent is the correct lawful basis.

## Proposed role allocation

Counsel should approve, amend or reject each statement:

- The landlord determines why tenancy documents are requested and how they are
  used, and is the controller for that content.
- KTI/Nexora stores and processes tenancy content on documented landlord
  instructions and acts as processor for that content.
- KTI is a separate controller only for clearly identified account, security,
  fraud-prevention, support and platform-audit records.
- The landlord remains responsible for responding to rights requests concerning
  tenancy content; KTI provides processor assistance and technical controls.

Decision:

Approver:

Approval reference:

Decision date:

## Proposed immutable processing policies

These values are recommendations for review, not approved defaults.

### Agreement collection

- Proposed version: `agreement-collection-v1`
- Purpose code: `agreement_collection`
- Proposed purpose: collect and review the agreement needed to establish,
  administer or evidence the tenancy requested by the landlord.
- Proposed lawful basis: `contract`
- Alternative requiring counsel analysis: `legitimate_interests`
- Proposed retention anchor: `tenancy_ended`
- Proposed retention period: `730` days after the actual tenancy end.
- Required notice version: `tenancy-documents-v1`
- Required notice URL: an immutable HTTPS versioned page.
- Required notice SHA-256: calculate only from the approved immutable notice.

Counsel decision:

Approved version:

Approved lawful basis:

Approved anchor and days:

Approval reference:

Effective date:

### Reference collection

- Proposed version: `reference-collection-v1`
- Purpose code: `reference_collection`
- Proposed purpose: allow the landlord to assess a tenancy reference requested
  during tenancy setup and preserve the reviewed outcome.
- Proposed lawful basis: `legitimate_interests`
- Required supporting record: completed Legitimate Interest Assessment,
  including necessity, balancing, safeguards and objection handling.
- Proposed retention anchor: `request_closed`
- Proposed retention period: `365` days.
- Required safeguard: tell the tenant not to upload unrelated personal data,
  IDs, NIN/BVN records or special-category information.
- Third-party issue: counsel must determine the transparency process for people
  named in a reference.
- Required notice version: `tenancy-documents-v1`
- Required notice URL and SHA-256: same immutable approved notice, unless
  counsel requires a purpose-specific version.

Counsel decision:

Approved version:

Approved lawful basis:

Approved anchor and days:

LIA reference:

Approval reference:

Effective date:

## Proposed privacy-case policy

- Proposed version: `tenant-rights-v1`
- Notice version: `tenant-rights-v1`
- Notice URL: an immutable HTTPS versioned rights notice.
- Notice SHA-256: calculate from the approved immutable notice.
- Proposed response period: `30` days.

The 30-day value is a conservative product proposal informed by the NDPC's own
DSAR form. Counsel/DPO must confirm the deadline and any extension,
identity-verification or controller-routing rules applicable to Nexora and its
landlord customers.

DPO/counsel decision:

Approved response days:

Approval reference:

Effective date:

## Draft collection-time tenant notice

> Your landlord has asked you to provide the tenancy document shown on this
> page. Your landlord decides why the document is needed and acts as controller
> for the tenancy content. Nexora by KTI stores and processes the document for
> the landlord.
>
> We accept only the requested agreement or reference. Do not upload an identity
> document, NIN, BVN, financial credential, medical information or unrelated
> personal data.
>
> The request page explains the purpose, lawful basis and retention period
> approved for this document type. The landlord and authorised Nexora operators
> supporting the service may access it where necessary. Approved hosting,
> storage, malware-scanning, notification, backup and support providers may
> process it under contractual and security controls described in the full
> notice.
>
> You may request access, correction, erasure, restriction, objection or
> portability where applicable. Some requests may be limited where retention is
> required for a tenancy, legal claim or other approved exception. You may also
> complain to the Nigeria Data Protection Commission.
>
> Opening or acknowledging this notice records that it was presented. It is not
> consent, an electronic signature or acceptance of the tenancy agreement.

Counsel/DPO must add or confirm:

- Controller identity and contact route for each landlord.
- KTI/Nexora legal entity, address and DPO/privacy contact.
- Recipient legal entities, purposes and processing locations.
- International-transfer grounds and safeguards.
- Purpose-specific lawful basis and retention wording.
- Identity-verification, complaint and NDPC escalation routes.
- Effective date, version and change-notification process.

## Approval and hashing procedure

1. Counsel and DPO finalise the exact notice content and policy decisions.
2. Publish each notice at an immutable, versioned HTTPS URL. Do not silently
   alter content at an existing versioned URL.
3. Save the canonical UTF-8 bytes used for publication.
4. Calculate SHA-256:

   ```powershell
   (Get-FileHash .\approved-tenancy-notice.html -Algorithm SHA256).Hash.ToLower()
   ```

5. Record the URL, version, SHA-256, approval reference, approval timestamp and
   effective timestamp in the signed decision record.
6. Engineering prepares a reviewed SQL migration containing those exact values.
7. Re-fetch the published content and verify its SHA-256 before applying the
   policy migration.
8. Apply in staging, run the no-PII lifecycle smoke, and only then schedule a
   separately approved production rollout.

## Final sign-off

Counsel:

Certified DPO:

Security:

Product:

Operations:

Signed approval reference:

Approval date:

