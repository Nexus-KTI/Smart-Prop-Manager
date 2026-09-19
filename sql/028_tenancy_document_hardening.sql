-- Tenancy document launch-readiness.
-- Local migration only until legal/security approval. This does not create a
-- Storage bucket and does not enable application feature flags.

alter table public.tenancy_documents
  add column if not exists sha256 text,
  add column if not exists version integer not null default 1,
  add column if not exists uploaded_by uuid references auth.users (id) on delete set null,
  add column if not exists scan_status text not null default 'pending',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists purged_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenancy_documents_sha256_check'
  ) then
    alter table public.tenancy_documents
      add constraint tenancy_documents_sha256_check
      check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenancy_documents_version_check'
  ) then
    alter table public.tenancy_documents
      add constraint tenancy_documents_version_check check (version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenancy_documents_scan_status_check'
  ) then
    alter table public.tenancy_documents
      add constraint tenancy_documents_scan_status_check
      check (scan_status = any (array['pending', 'clean', 'rejected']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenancy_documents_legal_hold_state_check'
  ) then
    alter table public.tenancy_documents
      add constraint tenancy_documents_legal_hold_state_check
      check (not legal_hold or (deleted_at is null and purged_at is null));
  end if;
end $$;

create index if not exists tenancy_documents_retention_due_idx
  on public.tenancy_documents (retain_until)
  where purged_at is null and legal_hold = false;

create or replace function public.set_tenancy_document_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_landlord uuid;
begin
  select t.landlord_id into expected_landlord
  from public.tenancies t
  where t.id = new.tenancy_id;

  if expected_landlord is null then
    raise exception 'Tenancy not found';
  end if;
  new.landlord_id := expected_landlord;
  return new;
end;
$$;

drop trigger if exists tenancy_document_owner_integrity
  on public.tenancy_documents;
create trigger tenancy_document_owner_integrity
before insert or update of tenancy_id, landlord_id
on public.tenancy_documents
for each row execute function public.set_tenancy_document_owner();

-- Documents are readable through RLS, but writes remain API/service-role only.
drop policy if exists tenancy_documents_landlord_all
  on public.tenancy_documents;
drop policy if exists tenancy_documents_landlord_select
  on public.tenancy_documents;
create policy tenancy_documents_landlord_select
  on public.tenancy_documents
  for select
  using (auth.uid() = landlord_id and deleted_at is null);

drop policy if exists tenancy_documents_tenant_select
  on public.tenancy_documents;
create policy tenancy_documents_tenant_select
  on public.tenancy_documents
  for select
  using (
    deleted_at is null
    and scan_status = 'clean'
    and exists (
      select 1
      from public.tenancies t
      where t.id = tenancy_documents.tenancy_id
        and t.tenant_user_id = auth.uid()
        and t.status = 'active'
    )
  );

create table if not exists public.tenancy_document_acknowledgments (
  id uuid primary key default extensions.uuid_generate_v4(),
  document_id uuid not null
    references public.tenancy_documents (id) on delete restrict,
  tenancy_id uuid not null
    references public.tenancies (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  acknowledged_at timestamptz not null default now(),
  text_version text not null,
  ip_address inet,
  user_agent text,
  unique (document_id, actor_id)
);

create or replace function public.validate_document_acknowledgment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  document_tenancy uuid;
  needs_ack boolean;
  linked_tenant uuid;
  tenancy_status text;
begin
  select d.tenancy_id, d.requires_ack, t.tenant_user_id, t.status
    into document_tenancy, needs_ack, linked_tenant, tenancy_status
  from public.tenancy_documents d
  join public.tenancies t on t.id = d.tenancy_id
  where d.id = new.document_id
    and d.deleted_at is null
    and d.scan_status = 'clean';

  if document_tenancy is null then
    raise exception 'Available document not found';
  end if;
  if not needs_ack then
    raise exception 'Document does not require acknowledgment';
  end if;
  if linked_tenant is distinct from new.actor_id or tenancy_status <> 'active' then
    raise exception 'Only the active linked tenant may acknowledge';
  end if;

  new.tenancy_id := document_tenancy;
  return new;
end;
$$;

drop trigger if exists tenancy_document_ack_validate
  on public.tenancy_document_acknowledgments;
create trigger tenancy_document_ack_validate
before insert on public.tenancy_document_acknowledgments
for each row execute function public.validate_document_acknowledgment();

create or replace function public.prevent_acknowledgment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Document acknowledgments are append-only';
end;
$$;

drop trigger if exists tenancy_document_ack_immutable
  on public.tenancy_document_acknowledgments;
create trigger tenancy_document_ack_immutable
before update or delete on public.tenancy_document_acknowledgments
for each row execute function public.prevent_acknowledgment_mutation();

alter table public.tenancy_document_acknowledgments enable row level security;

create policy tenancy_document_ack_landlord_select
  on public.tenancy_document_acknowledgments
  for select
  using (
    exists (
      select 1
      from public.tenancies t
      where t.id = tenancy_document_acknowledgments.tenancy_id
        and t.landlord_id = auth.uid()
    )
  );

create policy tenancy_document_ack_actor_select
  on public.tenancy_document_acknowledgments
  for select
  using (actor_id = auth.uid());

create table if not exists public.tenancy_document_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  document_id uuid not null
    references public.tenancy_documents (id) on delete restrict,
  tenancy_id uuid not null
    references public.tenancies (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null
    check (event_type = any (array[
      'uploaded', 'scan_clean', 'scan_rejected',
      'delete_started', 'delete_failed', 'deleted',
      'purge_started', 'purge_failed', 'purged'
    ])),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_tenancy_document_event_tenancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  document_tenancy uuid;
begin
  select d.tenancy_id into document_tenancy
  from public.tenancy_documents d
  where d.id = new.document_id;

  if document_tenancy is null then
    raise exception 'Document not found';
  end if;
  new.tenancy_id := document_tenancy;
  return new;
end;
$$;

drop trigger if exists tenancy_document_event_integrity
  on public.tenancy_document_events;
create trigger tenancy_document_event_integrity
before insert on public.tenancy_document_events
for each row execute function public.set_tenancy_document_event_tenancy();

alter table public.tenancy_document_events enable row level security;

create policy tenancy_document_events_landlord_select
  on public.tenancy_document_events
  for select
  using (
    exists (
      select 1
      from public.tenancies t
      where t.id = tenancy_document_events.tenancy_id
        and t.landlord_id = auth.uid()
    )
  );

comment on table public.tenancy_document_acknowledgments is
  'Append-only evidence of tenant receipt/read acknowledgment; not a legal signature.';
comment on table public.tenancy_document_events is
  'API-written audit events for tenancy document lifecycle operations.';
