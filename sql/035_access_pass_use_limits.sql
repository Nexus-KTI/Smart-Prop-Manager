-- Guest pass use budget (display-only until gate Admit exists).
-- Safe to re-run.

alter table public.access_passes
  add column if not exists max_uses int;

alter table public.access_passes
  add column if not exists uses_count int not null default 0;

comment on column public.access_passes.max_uses is
  'Optional entry budget. Tenant-minted guests default to 1 (single entry). Null = unlimited (landlord/resident).';

comment on column public.access_passes.uses_count is
  'Recorded admissions. Increment when gate/caretaker Admit ships; not auto today.';

-- Backfill tenant_self guests to single-entry policy.
update public.access_passes
set max_uses = 1
where source_type = 'tenant_self'
  and subject_type = 'guest'
  and max_uses is null;
