-- Follow-up hardening after 003 (SECURITY DEFINER grants + duplicate lead insert policy).

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "leads_insert_public" on public.leads;
