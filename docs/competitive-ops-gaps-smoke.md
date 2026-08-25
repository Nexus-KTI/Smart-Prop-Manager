# Competitive ops gaps — smoke

Pragmatic NG slices from TenantCloud / Rentora inventory (not money-chase-only).
Migration: `sql/017_competitive_ops_gaps.sql` (applied remotely as `017_competitive_ops_gaps`).

## Restart

Restart FastAPI after pulling so new routers mount (`applications`, `expenses`, `publications`, `tasks`).

## Landlord

1. **Applications** — Unit Payments → *Invite to apply* → copy `/apply/{token}` → open as applicant (sign in) → submit → Applications nav → Approve/Reject.
2. **Expenses** — `/expenses` → Add expense → appears in list; month total feeds Reports.
3. **Reports** — `/reports` rent roll: units, tenants, vacant/occupied, month expenses.
4. **Fees** — Unit Payments → Add fee → tenant sees under `/tenant/fees`.
5. **Bulletin** — `/publications` → New post → tenant Notices shows under “From your landlord”.
6. **Tasks / calendar** — `/tasks` → create landlord or tenant task (tenant needs tenancy id) → Upcoming shows term ends + fees.
7. **Tenancies** — `/tenancies` portfolio list → Open dossier.
8. **Docs ack** — Upload on tenancy dossier with “requires acknowledgment” (API `requires_ack`) + optional `expires_on` → tenant Documents → *I acknowledge*.

## Tenant

1. Settings → *Invite your landlord* (email).
2. Notices → landlord publications + unread.
3. Requests → category / preferred time / photo URL.
4. Fees + Tasks nav.

## Still skipped / deferred (by design)

US rent reporting, Assurant, bureau screening, US syndication, Thumbtack marketplace, in-app chat, native app stores, hard paywall, NIN/BVN live verify, bank feed, IoT.
