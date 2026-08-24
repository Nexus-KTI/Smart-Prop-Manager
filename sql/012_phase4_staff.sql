-- Phase 4: staff memberships (multi-owner grants), property scope, audit trail.
-- Additive: existing landlords with no staff see no behavior change.
-- Safe to re-run.

-- Membership: user ↔ owner portfolio ↔ role + permission flags.
create table if not exists public.staff_memberships (
  id uuid primary key default extensions.uuid_generate_v4(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  role text not null
    check (role = any (array['manager'::text, 'caretaker'::text])),
  status text not null default 'invited'
    check (status = any (array[
      'invited'::text,
      'active'::text,
      'revoked'::text
    ])),
  -- Permission flags (Owner can tighten Manager defaults; Caretaker templates applied on invite)
  can_money boolean not null default false,
  can_money_log_cash boolean not null default false,
  can_chase boolean not null default false,
  can_docs_view boolean not null default false,
  can_docs_upload boolean not null default false,
  -- Phase 5 slot: visitor passes / access codes. Schema only until Phase 5.
  can_access_visitor_passes boolean not null default false,
  can_team_invite boolean not null default false,
  -- When true, all of owner_id's properties; else staff_membership_properties.
  scope_all_properties boolean not null default true,
  invite_token text unique,
  invite_contact text,
  invite_sent_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_memberships_not_self check (user_id is null or user_id <> owner_id)
);

create index if not exists staff_memberships_owner_id_idx
  on public.staff_memberships (owner_id);
create index if not exists staff_memberships_user_id_idx
  on public.staff_memberships (user_id);
create index if not exists staff_memberships_status_idx
  on public.staff_memberships (status);
create index if not exists staff_memberships_invite_token_idx
  on public.staff_memberships (invite_token)
  where invite_token is not null;

-- One active/invited membership per (owner, contact) while pending; active per (owner, user).
create unique index if not exists staff_memberships_one_active_user_per_owner_idx
  on public.staff_memberships (owner_id, user_id)
  where status = 'active' and user_id is not null;

comment on table public.staff_memberships is
  'Phase 4: Manager/Caretaker grants on an owner portfolio (multi-owner agent support).';
comment on column public.staff_memberships.can_access_visitor_passes is
  'Phase 5 capability slot — enforced as no-op until access codes ship.';

-- Optional property scope when scope_all_properties = false.
create table if not exists public.staff_membership_properties (
  membership_id uuid not null references public.staff_memberships (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  primary key (membership_id, property_id)
);

create index if not exists staff_membership_properties_property_id_idx
  on public.staff_membership_properties (property_id);

-- Functional audit trail for non-Owner money/chase (and related) actions.
create table if not exists public.audit_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  actor_role text not null,
  action text not null,
  target_type text,
  target_id text,
  membership_id uuid references public.staff_memberships (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_owner_id_created_at_idx
  on public.audit_events (owner_id, created_at desc);
create index if not exists audit_events_actor_user_id_idx
  on public.audit_events (actor_user_id);
create index if not exists audit_events_action_idx
  on public.audit_events (action);

comment on table public.audit_events is
  'Phase 4: Owner-visible audit of staff money/chase actions on their portfolio.';

-- RLS: no direct client policies; API uses service role after ACL checks
-- (same pattern as product_events). Owners read their audit via API.
alter table public.staff_memberships enable row level security;
alter table public.staff_membership_properties enable row level security;
alter table public.audit_events enable row level security;

-- Owners can read their own memberships (optional client reads); writes via service.
drop policy if exists staff_memberships_owner_select on public.staff_memberships;
create policy staff_memberships_owner_select
  on public.staff_memberships
  for select
  using (auth.uid() = owner_id or auth.uid() = user_id);

drop policy if exists staff_membership_properties_select on public.staff_membership_properties;
create policy staff_membership_properties_select
  on public.staff_membership_properties
  for select
  using (
    exists (
      select 1 from public.staff_memberships m
      where m.id = membership_id
        and (m.owner_id = auth.uid() or m.user_id = auth.uid())
    )
  );

drop policy if exists audit_events_owner_select on public.audit_events;
create policy audit_events_owner_select
  on public.audit_events
  for select
  using (auth.uid() = owner_id or auth.uid() = actor_user_id);
