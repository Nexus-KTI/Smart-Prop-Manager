# Smart Prop Manager

Lagos-focused property management for landlords: portfolio, rent tracking, Paystack/manual payments, receipts, and reminders (SMS / WhatsApp / email).

## Stack

- **API:** FastAPI (`main.py`) + Supabase (Auth, Postgres RLS, Storage)
- **Web:** Next.js App Router in `web/`
- **Jobs:** `lib/reminder_job.py` (Africa/Lagos due-day reminders)

## Local development

1. Copy `.env.example` → `.env` and `web/.env.example` → `web/.env.local`.
2. API: `uvicorn main:app --reload --port 8000`
3. Web: `cd web && npm install && npm run dev`

## Notifications & phone OTP (Twilio)

Default channel for new landlords is **SMS** (WhatsApp sandbox is not reliable for Nigeria).

1. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_SMS_FROM` (or Messaging Service SID).
2. Enable Nigeria in Twilio Geo Permissions; upgrade off Trial to message unverified numbers.
3. In Supabase → Auth → Providers → Phone: enable Twilio with the same credentials; set OTP expiry ≥ 5 minutes.
4. Web: `NEXT_PUBLIC_AUTH_OTP_CHANNEL=sms` (default). Use `whatsapp` only with a production WhatsApp sender.
5. Optional: `TWILIO_WHATSAPP_FROM` for WhatsApp reminders after you leave the sandbox.

## Auth redirect URLs

Allow in Supabase Auth URL configuration:

- `http://localhost:3000/auth/callback`
- `https://<your-web-host>/auth/callback`

Forgot-password emails redirect through `/auth/callback` → `/auth/reset-password`.

## Production checklist

1. Host API (Render Docker via `Dockerfile` / `render.yaml`) and Next.js (Vercel or similar).
2. Set `FRONTEND_URL` / `CORS_ORIGINS` on the API to your web origin.
3. Set `NEXT_PUBLIC_API_URL` on the web app to the API URL.
4. Register Paystack webhook → `https://<api>/payments/webhook/paystack`.
5. Schedule due reminders:
   - Render cron service in `render.yaml` (`python -m lib.reminder_job` daily 08:00 UTC ≈ 09:00 WAT), or
   - HTTP cron → `POST /reminders/jobs/due` with `X-Cron-Secret: $CRON_SECRET`.
6. Keep `SUPABASE_SERVICE_ROLE_KEY`, Twilio, and SMTP secrets on API/cron only.
7. Apply SQL under `sql/` in order (`000` → `004`) in the Supabase SQL Editor.
8. Optional observability: set `SENTRY_DSN` (API) and `NEXT_PUBLIC_SENTRY_DSN` (web).
9. Closed beta is invite-only by default (`NEXT_PUBLIC_INVITE_ONLY_SIGNUP=true` in `web/.env.example`): `/signup` requires `?invite=…` from an admin invite.

## Smoke test

With API running and env loaded:

```bash
python scripts/smoke_e2e.py
```

Twilio SMS readiness (credentials + optional test send):

```bash
python scripts/check_twilio.py
python scripts/check_twilio.py --to +2347XXXXXXXXX
```

CI always runs API import + `tests/` (frequency due-day unit tests). It also runs `smoke_e2e.py` when secrets `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_ANON_KEY`, `SMOKE_API_URL`, `SMOKE_EMAIL`, and `SMOKE_PASSWORD` are configured.

## Observability

- API: set `SENTRY_DSN` (and optional `SENTRY_TRACES_SAMPLE_RATE`, default `0.1`).
- Web: set `NEXT_PUBLIC_SENTRY_DSN` in the Next.js env.
- Leave both unset locally if you do not want events sent.

## Admin access

Admins are the union of:

- `ADMIN_EMAILS` (comma-separated), and
- rows in `public.admin_allowlist`

Invite from `/admin/leads` sends the signup link via SMS (WhatsApp fallback) and returns the URL.
