-- Thin maintenance requests: tenant intake → landlord triage.
-- Precursor to Phase 5 artisan work orders (same unit spine).
-- Safe to re-run.

create table if not exists public.maintenance_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  unit_id uuid not null references public.units (id) on delete cascade,
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  landlord_id uuid not null references auth.users (id) on delete cascade,
  tenant_user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  details text,
  priority text not null default 'normal'
    check (priority = any (array[
      'low'::text,
      'normal'::text,
      'high'::text,
      'urgent'::text
    ])),
  status text not null default 'new'
    check (status = any (array[
      'new'::text,
      'in_progress'::text,
      'resolved'::text,
      'canceled'::text
    ])),
  allow_entry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_requests_unit_id_idx
  on public.maintenance_requests (unit_id);
create index if not exists maintenance_requests_landlord_id_idx
  on public.maintenance_requests (landlord_id);
create index if not exists maintenance_requests_tenant_user_id_idx
  on public.maintenance_requests (tenant_user_id);
create index if not exists maintenance_requests_tenancy_id_idx
  on public.maintenance_requests (tenancy_id);
create index if not exists maintenance_requests_status_idx
  on public.maintenance_requests (status);

comment on table public.maintenance_requests is
  'Tenant-submitted repair requests; landlord triages status. Artisan assign is Phase 5.';

alter table public.maintenance_requests enable row level security;

drop policy if exists maintenance_requests_landlord_all on public.maintenance_requests;
create policy maintenance_requests_landlord_all
  on public.maintenance_requests
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists maintenance_requests_tenant_select on public.maintenance_requests;
create policy maintenance_requests_tenant_select
  on public.maintenance_requests
  for select
  using (auth.uid() = tenant_user_id);

drop policy if exists maintenance_requests_tenant_insert on public.maintenance_requests;
create policy maintenance_requests_tenant_insert
  on public.maintenance_requests
  for insert
  with check (auth.uid() = tenant_user_id);

drop policy if exists maintenance_requests_tenant_cancel on public.maintenance_requests;
create policy maintenance_requests_tenant_cancel
  on public.maintenance_requests
  for update
  using (auth.uid() = tenant_user_id)
  with check (auth.uid() = tenant_user_id);
