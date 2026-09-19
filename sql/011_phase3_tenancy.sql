-- Phase 3: tenancy dossier, checklist, documents, tenant link, payment initiator.
-- Safe to re-run.

-- Profile role: landlord (default) or tenant.
alter table public.profiles
  add column if not exists role text not null default 'landlord';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role = any (array['landlord'::text, 'tenant'::text]));
  end if;
end $$;

-- Lightweight tenancy (F30) anchored to a unit.
create table if not exists public.tenancies (
  id uuid primary key default extensions.uuid_generate_v4(),
  unit_id uuid not null references public.units (id) on delete cascade,
  landlord_id uuid not null references auth.users (id) on delete cascade,
  tenant_user_id uuid references auth.users (id) on delete set null,
  tenant_name text,
  tenant_contact text,
  start_date date,
  term_end date,
  status text not null default 'draft'
    check (status = any (array[
      'draft'::text,
      'pending_verification'::text,
      'active'::text,
      'ended'::text
    ])),
  checklist_id_collected boolean not null default false,
  checklist_agreement_signed boolean not null default false,
  checklist_references_checked boolean not null default false,
  checklist_identity_verified boolean not null default false,
  identity_provider text,
  invite_token text unique,
  invite_sent_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenancies_unit_id_idx on public.tenancies (unit_id);
create index if not exists tenancies_landlord_id_idx on public.tenancies (landlord_id);
create index if not exists tenancies_tenant_user_id_idx on public.tenancies (tenant_user_id);
create index if not exists tenancies_status_idx on public.tenancies (status);

comment on table public.tenancies is
  'Phase 3 occupancy record: checklist + docs + optional tenant account link.';

-- One open tenancy per unit (draft / pending / active). Ended can accumulate.
create unique index if not exists tenancies_one_open_per_unit_idx
  on public.tenancies (unit_id)
  where status = any (array['draft'::text, 'pending_verification'::text, 'active'::text]);

alter table public.tenancies enable row level security;

drop policy if exists tenancies_landlord_all on public.tenancies;
create policy tenancies_landlord_all
  on public.tenancies
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists tenancies_tenant_select on public.tenancies;
create policy tenancies_tenant_select
  on public.tenancies
  for select
  using (auth.uid() = tenant_user_id);

-- Documents (F31). Upload gated in app via DOCS_UPLOAD_ENABLED.
create table if not exists public.tenancy_documents (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  landlord_id uuid not null references auth.users (id) on delete cascade,
  doc_type text not null
    check (doc_type = any (array[
      'id'::text,
      'agreement'::text,
      'reference'::text,
      'other'::text
    ])),
  file_name text not null,
  storage_path text not null,
  content_type text not null default 'application/pdf',
  expires_on date,
  retain_until date not null,
  created_at timestamptz not null default now()
);

create index if not exists tenancy_documents_tenancy_id_idx
  on public.tenancy_documents (tenancy_id);

comment on table public.tenancy_documents is
  'Tenancy docs; belong to landlord (controller). Nexora stores for the tenancy (processor). Default retain_until = created + 2 years.';

alter table public.tenancy_documents enable row level security;

drop policy if exists tenancy_documents_landlord_all on public.tenancy_documents;
create policy tenancy_documents_landlord_all
  on public.tenancy_documents
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists tenancy_documents_tenant_select on public.tenancy_documents;
create policy tenancy_documents_tenant_select
  on public.tenancy_documents
  for select
  using (
    exists (
      select 1 from public.tenancies t
      where t.id = tenancy_documents.tenancy_id
        and t.tenant_user_id = auth.uid()
        and t.status = 'active'
    )
  );

-- Who initiated the payment (landlord log vs tenant Paystack).
alter table public.transactions
  add column if not exists initiated_by text not null default 'landlord';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_initiated_by_check'
  ) then
    alter table public.transactions
      add constraint transactions_initiated_by_check
      check (initiated_by = any (array['landlord'::text, 'tenant'::text]));
  end if;
end $$;

alter table public.transactions
  add column if not exists initiator_user_id uuid references auth.users (id) on delete set null;

comment on column public.transactions.initiated_by is
  'landlord = manual/landlord Paystack; tenant = tenant-initiated Paystack (same ledger).';

-- Phase 3 exit helpers
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
