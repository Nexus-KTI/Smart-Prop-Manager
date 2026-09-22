-- Gate code chain-of-custody: who minted / admitted / revoked.
-- Safe to re-run.

alter table public.access_passes
  add column if not exists created_by_label text;

alter table public.access_passes
  add column if not exists last_admitted_by uuid references auth.users (id) on delete set null;

alter table public.access_passes
  add column if not exists last_admitted_by_label text;

alter table public.access_passes
  add column if not exists last_admitted_at timestamptz;

comment on column public.access_passes.created_by_label is
  'Display name of who minted/issued the code (denormalized for gate staff).';

comment on column public.access_passes.last_admitted_by_label is
  'Display name of who last admitted this code at the gate.';

create table if not exists public.access_pass_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  pass_id uuid references public.access_passes (id) on delete set null,
  landlord_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  event_type text not null
    check (event_type = any (array['created'::text, 'admitted'::text, 'revoked'::text])),
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  actor_role text,
  actor_label text,
  code text,
  subject_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists access_pass_events_property_created_idx
  on public.access_pass_events (property_id, created_at desc);

create index if not exists access_pass_events_pass_created_idx
  on public.access_pass_events (pass_id, created_at desc);

create index if not exists access_pass_events_landlord_created_idx
  on public.access_pass_events (landlord_id, created_at desc);

comment on table public.access_pass_events is
  'Gate chain-of-custody: issue/admit/revoke. Always logged (including owners/tenants) for security trace.';

alter table public.access_pass_events enable row level security;

-- Reads via API service role after ACL; no direct client policies (same as product_events).
