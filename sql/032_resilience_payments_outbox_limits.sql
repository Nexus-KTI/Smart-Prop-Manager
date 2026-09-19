-- Resilience primitives: payment idempotency, durable delivery, and shared limits.
-- Service-role only. Safe to re-run after duplicate payment references are reconciled.

alter table public.transactions
  add column if not exists idempotency_key text;

alter table public.transactions
  add column if not exists processing_lease_token uuid;

alter table public.transactions
  add column if not exists processing_lease_expires_at timestamptz;

alter table public.transactions
  add column if not exists payment_attempt_count integer not null default 0;

do $$
begin
  if exists (
    select 1
    from public.transactions
    where method = 'paystack'
      and payment_reference is not null
      and btrim(payment_reference) <> ''
    group by payment_reference
    having count(*) > 1
  ) then
    raise exception
      'Duplicate Paystack payment references must be reconciled before 032';
  end if;

  if exists (
    select 1
    from public.transactions
    where idempotency_key is not null
    group by idempotency_key
    having count(*) > 1
  ) then
    raise exception
      'Duplicate transactions.idempotency_key values must be reconciled before 032';
  end if;
  if exists (
    select 1 from public.transactions where amount <= 0
  ) then
    raise exception 'Non-positive transaction amounts must be reconciled before 032';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_idempotency_key_unique'
  ) then
    alter table public.transactions
      add constraint transactions_idempotency_key_unique
      unique (idempotency_key);
  end if;
end;
$$;

alter table public.transactions
  drop constraint if exists transactions_payment_reference_unique;

create unique index if not exists transactions_paystack_reference_unique_idx
  on public.transactions (payment_reference)
  where method = 'paystack'
    and payment_reference is not null
    and btrim(payment_reference) <> '';

alter table public.transactions
  drop constraint if exists transactions_payment_attempt_count_check;

alter table public.transactions
  add constraint transactions_payment_attempt_count_check
  check (payment_attempt_count >= 0);

alter table public.transactions
  drop constraint if exists transactions_amount_positive_check;
alter table public.transactions
  add constraint transactions_amount_positive_check check (amount > 0);

alter table public.transactions
  drop constraint if exists transactions_idempotency_key_length_check;
alter table public.transactions
  add constraint transactions_idempotency_key_length_check
  check (
    idempotency_key is null
    or length(idempotency_key) between 8 and 240
  );

comment on column public.transactions.idempotency_key is
  'Stable operation key. Autopay uses autopay:<tenancy_id>:<due_date>.';

create or replace function public.claim_autopay_transaction(
  p_idempotency_key text,
  p_unit_id uuid,
  p_amount numeric,
  p_tenant_user_id uuid,
  p_payment_reference text,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed_row public.transactions%rowtype;
  lease_token uuid := extensions.uuid_generate_v4();
  claimed boolean := false;
begin
  if length(coalesce(p_idempotency_key, '')) < 8
     or length(coalesce(p_payment_reference, '')) < 8
     or p_amount <= 0
     or p_lease_seconds < 30
     or p_lease_seconds > 1800 then
    raise exception 'Invalid autopay claim';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select *
  into claimed_row
  from public.transactions
  where idempotency_key = p_idempotency_key
  for update;

  if not found then
    insert into public.transactions (
      unit_id,
      amount,
      method,
      status,
      charge_type,
      initiated_by,
      initiator_user_id,
      payment_reference,
      idempotency_key,
      processing_lease_token,
      processing_lease_expires_at,
      payment_attempt_count
    )
    values (
      p_unit_id,
      p_amount,
      'paystack',
      'pending',
      'rent',
      'tenant',
      p_tenant_user_id,
      p_payment_reference,
      p_idempotency_key,
      lease_token,
      now() + make_interval(secs => p_lease_seconds),
      1
    )
    returning * into claimed_row;
    claimed := true;
  elsif claimed_row.unit_id <> p_unit_id
    or claimed_row.amount <> p_amount
    or claimed_row.initiator_user_id is distinct from p_tenant_user_id
    or claimed_row.payment_reference is distinct from p_payment_reference then
    raise exception 'Idempotency key reused with different payment inputs';
  elsif claimed_row.status <> 'paid'
    and (
      claimed_row.processing_lease_expires_at is null
      or claimed_row.processing_lease_expires_at <= now()
    ) then
    update public.transactions
    set processing_lease_token = lease_token,
        processing_lease_expires_at =
          now() + make_interval(secs => p_lease_seconds),
        payment_attempt_count = payment_attempt_count + 1
    where id = claimed_row.id
    returning * into claimed_row;
    claimed := true;
  end if;

  return jsonb_build_object(
    'claimed', claimed,
    'lease_token', case when claimed then lease_token else null end,
    'transaction', to_jsonb(claimed_row)
  );
end;
$$;

revoke all on function public.claim_autopay_transaction(
  text, uuid, numeric, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.claim_autopay_transaction(
  text, uuid, numeric, uuid, text, integer
) to service_role;

create table if not exists public.delivery_outbox (
  id uuid primary key default extensions.uuid_generate_v4(),
  idempotency_key text not null unique
    check (length(idempotency_key) between 8 and 180),
  event_name text not null check (length(event_name) between 1 and 80),
  channel text check (
    channel is null
    or channel = any (array['whatsapp'::text, 'sms'::text, 'email'::text])
  ),
  contact text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or status <> 'processing'
  )
);

alter table public.delivery_outbox enable row level security;

revoke all on table public.delivery_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.delivery_outbox
  to service_role;

create index if not exists delivery_outbox_ready_idx
  on public.delivery_outbox (next_attempt_at, created_at)
  where status in ('pending', 'retry');

create index if not exists delivery_outbox_lease_idx
  on public.delivery_outbox (lease_expires_at)
  where status = 'processing';

create schema if not exists nexora_private;
revoke all on schema nexora_private from public, anon, authenticated;

create or replace function nexora_private.queue_paid_transaction_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    insert into public.delivery_outbox (
      idempotency_key,
      event_name,
      payload,
      max_attempts
    )
    values (
      'payment-receipt:' || new.id::text,
      'payment_receipt',
      jsonb_build_object('transaction_id', new.id),
      8
    )
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function nexora_private.queue_paid_transaction_receipt()
  from public, anon, authenticated;

drop trigger if exists transactions_queue_paid_receipt
  on public.transactions;
create trigger transactions_queue_paid_receipt
after insert or update of status on public.transactions
for each row execute function nexora_private.queue_paid_transaction_receipt();

create or replace function public.enqueue_delivery(
  p_idempotency_key text,
  p_event_name text,
  p_channel text,
  p_contact text,
  p_payload jsonb,
  p_max_attempts integer default 5
)
returns public.delivery_outbox
language plpgsql
security invoker
set search_path = public
as $$
declare
  delivery public.delivery_outbox%rowtype;
begin
  insert into public.delivery_outbox (
    idempotency_key,
    event_name,
    channel,
    contact,
    payload,
    max_attempts
  )
  values (
    p_idempotency_key,
    p_event_name,
    p_channel,
    p_contact,
    coalesce(p_payload, '{}'::jsonb),
    p_max_attempts
  )
  on conflict (idempotency_key) do nothing
  returning * into delivery;

  if not found then
    select *
    into delivery
    from public.delivery_outbox
    where idempotency_key = p_idempotency_key;
  end if;

  return delivery;
end;
$$;

create or replace function public.claim_delivery_outbox(
  p_batch_size integer default 25,
  p_lease_seconds integer default 120
)
returns setof public.delivery_outbox
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_batch_size < 1 or p_batch_size > 100
     or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'Invalid outbox claim bounds';
  end if;

  return query
  with candidates as (
    select id
    from public.delivery_outbox
    where (
      status in ('pending', 'retry')
      and next_attempt_at <= now()
    ) or (
      status = 'processing'
      and lease_expires_at <= now()
    )
    order by next_attempt_at, created_at
    for update skip locked
    limit p_batch_size
  )
  update public.delivery_outbox outbox
  set status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      lease_token = extensions.uuid_generate_v4(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.complete_delivery_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_provider_message_id text default null
)
returns boolean
language sql
security invoker
set search_path = public
as $$
  with changed as (
    update public.delivery_outbox
    set status = 'sent',
        provider_message_id = p_provider_message_id,
        lease_token = null,
        lease_expires_at = null,
        last_error = null,
        completed_at = now(),
        updated_at = now()
    where id = p_id
      and status = 'processing'
      and lease_token = p_lease_token
    returning 1
  )
  select exists(select 1 from changed);
$$;

create or replace function public.fail_delivery_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_error text,
  p_retry_at timestamptz,
  p_permanent boolean default false
)
returns boolean
language sql
security invoker
set search_path = public
as $$
  with changed as (
    update public.delivery_outbox
    set status = case
          when p_permanent or attempt_count >= max_attempts then 'dead'
          else 'retry'
        end,
        next_attempt_at = case
          when p_permanent or attempt_count >= max_attempts
            then next_attempt_at
          else p_retry_at
        end,
        lease_token = null,
        lease_expires_at = null,
        last_error = left(coalesce(p_error, 'delivery_failed'), 1000),
        completed_at = case
          when p_permanent or attempt_count >= max_attempts then now()
          else null
        end,
        updated_at = now()
    where id = p_id
      and status = 'processing'
      and lease_token = p_lease_token
    returning 1
  )
  select exists(select 1 from changed);
$$;

revoke all on function public.enqueue_delivery(
  text, text, text, text, jsonb, integer
) from public, anon, authenticated;
revoke all on function public.claim_delivery_outbox(integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_delivery_outbox(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_delivery_outbox(
  uuid, uuid, text, timestamptz, boolean
) from public, anon, authenticated;

grant execute on function public.enqueue_delivery(
  text, text, text, text, jsonb, integer
) to service_role;
grant execute on function public.claim_delivery_outbox(integer, integer)
  to service_role;
grant execute on function public.complete_delivery_outbox(uuid, uuid, text)
  to service_role;
grant execute on function public.fail_delivery_outbox(
  uuid, uuid, text, timestamptz, boolean
) to service_role;

create table if not exists public.rate_limit_buckets (
  key_hash text primary key check (length(key_hash) = 64),
  hit_count integer not null default 0 check (hit_count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets
  to service_role;
create index if not exists rate_limit_buckets_reset_idx
  on public.rate_limit_buckets (reset_at);

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  bucket public.rate_limit_buckets%rowtype;
begin
  if length(coalesce(p_key_hash, '')) <> 64
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit bounds';
  end if;

  insert into public.rate_limit_buckets (
    key_hash, hit_count, reset_at, updated_at
  )
  values (
    p_key_hash, 1, now() + make_interval(secs => p_window_seconds), now()
  )
  on conflict (key_hash) do update
  set hit_count = case
        when public.rate_limit_buckets.reset_at <= now() then 1
        else public.rate_limit_buckets.hit_count + 1
      end,
      reset_at = case
        when public.rate_limit_buckets.reset_at <= now()
          then now() + make_interval(secs => p_window_seconds)
        else public.rate_limit_buckets.reset_at
      end,
      updated_at = now()
  returning * into bucket;

  return jsonb_build_object(
    'allowed', bucket.hit_count <= p_limit,
    'remaining', greatest(p_limit - bucket.hit_count, 0),
    'reset_at', bucket.reset_at
  );
end;
$$;

create or replace function public.purge_rate_limit_buckets()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.rate_limit_buckets
  where reset_at < now() - interval '1 day';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.purge_rate_limit_buckets()
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;
grant execute on function public.purge_rate_limit_buckets()
  to service_role;
