-- Unit utility providers (landlord config → tenant read).
-- Safe to re-run.

create table if not exists public.unit_utility_providers (
  id uuid primary key default extensions.uuid_generate_v4(),
  unit_id uuid not null references public.units (id) on delete cascade,
  landlord_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    check (kind = any (array[
      'power'::text,
      'water'::text,
      'waste'::text,
      'diesel_generator'::text,
      'internet'::text,
      'other'::text
    ])),
  provider_name text not null,
  account_or_meter text,
  notes text,
  how_to_pay text,
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, kind)
);

create index if not exists unit_utility_providers_unit_id_idx
  on public.unit_utility_providers (unit_id);
create index if not exists unit_utility_providers_landlord_id_idx
  on public.unit_utility_providers (landlord_id);

comment on table public.unit_utility_providers is
  'Landlord-published utility providers for a unit; tenants read enabled rows.';

alter table public.unit_utility_providers enable row level security;

drop policy if exists unit_utility_providers_landlord_all on public.unit_utility_providers;
create policy unit_utility_providers_landlord_all
  on public.unit_utility_providers
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists unit_utility_providers_tenant_select on public.unit_utility_providers;
create policy unit_utility_providers_tenant_select
  on public.unit_utility_providers
  for select
  using (
    is_enabled = true
    and exists (
      select 1
      from public.tenancies t
      where t.unit_id = unit_utility_providers.unit_id
        and t.tenant_user_id = auth.uid()
        and t.status = 'active'
    )
  );
