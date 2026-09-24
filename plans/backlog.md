# Backlog

## Now

1. **Supabase leaked-password** — Auth → Password security → enable HaveIBeenPwned  
   ([docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).  
   See [`docs/ops-checklist.md`](../docs/ops-checklist.md) §6b.
2. **Headed proof** — walk [`docs/phase5-smoke.md`](../docs/phase5-smoke.md) then  
   [`docs/landlord-ada-loop-smoke.md`](../docs/landlord-ada-loop-smoke.md) signed in  
   (or Chrome `--remote-debugging-port=9222`). Fix only on FAIL.
3. **Twilio alignment** — Supabase Auth → Phone provider = prod Twilio (not trial /  
   not a stale SID). Verify NG OTP + chase SMS. [`docs/ops-checklist.md`](../docs/ops-checklist.md) §1.

## Next (money trust only)

4. Chase / receipt / outbox edge cases **only if headed smoke FAIL**.
5. Stay on rent-and-chase beachhead — no Estate OS invents.

## Product gate (do not build)

6. **HOLD — applications / landlord listing page**  
   Lagos-fit discussion lives in [`docs/gap-analysis.md`](../docs/gap-analysis.md).  
   **Default: no build** until an explicit product/CCO yes.  
   Not implied by gap-analysis or TenantCloud research.

## Deferred / waived

- Native Render `smart-prop-delivery-outbox` Cron Job — **waived** (no card).  
  Replacement: GH Actions + `POST /jobs/delivery-outbox` (**done**).
- Production Twilio account upgrade — part of Now #3 if still on trial.

## Closed recently

- Outbox drain via GH Actions + HTTP cron endpoint  
- Gate admit notify; tenant repair → landlord notify; origin labels  
- Email kit (details/alert + invites/jobs/tasks/gate)  
- Signup attribution `038`; gate role visibility  
- Residual resilience waves 1–5
