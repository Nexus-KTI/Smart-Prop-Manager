# Smart Prop — Production ops checklist

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
- `FRONTEND_URL`, `CORS_ORIGINS` (include production web origin)
- `PAYSTACK_SECRET_KEY` (+ web public key on Next)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` (and `TWILIO_WHATSAPP_FROM` only if using WA)
- Mailgun: `EMAIL_SERVICE_PROVIDER=mailgun`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SENDER_EMAIL`, `EMAIL_FROM_NAME=Smart Prop`, `FROM_EMAIL`
- `CRON_SECRET` (HTTP due job) · cron service inherits Mailgun + Twilio from web in `render.yaml`
- `ADMIN_EMAILS`

Web (`web/.env`):

- `NEXT_PUBLIC_API_URL` → API origin  
- `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`  
- `NEXT_PUBLIC_AUTH_OTP_CHANNEL=sms`  
- `NEXT_PUBLIC_INVITE_ONLY_SIGNUP` as intended  

---

## 3. Paystack webhook

- Dashboard URL: `https://<api-host>/payments/webhook/paystack`
- Secret matches `PAYSTACK_SECRET_KEY`
- Confirm a test charge → transaction `paid` + receipt row

---

## 4. Due reminders cron

- Render cron `smart-prop-due-reminders` schedule `0 8 * * *` → `python -m lib.reminder_job`
- Or `POST /reminders/jobs/due` with `Authorization: Bearer $CRON_SECRET`
- After run: `reminders` rows `kind=due` with `sent` or clear `error_detail`

---

## 5. SQL / schema

Repo files under `sql/` (apply in order if rebuilding):

`000` → `001` → `002` → `003` → `004_security` / `004_remove_flutterwave` → `005` → `006` → `007`

Remote (Supabase) already has reminders `kind`, `error_detail`, property `latitude`/`longitude` as of 2026-08-09 spot-check. Prefer MCP/`list_migrations` + column checks over blind re-apply.

---

## 6. Smoke after deploy

1. `/health` 200  
2. Login → `/properties`  
3. Manual payment → landlord email + receipt log  
4. Reminder send with matching contact/channel  
5. Admin invite lead → signup link opens with invite query params  
