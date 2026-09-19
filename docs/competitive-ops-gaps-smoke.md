# Competitive ops gaps — smoke

Pragmatic NG slices from TenantCloud / Rentora inventory (not money-chase-only).
Migration: `sql/017_competitive_ops_gaps.sql` (applied remotely as `017_competitive_ops_gaps`).

## Restart

Restart FastAPI after pulling so new routers mount (`applications`, `expenses`, `publications`, `tasks`).

## Landlord

1. **Applications** — Unit Payments → *Invite to apply* → copy `/apply/{token}` → open as applicant (sign in) → submit → Applications nav → Approve/Reject.
2. **Expenses** — `/expenses` → empty **Add expense** if none; Add expense → appears; month total on Reports links back.
3. **Reports** — `/reports` rent roll: units, vacant/occupied badges, Payments + Tenancy/Start tenancy actions, month expenses → `/expenses`.
4. **Fees** — Unit Payments → Add fee → tenant sees under `/tenant/fees`.
5. **Bulletin** — `/publications` → New post → tenant Notices shows under “From your landlord”.
6. **Tasks / calendar** — `/tasks` → create landlord or tenant task (tenant needs tenancy id) → Upcoming shows term ends + fees.
7. **Tenancies** — `/tenancies` All / Active / Ending soon → Open dossier / Payments; empty → Find vacant units.
8. **Docs ack (awaiting legal approval)** — Confirm landlord and tenant see
   honest disabled states. Do not enable upload or run a document flow in
   production; use the staged gate in
   [`tenancy-docs-launch-gate.md`](tenancy-docs-launch-gate.md).

Ada money/chase loop detail: [`landlord-ada-loop-smoke.md`](landlord-ada-loop-smoke.md).

## Tenant

1. Settings → *Invite your landlord* (email).
2. Notices → landlord publications + unread.
3. Requests → category / preferred time / photo URL.
4. Fees + Tasks nav.

## Still skipped / deferred (by design)

US rent reporting, Assurant, bureau screening, US syndication, Thumbtack marketplace, in-app chat, native app stores, hard paywall, NIN/BVN live verify, bank feed, IoT.
