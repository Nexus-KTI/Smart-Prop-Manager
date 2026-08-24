-- Phase 2 exit instrumentation: product_events + helper views.
-- Safe to re-run.

create table if not exists public.product_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  event_name text not null,
  landlord_id uuid not null,
  unit_id uuid references public.units (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_name_created_idx
  on public.product_events (event_name, created_at desc);

create index if not exists product_events_landlord_created_idx
  on public.product_events (landlord_id, created_at desc);

comment on table public.product_events is
  'Minimal product analytics (IDs only). Phase 2: renewal_banner_viewed.';

alter table public.product_events enable row level security;

-- No direct client policies: API inserts with service role after ownership checks.
drop policy if exists product_events_no_direct on public.product_events;

-- Active landlords = property owners with ≥1 unit.
create or replace view public.phase2_active_landlords as
select distinct p.owner_id as landlord_id
from public.properties p
inner join public.units u on u.property_id = p.id
where p.owner_id is not null;

comment on view public.phase2_active_landlords is
  'Owners with at least one unit (Phase 2 exit denominator for metric 1).';

-- Occupied units = tenant_contact set.
create or replace view public.phase2_occupied_units as
select
  u.id as unit_id,
  p.owner_id as landlord_id,
  u.term_end
from public.units u
inner join public.properties p on p.id = u.property_id
where nullif(btrim(coalesce(u.tenant_contact, '')), '') is not null;

comment on view public.phase2_occupied_units is
  'Units with tenant contact set (Phase 2 exit denominator for metric 2).';
