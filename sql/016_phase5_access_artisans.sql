-- Phase 5: artisan profiles, landlord artisan roster, access passes,
-- and maintenance_requests work-order columns.
-- Safe to re-run where possible.

-- 1) profiles.role includes artisan
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array[
    'landlord'::text,
    'tenant'::text,
    'artisan'::text
  ]));

-- 2) landlord_artisans (invite-only roster) — before artisan_profiles landlord policy
create table if not exists public.landlord_artisans (
  id uuid primary key default extensions.uuid_generate_v4(),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  artisan_user_id uuid references auth.users (id) on delete set null,
  invite_token text unique,
  invite_contact text,
  status text not null default 'invited'
    check (status = any (array[
      'invited'::text,
      'active'::text,
      'revoked'::text
    ])),
  invite_sent_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists landlord_artisans_landlord_id_idx
  on public.landlord_artisans (landlord_id);
create index if not exists landlord_artisans_artisan_user_id_idx
  on public.landlord_artisans (artisan_user_id);
create unique index if not exists landlord_artisans_one_active_per_pair_idx
  on public.landlord_artisans (landlord_id, artisan_user_id)
  where status = 'active' and artisan_user_id is not null;

comment on table public.landlord_artisans is
  'Invite-only artisan directory per landlord (no marketplace).';

alter table public.landlord_artisans enable row level security;

drop policy if exists landlord_artisans_landlord_all on public.landlord_artisans;
create policy landlord_artisans_landlord_all
  on public.landlord_artisans
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists landlord_artisans_artisan_select on public.landlord_artisans;
create policy landlord_artisans_artisan_select
  on public.landlord_artisans
  for select
  using (auth.uid() = artisan_user_id);

drop policy if exists landlord_artisans_artisan_claim_update on public.landlord_artisans;
create policy landlord_artisans_artisan_claim_update
  on public.landlord_artisans
  for update
  using (
    status = 'invited'
    and (artisan_user_id is null or artisan_user_id = auth.uid())
  )
  with check (auth.uid() = artisan_user_id);

-- 3) artisan_profiles
create table if not exists public.artisan_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  trades text[] not null default '{}',
  phone text,
  status text not null default 'active'
    check (status = any (array['active'::text, 'paused'::text])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.artisan_profiles is
  'Artisan identity for invite-only work orders (Phase 5 F51).';

alter table public.artisan_profiles enable row level security;

drop policy if exists artisan_profiles_self_all on public.artisan_profiles;
create policy artisan_profiles_self_all
  on public.artisan_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists artisan_profiles_landlord_select on public.artisan_profiles;
create policy artisan_profiles_landlord_select
  on public.artisan_profiles
  for select
  using (
    exists (
      select 1 from public.landlord_artisans la
      where la.artisan_user_id = artisan_profiles.user_id
        and la.landlord_id = auth.uid()
        and la.status = 'active'
    )
  );

-- 4) access_passes
create table if not exists public.access_passes (
  id uuid primary key default extensions.uuid_generate_v4(),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  subject_type text not null
    check (subject_type = any (array[
      'tenant'::text,
      'guest'::text,
      'artisan'::text,
      'contractor'::text
    ])),
  subject_user_id uuid references auth.users (id) on delete set null,
  subject_label text not null,
  code text not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  status text not null default 'active'
    check (status = any (array[
      'active'::text,
      'revoked'::text,
      'expired'::text
    ])),
  source_type text,
  source_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_passes_landlord_id_idx on public.access_passes (landlord_id);
create index if not exists access_passes_property_id_idx on public.access_passes (property_id);
create index if not exists access_passes_subject_user_id_idx on public.access_passes (subject_user_id);
create index if not exists access_passes_status_idx on public.access_passes (status);

comment on table public.access_passes is
  'Software gate codes / estate invites (Phase 5 F50). Expiry also evaluated at read time.';

alter table public.access_passes enable row level security;

drop policy if exists access_passes_landlord_all on public.access_passes;
create policy access_passes_landlord_all
  on public.access_passes
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists access_passes_subject_select on public.access_passes;
create policy access_passes_subject_select
  on public.access_passes
  for select
  using (auth.uid() = subject_user_id);

-- 5) Extend maintenance_requests for work orders
alter table public.maintenance_requests
  add column if not exists origin text not null default 'tenant';

alter table public.maintenance_requests
  add column if not exists artisan_user_id uuid references auth.users (id) on delete set null;

alter table public.maintenance_requests
  add column if not exists scheduled_start timestamptz;

alter table public.maintenance_requests
  add column if not exists scheduled_end timestamptz;

alter table public.maintenance_requests
  add column if not exists access_pass_id uuid references public.access_passes (id) on delete set null;

alter table public.maintenance_requests
  add column if not exists completed_at timestamptz;

alter table public.maintenance_requests
  alter column tenancy_id drop not null;

alter table public.maintenance_requests
  alter column tenant_user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'maintenance_requests_origin_check'
  ) then
    alter table public.maintenance_requests
      add constraint maintenance_requests_origin_check
      check (origin = any (array['tenant'::text, 'landlord'::text]));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'maintenance_requests_origin_tenant_req'
  ) then
    alter table public.maintenance_requests
      add constraint maintenance_requests_origin_tenant_req
      check (
        (origin = 'landlord')
        or (tenancy_id is not null and tenant_user_id is not null)
      );
  end if;
end $$;

create index if not exists maintenance_requests_artisan_user_id_idx
  on public.maintenance_requests (artisan_user_id);

drop policy if exists maintenance_requests_artisan_select on public.maintenance_requests;
create policy maintenance_requests_artisan_select
  on public.maintenance_requests
  for select
  using (auth.uid() = artisan_user_id);

drop policy if exists maintenance_requests_artisan_complete on public.maintenance_requests;
create policy maintenance_requests_artisan_complete
  on public.maintenance_requests
  for update
  using (auth.uid() = artisan_user_id)
  with check (auth.uid() = artisan_user_id);

comment on table public.maintenance_requests is
  'Repair / work orders: tenant intake or landlord-originated; artisan assign Phase 5.';
