-- Message kinds for user chat + payment status lines; meta for payment payload.
-- Safe to re-run.

alter table public.messages
  add column if not exists kind text not null default 'user';

alter table public.messages
  add column if not exists meta jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_kind_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_kind_check
      check (kind = any (array['user'::text, 'payment'::text]));
  end if;
end $$;

comment on column public.messages.kind is
  'user = normal chat; payment = system payment status line in chat.';

comment on column public.messages.meta is
  'Optional JSON: payment rows use transaction_id, amount, currency, status, charge_type, receipt_url.';

create index if not exists messages_thread_kind_idx
  on public.messages (thread_id, kind);
