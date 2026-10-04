-- 052: Data retention. One batched delete per table per call so each call is a short
-- transaction; lib/retention.py calls it until a round deletes less than a full batch.
-- Windows are passed in from lib/retention.py (outbox 30 days, product events 180 days,
-- reminder log 18 months). Outbox keys are day/cycle/request scoped, so dropping a
-- finished row after 30 days cannot re-open a live idempotency key.

create index if not exists delivery_outbox_finished_idx
  on public.delivery_outbox (updated_at)
  where status in ('sent', 'dead');

create index if not exists product_events_created_idx
  on public.product_events (created_at);

create index if not exists reminders_sent_at_idx
  on public.reminders (sent_at);

create or replace function public.purge_expired_records(
  p_outbox_days int,
  p_event_days int,
  p_reminder_months int,
  p_batch int default 5000
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_outbox int;
  v_events int;
  v_reminders int;
begin
  if p_outbox_days < 1 or p_event_days < 1 or p_reminder_months < 1 or p_batch < 1 then
    raise exception 'retention bounds must be positive' using errcode = '22023';
  end if;

  delete from delivery_outbox
  where id in (
    select id from delivery_outbox
    where status in ('sent', 'dead')
      and updated_at < now() - make_interval(days => p_outbox_days)
    limit p_batch
  );
  get diagnostics v_outbox = row_count;

  delete from product_events
  where id in (
    select id from product_events
    where created_at < now() - make_interval(days => p_event_days)
    limit p_batch
  );
  get diagnostics v_events = row_count;

  delete from reminders
  where id in (
    select id from reminders
    where sent_at < now() - make_interval(months => p_reminder_months)
    limit p_batch
  );
  get diagnostics v_reminders = row_count;

  return jsonb_build_object(
    'outbox', v_outbox,
    'product_events', v_events,
    'reminders', v_reminders
  );
end;
$$;

revoke all on function public.purge_expired_records(int, int, int, int) from public, anon, authenticated;
grant execute on function public.purge_expired_records(int, int, int, int) to service_role;
