-- 054: Retention for the Paystack event ledger (053). lib/retention.py calls this
-- alongside purge_expired_records with a 12-month window. Paystack stops retrying a
-- webhook after 72 hours, so dropping a year-old row cannot let a replay re-apply.
-- Separate from purge_expired_records so either side can deploy first.

create or replace function public.purge_paystack_events(
  p_months int,
  p_batch int default 5000
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_deleted int;
begin
  if p_months < 1 or p_batch < 1 then
    raise exception 'retention bounds must be positive' using errcode = '22023';
  end if;

  delete from paystack_events
  where id in (
    select id from paystack_events
    where received_at < now() - make_interval(months => p_months)
    limit p_batch
  );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_paystack_events(int, int) from public, anon, authenticated;
grant execute on function public.purge_paystack_events(int, int) to service_role;
