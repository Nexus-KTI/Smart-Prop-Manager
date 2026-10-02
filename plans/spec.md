# Current initiative — Friday chase live (Ada + phase5)

**Updated:** 2026-09-26  
**Owner:** You (headed) + Engineering (gates)  
**Status:** Paystack/cards confirmed; headed chase is Now

## Goal

Prove the Friday rent-and-chase path and phase5 ops in a signed-in browser.
No Growth billing until that is trusted.

## Acceptance

- [x] Paystack keys + save-card / Autopay path (you confirmed)
- [x] Agent Ada + phase5 pytest gate re-run (see backlog Now)
- [ ] Headed [`docs/landlord-ada-loop-smoke.md`](../docs/landlord-ada-loop-smoke.md)
- [ ] Headed [`docs/phase5-smoke.md`](../docs/phase5-smoke.md) (gate admit + repair → artisan)
- [ ] Twilio Phone only if OTP SMS fails

## Monetization (locked)

Free cash/transfer. Growth later as landlord Naira subscription. No rent take-rate.

## Guardrails

Do not build billing, bank feeds, or NIN/BVN in this pass.

---

# Spec — Message media

**Updated:** 2026-10-02 · **Status:** built

Photos, short videos, voice notes, and PDF or Word documents on existing chat
and maintenance threads. Private `message-media` bucket. The API returns a
one-hour signed URL and does not expose the storage path. Limits: photo 8 MB,
document 8 MB, video 25 MB, voice note 8 MB and 3 minutes. Text messages stay
as they are. Payment lines are unchanged.

---

# Spec — Tenancy docs router (backlog Next)

**Updated:** 2026-10-01 · **Status:** built (flags off) · **Launch:** stays dark behind
[`docs/tenancy-docs-launch-gate.md`](../docs/tenancy-docs-launch-gate.md)

## Why

`lib/tenancy_docs.py`, `lib/request_limits.py`, retention and `sql/028`–`031`
shipped in `404da29`; the router did not. `routers/tenancies.py` still takes
base64 JSON and calls `upload_tenancy_document(file_name=...)` without the
required `sha256`, so the first upload would raise even in local counsel review.
`tests/test_tenancy_docs.py` holds 20 `ROUTER_GAP` xfails that define the contract.

## Rules

- Server flags only (`DOCS_*`, `DOC_*`, `TENANT_DOC_SUBMISSIONS_ENABLED`); authorize first, then report flags honestly.
- Access: landlord of the tenancy (any status); linked tenant only while `active` for general documents, only while `draft`/`pending_verification` for requested collection. Staff, other users, anonymous: 403/401.
- Bytes: multipart → `validate_document` → `scan_document` (fail closed) → private object → row. Signed URLs only from `open`, 15 minutes, clean + not deleted, each open writes `document_opened`.
- Real Supabase client uses the 029 locked RPCs (claim deletion, submissions, review, requests); test doubles without `.rpc` use conditional updates, as `lib/tenancy_docs_retention.py` does.
- Any failure after the object lands removes the object and the row (or marks `orphan_cleanup_pending`), then 503.
- Delete refuses legal hold (409) and re-checks hold atomically before removing the object. On the real DB the claim also refuses documents inside retention.

## Endpoints

| Method | Path | Who | Gate |
|--------|------|-----|------|
| GET | `/tenancies/{id}/documents` | landlord, active tenant | authorized; empty + message when read off |
| POST | `/tenancies/{id}/documents` (multipart `file`, `doc_type` agreement/reference/other, `expires_on`, `requires_ack`) | landlord | read + upload |
| GET | `/tenancies/{id}/documents/{doc}/open` | landlord, active tenant | read |
| POST | `/tenancies/{id}/documents/{doc}/acknowledge` | active tenant | read + upload + `DOCS_ACK_TEXT_VERSION` |
| DELETE | `/tenancies/{id}/documents/{doc}` | landlord | read + upload |
| POST | `/tenancies/{id}/document-requests` (`Idempotency-Key`) | landlord | `DOC_REQUESTS_ENABLED` |
| POST | `/tenancies/{id}/document-requests/{req}/submissions` (multipart, `Idempotency-Key`) | claimed pending tenant | requests + `TENANT_DOC_SUBMISSIONS_ENABLED` |
| POST | `/tenancies/{id}/documents/{doc}/decision` (`Idempotency-Key`) | landlord | `DOC_REVIEW_ENABLED` |

Activation returns 409 while a document request is open, submitted, or awaiting changes (when requests are on).

## Web

`web/lib/api.ts`: multipart upload, `open` endpoint for signed links, real
`capabilities` from the API. Request/privacy UIs stay stubbed until their flags
have counsel sign-off.

## Acceptance

- [x] All 20 `ROUTER_GAP` tests pass; markers removed (plus an HTTP multipart route test)
- [x] `scripts/check-green.ps1` green
- [ ] Review follow-ups 1–5 in `plans/backlog.md` closed (merged dark 2026-10-02; no blockers)
- [ ] Dossier upload/open/acknowledge clicked locally with flags on (needs local ClamAV + branch bucket); production flags untouched
