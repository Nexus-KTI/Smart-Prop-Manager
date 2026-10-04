-- 045: Unread message-thread count in one query.
-- The API used to page through every thread and run one read-marker lookup per
-- thread (up to ~2000 round-trips for the rail badge). Security invoker, so the
-- caller's RLS on message_threads / message_thread_reads still applies.

create or replace function public.unread_thread_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.message_threads t
  left join public.message_thread_reads r
    on r.thread_id = t.id
   and r.user_id = (select auth.uid())
  where (t.landlord_id = (select auth.uid()) or t.tenant_user_id = (select auth.uid()))
    and t.last_message_at is not null
    and (r.last_read_at is null or r.last_read_at < t.last_message_at);
$$;

revoke all on function public.unread_thread_count() from public, anon;
grant execute on function public.unread_thread_count() to authenticated;
