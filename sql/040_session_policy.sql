-- Session length policy backstop (free plan: no Supabase inactivity/time-box).
-- Middleware (web/lib/sessionPolicy.ts) enforces the same limits per request;
-- this revokes sessions server-side so a copied refresh token also dies.
-- Deleting auth.sessions cascades to auth.refresh_tokens and mfa_amr_claims.
--
-- Policy (idle / absolute):
--   admin (admin_allowlist)   12 hours / 24 hours
--   tenant, artisan           14 days  / 60 days
--   landlord (incl. staff)     7 days  / 30 days

create or replace function public.revoke_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked integer;
begin
  with classified as (
    select
      s.id,
      s.created_at,
      coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at)
        as last_active,
      case
        when exists (
          select 1
          from public.admin_allowlist a
          where lower(a.email) = lower(u.email)
        ) then 'admin'
        when p.role in ('tenant', 'artisan') then 'tenant'
        else 'landlord'
      end as kind
    from auth.sessions s
    join auth.users u on u.id = s.user_id
    left join public.profiles p on p.id = s.user_id
  ),
  limits as (
    select
      c.id,
      c.created_at,
      c.last_active,
      case c.kind
        when 'admin' then interval '12 hours'
        when 'tenant' then interval '14 days'
        else interval '7 days'
      end as idle_limit,
      case c.kind
        when 'admin' then interval '24 hours'
        when 'tenant' then interval '60 days'
        else interval '30 days'
      end as max_limit
    from classified c
  ),
  deleted as (
    delete from auth.sessions s
    using limits l
    where s.id = l.id
      and (
        now() - l.last_active > l.idle_limit
        or now() - l.created_at > l.max_limit
      )
    returning s.id
  )
  select count(*) into revoked from deleted;

  return revoked;
end;
$$;

revoke all on function public.revoke_stale_sessions() from public, anon, authenticated;
grant execute on function public.revoke_stale_sessions() to service_role;
