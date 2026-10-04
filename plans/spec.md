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

# Spec — Hardening: long-term, slice 5 (dashboard overview)

**Updated:** 2026-10-03 · **Status:** built (`sql/056` applied remotely)

1. **"Overdue rent" replaces "Total outstanding".** Sum of rent and service charge that is
   past due this period, let units only, counted per charge (a unit with rent paid and
   service charge overdue adds only the service charge). Second line: "N overdue · ₦Y due
   this week", "₦Y due this week", or "Nothing overdue". Vacant units and not-yet-due
   charges are excluded. No ledger yet, so it is one period per charge — not a balance or
   arrears figure; copy avoids both words.
2. **`GET /properties/portfolio/overview` (`lib/portfolio_overview.py`).** Built from
   `portfolio_unit_snapshot` plus one `properties` read: property/unit/occupied/vacant counts,
   overdue and due-this-week amounts and units, new tenants this month (Lagos month), and
   the property cards (status overdue / due-soon / occupied / vacant / empty, amount, next
   due, photo). Same access rules as Action needed (owner under RLS, staff via the portfolio
   grant). `sql/056` adds `photo_url` to the snapshot rows for the card image.
3. **Dashboard** (`DashboardHome.tsx`) loads the overview instead of every `/properties/`
   page + portfolio summary; cards and KPIs no longer compute in the browser.
4. **Vacant units off the chase lists.** Action needed no longer lists overdue / due-soon rent
   for units with no tenant name; ops overdue skips them too. Lease-ending and failed-chase
   items are unchanged.

## Acceptance

- Live: overview builds for every owner from the live snapshot; snapshot rows carry
  `photo_url`; grants unchanged (`authenticated`, `service_role`); advisors unchanged.
- `pytest` green; web `tsc` + lint clean on touched files.

---

# Spec — Hardening: long-term, slice 4 (portfolio read model)

**Updated:** 2026-10-03 · **Status:** built (`sql/055` applied remotely)

1. **`portfolio_unit_snapshot` (`sql/055`).** One call returns every unit in scope (owner +
   accessible properties, up to 5,000) as one jsonb array: unit fields, property name, the
   status-deciding transactions from the 36 most recent (6 latest paid per rent / service
   charge, latest overdue; one-off charges dropped), and the newest failed/skipped chase in
   the last 14 days. Security invoker: owners under RLS, staff via service role after the
   portfolio grant check. Status rules stay in `lib/unit_status.py`.
2. **Action needed** (`/reminders/actions`, used by the bell, dashboard, payments, reminders,
   properties, tenancies) reads the snapshot: 1 call instead of ⌈units/200⌉ unit pages +
   ⌈units/100⌉ reminder queries.
3. **Ops overdue** (`/staff/ops/overdue`) reads the snapshot and returns only overdue units;
   scans up to 5,000 units instead of the newest 200. Response shape unchanged.
4. **Status rules aligned with the web.** Server "today" is the Lagos date (was the server's
   UTC date); paid dates are read in Lagos time; weekly = the 7 days ending on the due date,
   daily = that day (Python used the calendar month for both, so a weekly tenant who paid
   once showed paid all month in Action needed while the dashboard showed due). The saved-card
   double-charge guard uses the same rule.
5. **Not in this slice:** dashboard KPIs/property cards still compute in the browser from
   paged units; "Total outstanding" counts full rent for every unit not PAID (incl. not-yet-due
   and vacant) — needs a product call before moving it server-side (done in slice 5).

## Acceptance

- Live: old paged reads and the snapshot give identical statuses, failed chases, Action needed
  items, and unit order for every owner.
- Live (rolled back): synthetic unit keeps 6/6 paid + 1 overdue, drops other and out-of-window
  rows, picks the newest failed chase; another user's JWT sees nothing; 1,000 units × 40 txns
  in ~270 ms.
- `pytest` green.

---

# Spec — Hardening: long-term, slice 3 (local auth, API workers, alerts)

**Updated:** 2026-10-03 · **Status:** built (`sql/054` applied remotely)

1. **Local token check (`lib/jwt_verify.py`).** `get_current_user` verifies the access
   token against the project's ES256 signing keys (JWKS cached ≤ 10 min, refetched at
   most every 30s for an unknown key ID): signature, `exp`, issuer `{SUPABASE_URL}/auth/v1`,
   audience and role `authenticated`. Legacy HS256, unknown key, or unreachable keys fall
   back to the GoTrue call (60s cache). `AUTH_LOCAL_JWT=0` turns it off. `/users/me` and
   invite contact binding still read the full user from GoTrue; the profile re-read after
   an update skips the token cache. Trade-off (same as the Supabase Data API): a revoked
   session's access token works until it expires.
2. **API workers.** Dockerfile sets `WEB_CONCURRENCY=2` (uvicorn worker count). Shared
   state is already in Postgres; per-process caches are only auth caches.
3. **Dead-letter alerts.** One ERROR per dead-lettered outbox row (`alert=outbox`, no
   contact or text); retryable failures drop to WARNING.
4. **Ledger retention (`sql/054`).** `purge_paystack_events` (service role) deletes ledger
   rows older than 12 months in batches; `lib/retention.py` runs it with the daily purge.
   Separate function so either the SQL or the code can deploy first.
5. **Deferred:** OpenTelemetry (Sentry already traces 10%); read-model SQL is the next slice.

## Acceptance

- Live: a real ES256 session token verifies locally with the same user and email as GoTrue;
  a tampered token is refused; the same token reads under RLS.
- Live (rolled back): ledger purge removes only rows past 12 months, at most one batch per
  call; only `service_role` can execute it.
- API boots with 2 workers and serves `/health`; malformed token → 401 without GoTrue.
- `pytest` green.

---

# Spec — Hardening: long-term, slice 2 (edge, Paystack events, realtime)

**Updated:** 2026-10-03 · **Status:** built (`sql/053` applied remotely)

1. **API edge (`lib/edge.py`).** Security headers on every response (nosniff, `DENY`
   framing, no-referrer, permissions policy, COOP, strict CSP except `/docs`/`/redoc`,
   HSTS on Render); gzip for JSON ≥ 1 KB; Host allowlist via `ALLOWED_HOSTS`, off when
   unset, `/health` exempt. Order: request ID → host → headers → gzip → CORS.
2. **Paystack event ledger (`sql/053`).** Each verified webhook is claimed in
   `paystack_events` by SHA-256 of the signed body; a processed redelivery is
   acknowledged with no work; a crashed one re-runs on retry. Stores event, reference,
   outcome, transaction — not the payload.
3. **Refunds and disputes.** Paystack has no `charge.failed` event (failed card charges
   are handled synchronously). `refund.processed` adds to `transactions.refunded_amount`
   + `refunded_at`; `charge.dispute.*` sets `disputed_at` / `dispute_status`. Rent status
   is not changed; ops get an ERROR log (`alert=paystack`) for review.
4. **Realtime scoped to the user.** The unread badge listens to the user's own
   `message_threads` (as landlord or tenant) and own read markers — no subscription to
   every message (each send already updates its thread). The messages hub listens to
   the user's threads for previews and to the open thread only for new messages and
   peer read receipts. No unfiltered or DELETE listeners.

## Acceptance

- Headers + CORS + request ID on the real app; preflight still 200.
- Live: ledger claim → retry of an unprocessed key claims again → processed key refused.
- Same webhook body twice: second is `replayed`, no ledger work.
- `pytest` green; web tsc clean, lint 0 errors.
- Headed: two browsers on one chat — message, preview, unread badge, and "Seen" still
  update live.

---

# Spec — Hardening: long-term, slice 1 (worker + retention)

**Updated:** 2026-10-03 · **Status:** built; `sql/052` applied remotely; worker not deployed
(decision 2026-10-03: build it, keep GitHub Actions until a paid worker is approved)

1. **Retention (live via GitHub Actions).** `purge_expired_records` (`sql/052`, service role
   only) deletes outbox `sent`/`dead` rows after 30 days, `product_events` after 180 days,
   and `reminders` log rows after 18 months, 5,000 rows per table per call.
   `lib/retention.py` loops until a round is short (max 50). `POST /jobs/retention`
   (cron secret) runs it; `reminders-due.yml` calls it daily after due reminders.
2. **Worker (ready, not live).** `python -m scripts.worker` (`lib/worker.py`): drains the
   outbox every 10s (immediately again on a full batch of 25), purges rate-limit buckets
   hourly, runs due reminders + retention once per Lagos day from 07:00. The day is claimed
   through `consume_rate_limit("worker-daily:{date}")`, so restarts don't rerun it. SIGTERM
   finishes the pass and exits. `render.yaml` carries the worker block commented out.
3. **Inline flush switch.** `OUTBOX_INLINE_FLUSH=0` makes `flush_delivery_outbox` a no-op, so
   requests only enqueue once the worker is live. Default stays on.
4. Cutover/rollback steps: `docs/ops-checklist.md` → "Background worker cutover".

## Acceptance

- Live (rolled back): with today's windows nothing is deleted; with 1-day/1-month windows
  exactly the expected rows go, at most one batch per table per call; pending outbox rows
  untouched. Only `service_role` can execute the function.
- Live: worker drain, retention, and rate-limit purge run clean; daily guard allows the
  first claim and refuses the second.
- `pytest` green.

---

# Spec — Hardening: RLS initplan rewrite

**Updated:** 2026-10-03 · **Status:** built (`sql/051` applied remotely)

1. **Auth calls run once per query.** Every policy that called `auth.uid()` or
   `auth.jwt()` now calls `(select auth.uid())` / `(select auth.jwt())`, so Postgres
   evaluates it once instead of once per row. 68 policies altered in place; names,
   roles, commands, and conditions unchanged.
2. **Duplicate owner policies dropped.** `properties`, `units`, `reminders`, and
   `transactions` each had an `owner_*` FOR ALL policy plus four "Owners …" per-command
   policies with the same condition. The 16 per-command copies are gone; `owner_*` stays.
3. **Guard.** `tests/test_rls_initplan.py` fails if a policy in `sql/051` or later uses a
   bare auth call.

## Acceptance

- Advisor `auth_rls_initplan`: 84 → 0. `multiple_permissive_policies`: 183 → 103 (the rest
  are intentional landlord/tenant/artisan splits).
- Live: the 72 remaining policies, with the subselect unwrapped, match the pre-migration
  definitions exactly; a landlord sees and writes only their own rows; a stranger sees none
  and is refused on insert/update/delete.
- `pytest` green.

---

# Spec — Hardening: short-term, slice 3

**Updated:** 2026-10-03 · **Status:** built (`sql/050` applied remotely)

1. **Multi-step writes are one transaction.**
   - Unit and property delete is one delete of the parent row (every child cascades or is
     set null); 404 if nothing was deleted.
   - Tenancy and artisan invite claims run as `claim_tenancy_invite` /
     `claim_artisan_invite` (row lock, token check, role update, link in one go); a replay
     by the same user returns the claimed row; another user gets 409 / 404.
   - Staff claim is one conditional update (token still matches, not revoked).
   - Approving an application runs `decide_rental_application` (security invoker, row lock,
     per-unit advisory lock): one decision wins, a second is "already decided", and approve
     reuses the open tenancy or opens one draft.
   - Chat send runs `store_thread_message`: message, thread preview, and the sender's read
     marker together; a replayed key returns the first message.
2. **Messages newest-first.** `GET /messages/threads/{id}/messages` returns the newest 50
   (max 100) with `next_before`; the chat shows "Load earlier messages".
3. **Bounded reads.** The reminder job pages units 500 at a time (no silent 1,000-row cap);
   portfolio and ops reads embed at most the 36 newest transactions per unit; access lookups
   (memberships, owned properties, owners) are cached for one request.

## Acceptance

- Two approves of one application: one decision, one open tenancy.
- Same chat key twice: one message, preview set once.
- A thread with more than 50 messages loads the newest page, then earlier pages.
- `pytest` green; web lint + tsc clean.
- Open: archive-instead-of-delete for units/properties is a product decision, not built.

---

# Spec — Hardening: short-term, slice 2

**Updated:** 2026-10-03 · **Status:** built (`sql/048`, `sql/049` applied remotely)

1. **Outbox can't double-send or burn retries.** The lease covers the whole batch (30s per
   row, max 30 min); rows the worker can't start before the lease would run out are released
   unsent. A throttled row or an open provider breaker is deferred (`defer_delivery_outbox`)
   without counting as an attempt. A provider 4xx (bad number, bad address, except 408/429)
   dead-letters at once (`PermanentDeliveryError`). A re-claimed row logs its reminder once
   (`reminders.outbox_id` unique).
2. **Send limits.** Per number: 10 texts an hour from the outbox. Per user: 30 reminder
   sends / 10 min; per unit: 6 an hour; bulk: 10 runs an hour; invites (tenant, staff,
   artisan): 30 an hour. Over the limit is 429 with `Retry-After`.
3. **Idempotent sends.** Reminder send/retry, chat text/media, and gate admit take an
   `Idempotency-Key`. The browser keeps one key per action (`web/lib/attemptKey.ts`) and
   reuses it after a network error, timeout, 5xx, or "already processing" 409.
   A chat key reused in another thread is 409.
4. **Atomic gate admit (`admit_access_pass`).** Lock, check, count, and log in one
   transaction; two scans of a one-use pass can't both get in; a replayed key returns the
   first admit and does not notify again.

## Acceptance

- Same key twice: one reminder queued, one chat message, one gate use.
- Second scan of a one-use pass with a new key: refused "1/1".
- Outbox defer leaves `attempt_count` unchanged.
- `pytest` green; web lint + tsc clean.

---

# Spec — Hardening: short-term, slice 1

**Updated:** 2026-10-03 · **Status:** built (`sql/047` applied remotely)

1. **Request IDs + structured logs.** Every API response carries `X-Request-ID` (taken
   from the caller when it is a safe token, otherwise generated). Every log line in the
   request carries it; on Render (or `LOG_FORMAT=json`) logs are one JSON object per
   line. One access line per request: method, path (no query string), status, ms.
   Sentry events are tagged with the request ID.
2. **Circuit breakers on Twilio, Mailgun, Paystack.** After 5 consecutive network/5xx
   failures a provider is skipped for 30s, then one trial call is let through. Provider
   4xx (bad number, declined card) never trips a breaker. An open Paystack breaker fails
   before any charge is sent (503); an open notify breaker is a retryable outbox failure.
3. **Remaining foreign-key indexes (`sql/047`).** Every FK the advisor lists as unindexed.
4. **Error boundaries.** Dashboard, tenant, admin, artisan, and root segments show a
   branded retry screen instead of a blank page when a render throws (`SegmentError`,
   retry via `unstable_retry`, error digest shown as the support reference);
   `global-error.tsx` covers a throwing root layout.

## Acceptance

- Two requests in a row get different `X-Request-ID`s; a caller-supplied safe ID is echoed.
- Six straight Mailgun 503s: the sixth call fails fast without an HTTP request.
- Advisor lists no unindexed foreign keys.
- `pytest` green; web lint + tsc clean.

---

# Spec — Hardening: Immediate milestone (from 2026-10-03 architecture audit)

**Updated:** 2026-10-03 · **Status:** built (`sql/043`–`045` applied remotely)

1. **Core indexes (`sql/043`).** `properties(owner_id)`, `units(property_id, created_at, id)`,
   `transactions(unit_id, created_at, id)` + paid-rent partial, `reminders(unit_id, sent_at)`
   + `(unit_id, kind, status, sent_at)`, thread `(landlord_id|tenant_user_id, last_message_at)`,
   `message_thread_reads(user_id)`. Live DB had only primary keys on the first four.
2. **Saved-card charge cannot double-charge.** The browser keeps one `Idempotency-Key` per
   unit + card + amount and reuses it after a timeout, network error, 5xx, or "already
   processing" 409; a decline (other 4xx) starts a fresh key, because Paystack rejects a
   reused reference. The browser waits 60s, longer than the server's 40s Paystack read. A
   new key is refused (409) while another saved-card charge on the unit holds a live lease,
   or when this month's / year's rent is already paid (monthly and annual units only;
   weekly and daily units can pay more than once a month). Not a server-derived cycle key.
3. **Receipts dedupe by payment, not by unit + time.** `reminders.transaction_id` with a
   unique `(transaction_id, kind)` over delivered rows. Rows from before `044` still match
   by the old unit + `paid_at` window.
4. **Unread count in one query** (`unread_thread_count` RPC); thread list loads read markers
   in one call.
5. **No blocking calls on the event loop.** Sync Supabase/storage work in `async def` routes
   moves to the threadpool; every upload read is size-capped.
6. **Small hardening.** Constant-time cron secret; one scheduler per job (GitHub Actions);
   timeout on the Next SMS-diagnostics route.
7. **`/ready`.** Pings PostgREST (2s) and reports oldest pending outbox age. `/health` stays
   a liveness check for Render.

**Follow-ups closed 2026-10-03:** `sql/046` `claim_saved_card_transaction` takes a per-unit
lock and refuses a new key while another saved-card charge on the unit holds a live lease
(replaced the Python in-flight check, which could race). The manual-payment form reuses
its key while the inputs match. Public bucket setup runs once per process
(`lib/storage_buckets.py`) instead of two Storage calls per upload.

## Acceptance

- Advisor no longer lists the hot foreign keys (`properties.owner_id`, `units.property_id`,
  `transactions.unit_id`, `reminders.unit_id`) as unindexed.
- A second saved-card charge for the same cycle returns the first result or a 409, never a
  second Paystack charge.
- Two payments on one unit each get their own receipt.
- `/messages/unread-count` makes a constant number of DB calls.
- `pytest` green; web lint + tsc clean.

---

# Spec — Read caching (browser + auth check)

**Updated:** 2026-10-03 · **Status:** built

A dashboard load made ~10 API calls, and each one checked the login with Supabase Auth
before doing work. `/reminders/actions` alone was fetched by the rail badge, the bell, and
the page, then again on every tab focus.

- **Browser (`web/lib/api-cache.ts`):** shell reads only — `/reminders/actions`,
  `/users/me`, `/admin/me`, and the unread / open work-order / pending application
  counts — go through `apiFetchCached`. Callers share one in-flight request and reuse a
  successful body for 20s. Key = path + signed-in user + portfolio header, so another
  user or portfolio never sees earlier values. Any successful write through `apiFetch`
  clears the whole cache before the existing `emitDataInvalidation` fires; Realtime
  message events and local reads fetch the unread count fresh.
- **API (`lib/auth.py`):** a verified token is remembered for 60s (never past its
  `exp`), keyed by SHA-256 of the token. Bounded size. Auth errors are never cached.
- **Never cached:** writes, payment/ledger/receipt reads, anything not routed through
  `apiFetchCached`, and any logged-in data in Next server/edge caches.

## Acceptance

- Dashboard: `/reminders/actions` hits the API once per load, not once per widget.
- Recording a payment or sending a reminder refreshes Action needed immediately.
- Switching portfolio never shows the previous portfolio's numbers.
- Repeat API calls within a minute make one Supabase Auth round trip.

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
