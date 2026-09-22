-- Tenant guest invite mode (visit | open) + drop single-entry burn.
-- Safe to re-run.

alter table public.access_passes
  add column if not exists invite_mode text;

comment on column public.access_passes.invite_mode is
  'Tenant guest shape: visit (named one-off window) or open (reusable in window). Null for landlord/resident passes.';

-- Clear prior single-entry policy on tenant-minted guests (in/out at gate).
update public.access_passes
set max_uses = null
where source_type = 'tenant_self'
  and subject_type = 'guest'
  and max_uses = 1;

update public.access_passes
set invite_mode = 'visit'
where source_type = 'tenant_self'
  and subject_type = 'guest'
  and invite_mode is null;
