-- Security linter fixes (Supabase advisors).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) ERROR: security_definer_view → SECURITY INVOKER views
-- Postgres 15+ default security_invoker=false acts like DEFINER (owner perms).
-- Phase metrics are read by the service-role API; INVOKER is correct and safer.
-- ---------------------------------------------------------------------------
create or replace view public.phase2_active_landlords
with (security_invoker = true) as
select distinct p.owner_id as landlord_id
from public.properties p
inner join public.units u on u.property_id = p.id
where p.owner_id is not null;

comment on view public.phase2_active_landlords is
  'Owners with at least one unit (Phase 2 exit denominator for metric 1).';

create or replace view public.phase2_occupied_units
with (security_invoker = true) as
select
  u.id as unit_id,
  p.owner_id as landlord_id,
  u.term_end
from public.units u
inner join public.properties p on p.id = u.property_id
where nullif(btrim(coalesce(u.tenant_contact, '')), '') is not null;

comment on view public.phase2_occupied_units is
  'Units with tenant contact set (Phase 2 exit denominator for metric 2).';

create or replace view public.phase3_tenancies_activated
with (security_invoker = true) as
select
  t.id as tenancy_id,
  t.landlord_id,
  t.unit_id,
  t.activated_at,
  t.checklist_id_collected
    and t.checklist_agreement_signed
    and t.checklist_references_checked as required_checklist_complete,
  t.checklist_identity_verified as optional_identity_complete
from public.tenancies t
where t.status = 'active'
  and t.activated_at is not null;

comment on view public.phase3_tenancies_activated is
  'Activated tenancies for Phase 3 exit metric 1 (checklist before active).';

-- ---------------------------------------------------------------------------
-- 2) WARN: rls_policy_always_true on leads INSERT
-- Keep public marketing inserts, but constrain WITH CHECK (not bare true).
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can insert leads" on public.leads;
drop policy if exists "Public can insert marketing leads" on public.leads;
create policy "Public can insert marketing leads"
  on public.leads
  for insert
  to anon, authenticated
  with check (
    length(btrim(name)) >= 2
    and length(btrim(whatsapp)) >= 7
    and (unit_count is null or unit_count > 0)
    and status = 'new'
    and source = any (array['access'::text, 'callback'::text])
  );

-- ---------------------------------------------------------------------------
-- 3) WARN: public_bucket_allows_listing on receipts
-- Public buckets serve objects by URL without a broad SELECT policy.
-- ---------------------------------------------------------------------------
drop policy if exists "receipts_public_read" on storage.objects;

-- ---------------------------------------------------------------------------
-- 4) WARN: authenticated can RPC public.is_admin (SECURITY DEFINER)
-- Keep DEFINER (reads admin_allowlist under RLS), but move out of API schema
-- so /rest/v1/rpc/is_admin is not exposed. Update lead policies to call it.
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_allowlist a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

drop policy if exists "Admins select leads" on public.leads;
drop policy if exists "Admins update leads" on public.leads;
drop policy if exists "leads_select_admin" on public.leads;
drop policy if exists "leads_update_admin" on public.leads;

create policy "Admins select leads"
  on public.leads
  for select
  to authenticated
  using (private.is_admin());

create policy "Admins update leads"
  on public.leads
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop function if exists public.is_admin();

-- Auth WARN auth_leaked_password_protection is a Dashboard toggle (HaveIBeenPwned),
-- not SQL — enable under Authentication → Providers / Attack Protection.
