-- 048: outbox defer (no attempt burned) and one reminder log row per delivery.

-- A throttled or circuit-open delivery goes back to retry without counting
-- as an attempt, so a provider outage cannot dead-letter the queue.
create or replace function public.defer_delivery_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_retry_at timestamptz,
  p_reason text default null
)
returns boolean
language sql
set search_path = public
as $$
  with changed as (
    update public.delivery_outbox
    set status = 'retry',
        attempt_count = greatest(attempt_count - 1, 0),
        next_attempt_at = p_retry_at,
        lease_token = null,
        lease_expires_at = null,
        last_error = coalesce(left(p_reason, 1000), last_error),
        updated_at = now()
    where id = p_id
      and status = 'processing'
      and lease_token = p_lease_token
    returning 1
  )
  select exists(select 1 from changed);
$$;

revoke all on function public.defer_delivery_outbox(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.defer_delivery_outbox(uuid, uuid, timestamptz, text)
  to service_role;

-- A delivery that is re-claimed after a lease expiry logs its reminder once.
alter table public.reminders
  add column if not exists outbox_id uuid
  references public.delivery_outbox(id) on delete set null;

create unique index if not exists reminders_outbox_id_key
  on public.reminders (outbox_id);
