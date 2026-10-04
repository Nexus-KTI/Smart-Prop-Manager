# Nexora — Production ops checklist

**Purpose:** Feature Now is green; outages come from misconfig. Run this before / after each deploy.  
**Related:** [`render.yaml`](../render.yaml) · [`.env.example`](../.env.example) · [`sql/`](../sql/)

---

## 1. Live notify (local proof 2026-08-09)

| Path | Result |
|------|--------|
| Mailgun landlord money-in | **sent** |
| Mailgun tenant due (channel=email) | **sent** |
| Mailgun tenant receipt | **sent** |
| Twilio SMS to unit contact | **failed** — trial: number unverified (`+234…`). Need Twilio production / verified recipient |

**Inbox check:** `kingstechinnovations@gmail.com` (plus aliases).  
**Action for prod SMS:** upgrade Twilio out of trial or verify landlord test numbers; keep Settings default SMS only when tenants have phone contacts.

### Phone OTP (login/signup) — 2026-08-22

Auth OTP goes **Supabase Phone Auth → Twilio configured in the Supabase dashboard** — **not** the app `.env` alone.

| Finding | Detail |
|---------|--------|
| Rotating `.env` Twilio | Does **not** change login OTP |
| Proof | New Twilio SID `ACf7c4…` / From `+15155172581` — no OTP traffic today |
| Actual OTP path | Old Twilio `AC8abf…` / From `+14472244801` — today’s OTPs **failed 21608** |
| UI symptom | “Enter the 6-digit code…” while no SMS arrives |

**Fix (required):** Supabase Dashboard → **Authentication → Providers → Phone** → set Account SID, Auth Token, and Message Service / From to the **production** Twilio values used on Render Smart-Prop-Manager (`TWILIO_*`). Save, then retry login. Step-by-step: [`auth-dashboard-ops.md`](auth-dashboard-ops.md).

**Also:** on a Trial account, the login phone must be under Twilio **Verified Caller IDs**.

**Alignment checklist (2026-09-24)**

- [ ] Supabase Phone SID matches Render `TWILIO_ACCOUNT_SID`
- [ ] From / Messaging Service matches `TWILIO_SMS_FROM` (or WA From if used for OTP)
- [ ] Trial lifted **or** test NG numbers verified
- [ ] Login OTP SMS received; chase SMS (unit contact) received when channel=sms

App UX: `GET /notify/sms-delivery` flags “no SMS on API Twilio in last 5 minutes” when Supabase still points at a different Twilio account.

---

## 2. Environment (API / Render web)

Required:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL=https://smart-prop-web.vercel.app`
- `CORS_ORIGINS=https://smart-prop-web.vercel.app,http://localhost:3000,http://127.0.0.1:3000` (include production web origin)
- `PAYSTACK_SECRET_KEY` on the **API only** (Render Smart-Prop-Manager)
- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` on the **web only** (Vercel / `web/.env.local`)
- Do **not** put the secret in any `NEXT_PUBLIC_*` var. Root `PAYSTACK_PUBLIC_KEY` is unused.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` (and `TWILIO_WHATSAPP_FROM` only if using WA)
- Mailgun: `EMAIL_SERVICE_PROVIDER=mailgun`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SENDER_EMAIL`, `EMAIL_FROM_NAME=Nexora`, `FROM_EMAIL`
- `CRON_SECRET` (HTTP due job) · cron service inherits Mailgun + Twilio from web in `render.yaml`
- `ADMIN_EMAILS`

Optional:

- `ALLOWED_HOSTS` — comma list of Host headers the API answers (`*.example.com`
  wildcards). Unset = not enforced. Suggested once confirmed:
  `smart-prop-manager.onrender.com`; add any custom API domain **before**
  pointing DNS at it, or that domain gets `400 Invalid host header`. `/health`
  is always exempt so Render health checks pass.
- The API also sends security headers (nosniff, `DENY` framing, no-referrer,
  strict CSP except `/docs`, HSTS on Render) and gzips JSON ≥ 1 KB (`lib/edge.py`).
- `WEB_CONCURRENCY` — API worker processes; the Dockerfile defaults to `2`
  (~100 MB each, fits 512 MB). Use 3–4 only on a 1 GB+ plan. Rate limits,
  idempotency, and the outbox live in Postgres, so workers need no coordination.
- `AUTH_LOCAL_JWT` — default on. Access tokens are checked against the project's
  signing keys (`/auth/v1/.well-known/jwks.json`, cached ≤ 10 min) instead of a
  Supabase Auth call per request (`lib/jwt_verify.py`). Legacy HS256 tokens, an
  unknown key ID, or unreachable keys fall back to Supabase Auth. Like the
  Supabase Data API, a signed-out or revoked session's access token keeps working
  until it expires (Auth → JWT expiry, default 1 hour). Set `0` to send every
  check to Supabase Auth.
  After rotating signing keys, wait 20 minutes before revoking the old key.

Web (`web/.env`):

- `NEXT_PUBLIC_API_URL` → API origin  
- `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`  
- `NEXT_PUBLIC_AUTH_OTP_CHANNEL=sms`  
- `NEXT_PUBLIC_INVITE_ONLY_SIGNUP` as intended  

Tenancy documents remain off until
[`tenancy-docs-launch-gate.md`](tenancy-docs-launch-gate.md) is approved:
Operational rights, hold, incident and rollback steps are in
[`tenancy-docs-privacy-ops.md`](tenancy-docs-privacy-ops.md).

- API: `DOCS_READ_ENABLED=false`, `DOCS_UPLOAD_ENABLED=false`,
  `DOC_REQUESTS_ENABLED=false`, `TENANT_DOC_SUBMISSIONS_ENABLED=false`,
  `DOC_REVIEW_ENABLED=false`, `PRIVACY_CASES_ENABLED=false`, and
  `DOCS_RETENTION_PURGE_ENABLED=false`; leave `DOCS_ACK_TEXT_VERSION` blank.
- Do not add a `NEXT_PUBLIC_*` document flag.
- Staging sequence: reconcile 028 drift → apply 029 on a Supabase branch →
  private bucket + ClamAV → no-PII exercise → legal/security sign-off →
  monitored production flags.
- Hold and privacy-case operator actions require an allowlisted explicit AAL2
  session. Review admin access quarterly and after every personnel change.
- Keep the approved subprocessor/location/transfer register, backup/restore
  evidence, key-rotation log, DSAR owner and incident escalation contacts with
  the launch evidence pack.

---

## 3. Paystack webhook

- Dashboard URL: `https://<api-host>/payments/webhook/paystack`
- Secret matches `PAYSTACK_SECRET_KEY`
- Confirm a test charge → one transaction becomes `paid` and one
  `payment-receipt:<transaction_id>` outbox row is created.
- Replaying confirm/webhook must reuse the same transaction and outbox row.
- Confirm rejects any Paystack amount, currency, transaction ID, unit, charge
  type, purpose, or stored reference that does not match the pending row.
- Autopay uses `autopay:<tenancy_id>:<due_date>`; a `failed` row with a provider
  reference must be verified at Paystack before any manual retry.
- Manual, pending-checkout, and saved-card POST retries must preserve their
  original `Idempotency-Key`; reusing a key with changed inputs is a conflict.

### Event ledger, refunds, disputes (`sql/053`)

- Every verified webhook is recorded in `paystack_events` keyed by the SHA-256 of
  the signed body. A redelivery of a processed event returns `{"replayed": true}`
  and does nothing; an event whose processing crashed (`processed_at` null) is
  run again on Paystack's retry.
- `refund.processed` adds to `transactions.refunded_amount` and sets
  `refunded_at`; `charge.dispute.*` sets `disputed_at` / `dispute_status`. The
  rent **status is not changed** — decide by hand whether the rent is owed again.
  Refund processed / failed / needs-attention and dispute create/remind log at
  ERROR (`alert=paystack`) so Sentry raises them.
- Review:

```sql
select received_at, event, reference, outcome, transaction_id
from public.paystack_events
where outcome like 'refund%' or outcome like 'dispute%'
   or outcome in ('unmatched', 'conflict') or processed_at is null
order by received_at desc
limit 50;
```

---

## 4. Due reminders cron

- Preferred (Free tier): GitHub Actions [`.github/workflows/reminders-due.yml`](../.github/workflows/reminders-due.yml)
  daily `0 6 * * *` UTC (~07:00 WAT) → `POST /reminders/jobs/due` with
  `Authorization: Bearer $CRON_SECRET` (same secret as delivery-outbox).
- One scheduler per job: `render.yaml` no longer defines Render cron services.
  If you move to Render Cron later, disable the matching workflow first.
- Or manual: `POST /reminders/jobs/due` with `Authorization: Bearer $CRON_SECRET`
  or `X-Cron-Secret`.
- That job runs **due reminders, renewal notices, autopay, and stale-session
  revoke** (`lib/autopay_job.py` charges saved Paystack cards on rent due day;
  `lib/session_policy.py` — see §6b Session length).
- After run: due/renewal messages are queued; the delivery cron writes
  `reminders` rows with `sent` or a clear terminal `error_detail`. Autopay
  marks matching transactions `paid` or `failed`.

---

## 5. Delivery outbox and rate-limit cleanup

- GitHub Actions [`.github/workflows/delivery-outbox.yml`](../.github/workflows/delivery-outbox.yml)
  POSTs `/jobs/delivery-outbox` every ~5 minutes (see below).
- Healthy: ready work is normally drained within 10 minutes:

```sql
select status, count(*), min(created_at) as oldest
from public.delivery_outbox
group by status
order by status;
```

- Investigate any `pending`/`retry` row older than 15 minutes, any expired
  `processing` lease, or any `dead` row. Check `attempt_count`, `last_error`,
  `event_name`, and provider status before replay.
- Each dead letter logs one ERROR `Outbox delivery <id> dead-lettered`
  (`alert=outbox`, with `event_name`, `channel`, `attempts`, `permanent`; no
  contact or message text), so Sentry raises it. Failures that will retry log a
  WARNING only. In Sentry, alert on `alert:outbox` and `alert:paystack`.
- Safe replay: after fixing the cause, move only the reviewed dead row to
  `retry`, clear `completed_at`, and set `next_attempt_at=now()`. Do not change
  its `idempotency_key` and do not bulk replay payment receipts without checking
  the transaction/provider first.
- Delivery is at-least-once across a process crash after a provider accepts a
  message but before acknowledgement. Stable enqueue keys and provider/reference
  checks prevent concurrent sends, but operators should still inspect provider
  logs before replaying an ambiguous dead row.
- Interactive chase/invites also enqueue into the same outbox and attempt an
  immediate flush; if flush cannot complete, the cron picks the row up within
  five minutes. Payment receipts skip landlord/tenant/chat steps that already
  succeeded for that payment window.
- The same cron purges rate-limit buckets expired for more than one day. A
  sustained `503 Request protection temporarily unavailable` means the
  service-role RPC or database is unavailable; do not bypass the limiter.

### Data retention (`sql/052`, `sql/054`, `lib/retention.py`)

- Daily after due reminders: `reminders-due.yml` also POSTs `/jobs/retention`
  (same Bearer secret). Manual: same call, or `workflow_dispatch`.
- Deletes: outbox rows `sent`/`dead` for 30+ days (they hold phone numbers and
  message text), `product_events` older than 180 days, `reminders` log rows
  older than 18 months, `paystack_events` ledger rows older than 12 months
  (Paystack stops retrying after 72 hours). Pending/retry/processing outbox rows
  are never touched.
- Batched 5,000 rows per table per call; the response lists totals per table
  and `rounds`. A log line "Retention stopped after 50 rounds" means more remain —
  run it again.
- Replay a `dead` row before it turns 30 days old, or it is gone.

### Background worker cutover (not live yet)

`scripts/worker.py` (`python -m scripts.worker`) drains the outbox every ~10s,
purges rate-limit buckets hourly, and runs due reminders + retention once per
Lagos day at 07:00. Render background workers need a paid plan; the live API is
on Free. To switch over:

1. Uncomment `smart-prop-worker` in `render.yaml` (or create a Background Worker
   by hand: Docker, command `python -m scripts.worker`) and copy the API env
   (Supabase URL + anon + service role, Twilio, Mailgun/SMTP, Paystack,
   `FRONTEND_URL`, `SENTRY_DSN`).
2. Deploy; logs show `Worker started`, then `Outbox drained` when work arrives.
   Send one test reminder and confirm it leaves within ~15s.
3. On the API, set `OUTBOX_INLINE_FLUSH=0` so requests only enqueue.
4. Disable both GitHub workflows (`delivery-outbox`, `reminders-due`). Overlap on
   the cutover day is safe (jobs are idempotent) but can add a duplicate
   "contact does not match channel" log row.
5. Rollback: re-enable the workflows, unset `OUTBOX_INLINE_FLUSH`, suspend the
   worker.

---

## 6. SQL / schema

Repo files under `sql/` (apply in order if rebuilding):

`000` → … → `031` → `032_resilience_payments_outbox_limits` →
`033_reminders_queued_status` → `034`…`037` access passes/events →
`038_signup_attribution` → `039_unit_apply_photo` → `040_session_policy`

Remote (Supabase): `032` and `033` DDL are live and recorded as verify-only
migration stamps (`20260917172210` / `20260917172220`). Do **not** re-apply the
full financial sections of `032`. Prefer MCP/`list_migrations` + column checks
over blind re-apply. `038_signup_attribution` applied 2026-09-24.

`delivery_outbox` and `rate_limit_buckets` intentionally use RLS with no
client policies (service-role RPCs only), matching `product_events`.
Same pattern: `access_pass_events` and `paystack_events` (API/service-role only).

Interactive chase can log `queued` reminder rows while the outbox worker
delivers. The GitHub Actions `delivery-outbox` workflow drains it every ~5
minutes; `GET /ready` reports the oldest waiting row.

**2026-09-24 check:** the Render MCP account (`emmanuel@keyriumconsulting.com` /
`My Workspace`) has ProjectX/kronix only — **not** Nexora.

**Live Nexora API (Kings-Hubbot):** web service **Smart-Prop-Manager**
(`srv-danbl2rbc2fs73drq7o0`) → https://smart-prop-manager.onrender.com  
Repo `Nexus-KTI/Smart-Prop-Manager` `main`; Free tier (spins down).  

**Render MCP:** project `.cursor/mcp.json` uses
`Authorization: Bearer ${env:RENDER_API_KEY}`. Put the key in `.env` and as a
User env var (`setx RENDER_API_KEY …`), then **restart Cursor** so MCP resolves
it. Prefer the Kings-Hubbot API key (not Keyrium).

### Delivery outbox without a Render card (recommended on Free)

Cancel the Render “New Cron Job” / Add Card flow. Use GitHub Actions instead:

1. Repo **Settings → Secrets → Actions** → add `CRON_SECRET` (same value as
   Smart-Prop-Manager / local `.env`).
2. Workflow [`.github/workflows/delivery-outbox.yml`](../.github/workflows/delivery-outbox.yml)
   POSTs `https://smart-prop-manager.onrender.com/jobs/delivery-outbox` every
   ~5 minutes (`workflow_dispatch` for a manual run).
3. First cold start may take ~50s — curl `--max-time 90` accounts for that.

Optional: [cron-job.org](https://cron-job.org) with the same URL + Bearer header.

### Native Render Cron (only if you add billing later)

Disable the matching GitHub workflow first so each job has one scheduler.

1. Name: `smart-prop-delivery-outbox`
2. Schedule: `*/5 * * * *` · Docker command: `python -m scripts.delivery_outbox`
3. Copy API env from Smart-Prop-Manager (not Next.js `NEXT_PUBLIC_*` keys).

---

## 6b. Auth hardening (Dashboard)

**One-pager:** [`auth-dashboard-ops.md`](auth-dashboard-ops.md)

- [ ] Enable **Leaked password protection** (HaveIBeenPwned)  
  [docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)  
  **2026-09-24:** advisor still WARN — not toggleable via SQL/MCP.
- [ ] Phone provider Twilio = prod sender (same SID/From as Render chase SMS)

### Session length (free plan, 2026-09-30)

Supabase refresh tokens never expire on Free, so Nexora enforces its own limits:

| Who | Idle limit | Absolute limit |
|-----|-----------|----------------|
| Landlord / staff | 7 days | 30 days |
| Tenant / artisan | 14 days | 60 days |
| Admin | 12 hours | 24 hours |

- Web middleware (`web/lib/sessionPolicy.ts`) signs out on the next request and
  redirects to `/login?expired=1`. Idle = `nx_seen` cookie; absolute = JWT `amr`
  sign-in time.
- Server backstop: `public.revoke_stale_sessions()` (`sql/040_session_policy.sql`,
  applied 2026-09-30) runs inside the daily `POST /reminders/jobs/due` job
  (`sessions.revoked` in the response). Keep both limits in sync.
- If Nexora moves to Supabase Pro, also set Auth → Sessions inactivity timeout
  and time-box as the hard ceiling.

---

## 7. Smoke after deploy

1. `/health` 200 on https://smart-prop-manager.onrender.com/health  
2. Login → `/properties`  
3. Manual payment → paid ledger + one queued receipt → delivered receipt log
4. `POST /jobs/delivery-outbox` with `CRON_SECRET` → JSON with processed counts  
5. Reminder run → one queued row → one delivered provider message
6. Admin invite lead → signup link opens with invite query params
7. Phase 5: [`phase5-smoke.md`](phase5-smoke.md) — admit notify + tenant repair notify  
