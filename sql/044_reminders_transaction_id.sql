-- 044: Tie receipt and landlord-payment log rows to the payment they belong to.
-- The old "already sent" check matched any notice on the unit sent after paid_at,
-- so two payments close together (rent, then service charge) could swallow the
-- second payment's receipt. Older rows keep transaction_id null and are still
-- matched by the time window in the API.

alter table public.reminders
  add column if not exists transaction_id uuid
  references public.transactions (id) on delete set null;

-- One delivered notice per payment and kind. Failed attempts may repeat.
create unique index if not exists reminders_transaction_kind_done_idx
  on public.reminders (transaction_id, kind)
  where transaction_id is not null and status in ('sent', 'skipped');

create index if not exists reminders_transaction_id_idx
  on public.reminders (transaction_id)
  where transaction_id is not null;
