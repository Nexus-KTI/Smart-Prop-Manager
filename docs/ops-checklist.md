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

**Fix (required):** Supabase Dashboard → **Authentication → Providers → Phone** → set Account SID, Auth Token, and Message Service / From to the **new** Twilio values (`ACf7c4…`, token, `+15155172581`). Save, then retry login.

**Also:** on a Trial account, the login phone must be under Twilio **Verified Caller IDs** (already true on the new account for `+2348139608051`).

App UX: `GET /notify/sms-delivery` flags “no SMS on API Twilio in last 5 minutes” when Supabase still points at a different Twilio account.

---

## 2. Environment (API / Render web)

Required:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL=https://smart-prop-web.vercel.app`
- `CORS_ORIGINS=https://smart-prop-web.vercel.app,http://localhost:3000,http://127.0.0.1:3000` (include production web origin)
- `PAYSTACK_SECRET_KEY` (+ web public key on Next)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` (and `TWILIO_WHATSAPP_FROM` only if using WA)
- Mailgun: `EMAIL_SERVICE_PROVIDER=mailgun`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SENDER_EMAIL`, `EMAIL_FROM_NAME=Nexora`, `FROM_EMAIL`
- `CRON_SECRET` (HTTP due job) · cron service inherits Mailgun + Twilio from web in `render.yaml`
- `ADMIN_EMAILS`

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

---

## 4. Due reminders cron

- Render cron `smart-prop-due-reminders` schedule `0 8 * * *` → `python -m lib.reminder_job`
- Or `POST /reminders/jobs/due` with `Authorization: Bearer $CRON_SECRET`
- After run: due/renewal messages are queued; the delivery cron writes
  `reminders` rows with `sent` or a clear terminal `error_detail`.

---

## 5. Delivery outbox and rate-limit cleanup

- Render cron `smart-prop-delivery-outbox` runs every five minutes with
  `python -m scripts.delivery_outbox`.
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

---

## 6. SQL / schema

Repo files under `sql/` (apply in order if rebuilding):

`000` → … → `031` → `032_resilience_payments_outbox_limits` →
`033_reminders_queued_status` → `034`…`037` access passes/events →
`038_signup_attribution`

Remote (Supabase): `032` and `033` DDL are live and recorded as verify-only
migration stamps (`20260917172210` / `20260917172220`). Do **not** re-apply the
full financial sections of `032`. Prefer MCP/`list_migrations` + column checks
over blind re-apply. `038_signup_attribution` applied 2026-09-24.

`delivery_outbox` and `rate_limit_buckets` intentionally use RLS with no
client policies (service-role RPCs only), matching `product_events`.
Same pattern: `access_pass_events` (API/service-role reads only).

Interactive chase can log `queued` reminder rows while the outbox worker
delivers. Ensure Render cron `smart-prop-delivery-outbox` is created from
`render.yaml` (`*/5 * * * *`) — it is defined in-repo but may not yet be live
in every Render workspace.

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

1. Name: `smart-prop-delivery-outbox`
2. Schedule: `*/5 * * * *` · Docker command: `python -m scripts.delivery_outbox`
3. Copy API env from Smart-Prop-Manager (not Next.js `NEXT_PUBLIC_*` keys).

---

## 6b. Auth hardening (Dashboard)

- Enable **Leaked password protection** (HaveIBeenPwned):  
  [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)  
  Advisor WARN until on. Not toggleable via SQL/MCP — Auth settings only.

---

## 7. Smoke after deploy

1. `/health` 200 on https://smart-prop-manager.onrender.com/health  
2. Login → `/properties`  
3. Manual payment → paid ledger + one queued receipt → delivered receipt log
4. `POST /jobs/delivery-outbox` with `CRON_SECRET` → JSON with processed counts  
5. Reminder run → one queued row → one delivered provider message
6. Admin invite lead → signup link opens with invite query params
7. Phase 5: [`phase5-smoke.md`](phase5-smoke.md) — admit notify + tenant repair notify  
