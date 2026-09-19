# Auth hardening smoke (procedural) — 2026-09-06

Follows H1–H4 ship after [auth-brute-force-review](../).

## Config align
- [x] API `INVITE_ONLY_SIGNUP=1`
- [x] Web `NEXT_PUBLIC_INVITE_ONLY_SIGNUP=true` (was `false` — mismatched)
- [x] `NOTIFY_DIAG_SECRET` set on both (tickets fall back to this if `SIGNUP_TICKET_SECRET` unset)
- [ ] Supabase Dashboard: disable public signups when staying closed-beta (manual)

## Automated
```bash
pytest tests/test_invite_bind.py tests/test_auth_aal_rate_limit.py tests/test_signup_ticket.py \
  tests/test_unit_status_aggregate.py tests/test_portfolio_money_in.py \
  tests/test_bulk_reminders_mismatch.py tests/test_dashboard_empty_property.py -q
```
**2026-09-06:** **24 passed**

## Static code gate
- [x] SMS diag proxy admin-only (`web/app/api/notify/sms-delivery/route.ts`)
- [x] Phone OTP does not call `checkSmsDelivery`
- [x] Invite bind: verified email/phone only; empty contact → 403
- [x] MFA lookup fail-closed (`mfa-status-unavailable`)
- [x] Signup ticket issue/verify + profile gate when invite-only

## Headed (partial — 2026-09-06)
- [x] Fixed `web/lib/mfa.ts` (Python docstring broke login/signup compile; AAL errors now throw)
- [x] `/signup` without invite → invite-only gate copy (http://localhost:3003)
- [x] `/login` → 200
- [x] Unauth `/api/notify/sms-delivery` → redirected to login by middleware (not a public Twilio oracle)
- [ ] Valid `?invite=` ticket path + claim bind mismatch (needs real lead / session)
- [ ] Existing landlord Ada Friday path (needs landlord session)

## Next
Headed Ada: sign in as landlord → `docs/landlord-ada-loop-smoke.md` §Headed
