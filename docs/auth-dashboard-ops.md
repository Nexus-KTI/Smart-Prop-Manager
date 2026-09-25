# Auth Dashboard ops (agent cannot toggle)

**Updated:** 2026-09-24  
**Why this file:** Supabase Auth settings are not writable via project MCP/SQL.
Do these two clicks in the **Nexora** Supabase project Dashboard.

---

## 1. Leaked password protection (HaveIBeenPwned)

**Status 2026-09-25:** User reported enabled. Re-check advisor; if WARN remains,
confirm the **Nexora** project (not another Supabase project) and hard-refresh
Dashboard. Agent cannot toggle Auth via MCP.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → Nexora project.  
2. **Authentication** → **Providers** → **Email** (or **Settings** → password security, depending on Dashboard version).  
3. Enable **Leaked password protection** (checks HaveIBeenPwned).  
4. Save.  
5. Confirm: advisors no longer show the WARN — or retry signup with a known-pwned password and expect rejection.

Docs: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## 2. Phone OTP Twilio alignment

**Status:** App chase SMS uses API `.env` / Render Twilio. **Login OTP** uses
**Supabase → Authentication → Providers → Phone → Twilio** — a different
config surface. Mismatch = “enter code” UI with no SMS.

1. Dashboard → **Authentication** → **Providers** → **Phone**.  
2. Set Account SID, Auth Token, and From / Messaging Service to the **same
   production** Twilio account used for chase (see Render Smart-Prop-Manager
   `TWILIO_*`, not a stale trial SID).  
3. Save.  
4. If Twilio is still Trial: add the test NG number under **Verified Caller IDs**.  
5. Proof: request login OTP → SMS arrives within ~30s; optional
   `GET /notify/sms-delivery` on the API for chase-path diagnostics.

Related: [`ops-checklist.md`](ops-checklist.md) §1.

---

## After both

Tick the matching boxes in [`ops-checklist.md`](ops-checklist.md) §1 / §6b and
clear the Now items in [`plans/backlog.md`](../plans/backlog.md).
