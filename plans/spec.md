# Current initiative — Paystack keys, cards, autopay cron

**Updated:** 2026-09-26  
**Owner:** Engineering + you (headed popup)  
**Status:** keys + due/autopay GH Action shipped; headed Paystack UI still yours

## Goal

Public key on the web, secret on the API. Tenants save a card in Settings and
enable Autopay so rent can charge on due day without chase.

## Acceptance

- [x] `PAYSTACK_SECRET_KEY` (API) verified against Paystack test API
- [x] `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` in `web/.env` / `.env.local`
- [x] Root `PAYSTACK_PUBLIC_KEY` documented unused in `.env.example`
- [x] GitHub Actions `reminders-due` POSTs `/reminders/jobs/due` daily
- [x] Pytest rejects bad save-card confirm payloads
- [ ] Headed: Pay rent + Settings → Cards + Home Autopay  
      ([`docs/tenant-money-loop-smoke.md`](../docs/tenant-money-loop-smoke.md))

## Monetization (unchanged)

Free cash/transfer recording. Growth later. No rent take-rate.

## Guardrails

Do not put the secret in `NEXT_PUBLIC_*`. Do not build a second card vault.
