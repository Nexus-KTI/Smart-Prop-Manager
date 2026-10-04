-- 053: Paystack webhook event ledger + refund/dispute marks on transactions.
-- event_key is the SHA-256 of the signed raw body: Paystack retries and dashboard
-- resends carry the same body, so a replay is recognised and acknowledged without
-- re-running ledger work. Only the event name, reference, and outcome are kept
-- (the payload carries customer email and card details).

create table if not exists public.paystack_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) = 64),
  event text not null,
  reference text,
  transaction_id uuid references public.transactions (id) on delete set null,
  outcome text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.paystack_events enable row level security;
revoke all on table public.paystack_events from public, anon, authenticated;
grant select, insert, update, delete on table public.paystack_events to service_role;

create index if not exists paystack_events_transaction_id_idx
  on public.paystack_events (transaction_id);
create index if not exists paystack_events_received_idx
  on public.paystack_events (received_at);

-- Refunds and disputes are recorded for review; the rent status is not changed.
alter table public.transactions
  add column if not exists refunded_amount numeric check (refunded_amount is null or refunded_amount >= 0),
  add column if not exists refunded_at timestamptz,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_status text;
