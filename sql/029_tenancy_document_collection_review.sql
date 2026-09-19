-- NDPA-aligned tenancy document request, submission, review and privacy cases.
-- Keep all application capability flags off. Validate on a Supabase branch only.

do $$
begin
  if to_regclass('public.tenancy_documents') is null
     or to_regclass('public.tenancy_document_events') is null
     or to_regclass('public.tenancy_document_acknowledgments') is null then
    raise exception '029 requires the complete 028 tenancy document baseline';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenancy_documents'
      and column_name = 'sha256'
  ) then
    raise exception '029 requires tenancy_documents.sha256 from 028';
  end if;
  if to_regprocedure('public.set_tenancy_document_owner()') is null
     or to_regprocedure('public.validate_document_acknowledgment()') is null
     or to_regprocedure('public.prevent_acknowledgment_mutation()') is null
     or to_regprocedure('public.set_tenancy_document_event_tenancy()') is null then
    raise exception '029 requires the complete 028 integrity functions';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'tenancy_document_ack_validate' and not tgisinternal
  ) then
    raise exception '029 requires the 028 acknowledgment integrity trigger';
  end if;
end $$;

alter table public.tenancy_document_events
  drop constraint if exists tenancy_document_events_event_type_check;
alter table public.tenancy_document_events
  add constraint tenancy_document_events_event_type_check
  check (event_type = any (array[
    'uploaded', 'scan_clean', 'scan_rejected',
    'delete_started', 'delete_failed', 'deleted',
    'purge_started', 'purge_failed', 'purged',
    'legal_hold_applied', 'legal_hold_released',
    'request_uploaded', 'document_opened', 'orphan_cleaned'
  ]));

alter table public.tenancy_documents
  alter column retain_until drop not null;
alter table public.tenancy_documents
  add column if not exists deletion_evidence_pending boolean not null default false,
  add column if not exists purge_evidence_pending boolean not null default false,
  add column if not exists orphan_cleanup_pending boolean not null default false;

alter table public.tenancies
  add column if not exists ended_at timestamptz;

create table if not exists public.tenancy_document_processing_policies (
  version text primary key
    check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  purpose_code text not null
    check (purpose_code = any (array[
      'agreement_collection'::text,
      'reference_collection'::text
    ])),
  lawful_basis text not null
    check (lawful_basis = any (array[
      'consent'::text,
      'contract'::text,
      'legal_obligation'::text,
      'vital_interests'::text,
      'public_interest'::text,
      'legitimate_interests'::text
    ])),
  privacy_notice_version text not null
    check (privacy_notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  privacy_notice_sha256 text not null
    check (privacy_notice_sha256 ~ '^[0-9a-f]{64}$'),
  privacy_notice_url text not null check (
    length(privacy_notice_url) <= 500 and privacy_notice_url ~ '^https://'
  ),
  retention_anchor text not null
    check (retention_anchor = any (array[
      'request_closed'::text,
      'tenancy_ended'::text
    ])),
  retention_days integer not null check (retention_days between 1 and 3650),
  approval_reference text not null check (length(approval_reference) <= 240),
  approved_at timestamptz not null,
  effective_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  check (retired_at is null or retired_at >= effective_at)
);

create table if not exists public.tenancy_privacy_case_policies (
  version text primary key
    check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  notice_version text not null
    check (notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  notice_sha256 text not null check (notice_sha256 ~ '^[0-9a-f]{64}$'),
  notice_url text not null check (
    length(notice_url) <= 500 and notice_url ~ '^https://'
  ),
  response_days integer not null check (response_days between 1 and 365),
  approval_reference text not null check (length(approval_reference) <= 240),
  approved_at timestamptz not null,
  effective_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  check (retired_at is null or retired_at >= effective_at)
);

create table if not exists public.tenancy_document_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenancy_id uuid not null references public.tenancies (id) on delete restrict,
  landlord_id uuid not null references auth.users (id) on delete restrict,
  doc_type text not null
    check (doc_type = any (array['agreement'::text, 'reference'::text])),
  processing_policy_version text not null
    references public.tenancy_document_processing_policies (version) on delete restrict,
  title text not null check (length(title) between 1 and 120),
  instructions text check (instructions is null or length(instructions) <= 500),
  due_on date,
  status text not null default 'open'
    check (status = any (array[
      'open'::text,
      'submitted'::text,
      'changes_requested'::text,
      'accepted'::text,
      'cancelled'::text
    ])),
  created_by uuid not null references auth.users (id) on delete restrict,
  current_submission_id uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenancy_document_requests_tenancy_idx
  on public.tenancy_document_requests (tenancy_id, status, created_at desc);

create table if not exists public.tenancy_document_submissions (
  id uuid primary key default extensions.uuid_generate_v4(),
  request_id uuid not null
    references public.tenancy_document_requests (id) on delete restrict,
  document_id uuid not null unique
    references public.tenancy_documents (id) on delete restrict,
  version integer not null check (version > 0),
  replaces_submission_id uuid unique
    references public.tenancy_document_submissions (id) on delete restrict,
  submitted_by uuid not null references auth.users (id) on delete restrict,
  submitted_by_role text not null
    check (submitted_by_role = any (array['landlord'::text, 'tenant'::text])),
  review_status text not null default 'pending_review'
    check (review_status = any (array[
      'pending_review'::text,
      'accepted'::text,
      'changes_requested'::text,
      'superseded'::text
    ])),
  notice_version text not null,
  notice_presented_at timestamptz not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  retention_anchor_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, version),
  unique (submitted_by, idempotency_key)
);

alter table public.tenancy_document_requests
  drop constraint if exists tenancy_document_requests_current_submission_fk;
alter table public.tenancy_document_requests
  add constraint tenancy_document_requests_current_submission_fk
  foreign key (current_submission_id)
  references public.tenancy_document_submissions (id)
  on delete restrict;

create index if not exists tenancy_document_submissions_request_idx
  on public.tenancy_document_submissions (request_id, version desc);

create table if not exists public.tenancy_document_request_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  request_id uuid not null
    references public.tenancy_document_requests (id) on delete restrict,
  submission_id uuid
    references public.tenancy_document_submissions (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null
    check (event_type = any (array[
      'request_created'::text,
      'request_cancelled'::text,
      'notice_presented'::text,
      'tenant_submitted'::text,
      'replacement_submitted'::text,
      'accepted'::text,
      'changes_requested'::text,
      'document_opened'::text,
      'notification_sent'::text,
      'notification_failed'::text
    ])),
  reason_code text
    check (reason_code is null or reason_code = any (array[
      'incorrect_document'::text,
      'incomplete'::text,
      'illegible'::text,
      'expired'::text,
      'other'::text
    ])),
  comment text check (comment is null or length(comment) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tenancy_document_request_events_request_idx
  on public.tenancy_document_request_events (request_id, created_at);

create table if not exists public.tenancy_document_transition_keys (
  actor_id uuid not null references auth.users (id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  operation text not null check (length(operation) between 1 and 80),
  scope_id uuid not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

create table if not exists public.tenancy_workflow_notification_deliveries (
  id uuid primary key default extensions.uuid_generate_v4(),
  idempotency_key text not null unique
    check (length(idempotency_key) between 8 and 120),
  request_id uuid
    references public.tenancy_document_requests (id) on delete restrict,
  privacy_request_id uuid
    references public.tenancy_privacy_requests (id) on delete restrict,
  notification_kind text not null check (length(notification_kind) <= 80),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  channel text,
  error_code text check (error_code is null or length(error_code) <= 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((request_id is null) <> (privacy_request_id is null))
);

create table if not exists public.tenancy_document_holds (
  id uuid primary key default extensions.uuid_generate_v4(),
  document_id uuid not null
    references public.tenancy_documents (id) on delete restrict,
  reason_code text not null
    check (reason_code = any (array[
      'legal_claim'::text,
      'regulatory_request'::text,
      'privacy_request'::text,
      'incident_investigation'::text
    ])),
  external_reference text check (
    external_reference is null or length(external_reference) <= 240
  ),
  applied_by uuid not null references auth.users (id) on delete restrict,
  applied_at timestamptz not null default now(),
  released_by uuid references auth.users (id) on delete restrict,
  released_at timestamptz,
  release_reason text check (
    release_reason is null or length(release_reason) <= 500
  ),
  check (
    (released_at is null and released_by is null and release_reason is null)
    or (released_at is not null and released_by is not null and release_reason is not null)
  )
);

create unique index if not exists tenancy_document_holds_one_active_idx
  on public.tenancy_document_holds (document_id)
  where released_at is null;

create table if not exists public.tenancy_privacy_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenancy_id uuid references public.tenancies (id) on delete restrict,
  landlord_id uuid not null references auth.users (id) on delete restrict,
  data_subject_id uuid not null references auth.users (id) on delete restrict,
  request_type text not null
    check (request_type = any (array[
      'access'::text,
      'rectification'::text,
      'erasure'::text,
      'restriction'::text,
      'objection'::text,
      'portability'::text
    ])),
  status text not null default 'received'
    check (status = any (array[
      'received'::text,
      'identity_check'::text,
      'in_review'::text,
      'restricted'::text,
      'completed'::text,
      'refused'::text
    ])),
  privacy_policy_version text not null
    references public.tenancy_privacy_case_policies (version) on delete restrict,
  notice_presented_at timestamptz not null,
  received_at timestamptz not null default now(),
  identity_verified_at timestamptz,
  due_on date,
  completed_at timestamptz,
  outcome_code text check (outcome_code is null or length(outcome_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenancy_privacy_request_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  privacy_request_id uuid not null
    references public.tenancy_privacy_requests (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null
    check (event_type = any (array[
      'received'::text,
      'identity_verified'::text,
      'scope_confirmed'::text,
      'restricted'::text,
      'export_prepared'::text,
      'decision_recorded'::text,
      'completed'::text,
      'notification_sent'::text,
      'notification_failed'::text
    ])),
  reason_code text check (reason_code is null or length(reason_code) <= 80),
  created_at timestamptz not null default now()
);

create table if not exists public.tenancy_privacy_request_documents (
  privacy_request_id uuid not null
    references public.tenancy_privacy_requests (id) on delete restrict,
  document_id uuid not null
    references public.tenancy_documents (id) on delete restrict,
  relation_type text not null
    check (relation_type = any (array[
      'in_scope'::text,
      'restricted'::text,
      'disclosed'::text,
      'erasure_review'::text
    ])),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (privacy_request_id, document_id, relation_type)
);

create or replace function public.anchor_tenancy_document_retention_on_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('tenancy-doc-scope:' || new.id::text, 0)
  );
  if new.status = 'active'
     and old.status is distinct from 'active'
     and exists (
       select 1
       from public.tenancy_document_requests r
       join public.tenancy_document_submissions s
         on s.id = r.current_submission_id
       join public.tenancy_documents d on d.id = s.document_id
       where r.tenancy_id = new.id
         and r.status = 'accepted'
         and (d.deleted_at is not null or d.purged_at is not null)
     ) then
    raise exception 'Accepted tenancy document is unavailable for activation';
  end if;
  if new.status = 'ended' and old.status is distinct from 'ended' then
    new.ended_at := now();
    update public.tenancy_document_submissions s
    set retention_anchor_at = new.ended_at
    from public.tenancy_document_requests r,
         public.tenancy_document_processing_policies p
    where s.request_id = r.id
      and r.processing_policy_version = p.version
      and r.tenancy_id = new.id
      and p.retention_anchor = 'tenancy_ended'
      and s.retention_anchor_at is null;

    update public.tenancy_documents d
    set retain_until = new.ended_at::date + p.retention_days
    from public.tenancy_document_submissions s,
         public.tenancy_document_requests r,
         public.tenancy_document_processing_policies p
    where s.document_id = d.id
      and s.request_id = r.id
      and r.processing_policy_version = p.version
      and r.tenancy_id = new.id
      and p.retention_anchor = 'tenancy_ended';
  else
    new.ended_at := old.ended_at;
  end if;
  return new;
end;
$$;

drop trigger if exists tenancies_document_retention_end_anchor
  on public.tenancies;
create trigger tenancies_document_retention_end_anchor
before update of status, ended_at on public.tenancies
for each row execute function public.anchor_tenancy_document_retention_on_end();

create or replace function public.prevent_tenancy_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tenancy document evidence is append-only';
end;
$$;

create or replace function public.allow_policy_retirement_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.retired_at is null
     and new.retired_at is not null
     and (to_jsonb(new) - 'retired_at') = (to_jsonb(old) - 'retired_at') then
    return new;
  end if;
  raise exception 'Approved policy content is immutable';
end;
$$;

drop trigger if exists tenancy_document_processing_policies_immutable
  on public.tenancy_document_processing_policies;
create trigger tenancy_document_processing_policies_immutable
before update or delete on public.tenancy_document_processing_policies
for each row execute function public.allow_policy_retirement_only();

drop trigger if exists tenancy_privacy_case_policies_immutable
  on public.tenancy_privacy_case_policies;
create trigger tenancy_privacy_case_policies_immutable
before update or delete on public.tenancy_privacy_case_policies
for each row execute function public.allow_policy_retirement_only();

drop trigger if exists tenancy_document_events_immutable
  on public.tenancy_document_events;
create trigger tenancy_document_events_immutable
before update or delete on public.tenancy_document_events
for each row execute function public.prevent_tenancy_evidence_mutation();

drop trigger if exists tenancy_document_request_events_immutable
  on public.tenancy_document_request_events;
create trigger tenancy_document_request_events_immutable
before update or delete on public.tenancy_document_request_events
for each row execute function public.prevent_tenancy_evidence_mutation();

drop trigger if exists tenancy_privacy_request_events_immutable
  on public.tenancy_privacy_request_events;
create trigger tenancy_privacy_request_events_immutable
before update or delete on public.tenancy_privacy_request_events
for each row execute function public.prevent_tenancy_evidence_mutation();

drop trigger if exists tenancy_privacy_request_documents_immutable
  on public.tenancy_privacy_request_documents;
create trigger tenancy_privacy_request_documents_immutable
before update or delete on public.tenancy_privacy_request_documents
for each row execute function public.prevent_tenancy_evidence_mutation();

drop trigger if exists tenancy_document_transition_keys_immutable
  on public.tenancy_document_transition_keys;
create trigger tenancy_document_transition_keys_immutable
before update or delete on public.tenancy_document_transition_keys
for each row execute function public.prevent_tenancy_evidence_mutation();

create or replace function public.validate_tenancy_document_hold_release()
returns trigger
language plpgsql
as $$
begin
  if old.released_at is not null
     or new.document_id is distinct from old.document_id
     or new.reason_code is distinct from old.reason_code
     or new.external_reference is distinct from old.external_reference
     or new.applied_by is distinct from old.applied_by
     or new.applied_at is distinct from old.applied_at then
    raise exception 'Legal hold evidence is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists tenancy_document_holds_release_only
  on public.tenancy_document_holds;
create trigger tenancy_document_holds_release_only
before update on public.tenancy_document_holds
for each row execute function public.validate_tenancy_document_hold_release();

drop trigger if exists tenancy_document_holds_no_delete
  on public.tenancy_document_holds;
create trigger tenancy_document_holds_no_delete
before delete on public.tenancy_document_holds
for each row execute function public.prevent_tenancy_evidence_mutation();

create or replace function public.prevent_legacy_document_ack_update()
returns trigger
language plpgsql
as $$
begin
  if new.acknowledged_at is distinct from old.acknowledged_at
     or new.acknowledged_by is distinct from old.acknowledged_by then
    raise exception 'Legacy acknowledgment summary columns are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists tenancy_documents_legacy_ack_immutable
  on public.tenancy_documents;
create trigger tenancy_documents_legacy_ack_immutable
before update of acknowledged_at, acknowledged_by on public.tenancy_documents
for each row execute function public.prevent_legacy_document_ack_update();

create or replace function public.set_document_request_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_landlord uuid;
  policy_purpose text;
begin
  select landlord_id into expected_landlord
  from public.tenancies
  where id = new.tenancy_id;
  if expected_landlord is null then
    raise exception 'Tenancy not found';
  end if;
  new.landlord_id := expected_landlord;

  select purpose_code into policy_purpose
  from public.tenancy_document_processing_policies
  where version = new.processing_policy_version
    and approved_at <= now()
    and effective_at <= now()
    and (retired_at is null or retired_at > now());
  if policy_purpose is null
     or policy_purpose <> new.doc_type || '_collection' then
    raise exception 'Approved processing policy does not match request type';
  end if;
  return new;
end;
$$;

drop trigger if exists tenancy_document_request_owner_integrity
  on public.tenancy_document_requests;
create trigger tenancy_document_request_owner_integrity
before insert or update of tenancy_id, landlord_id, processing_policy_version, doc_type
on public.tenancy_document_requests
for each row execute function public.set_document_request_owner();

create or replace function public.create_tenancy_document_request(
  p_tenancy_id uuid,
  p_landlord_id uuid,
  p_doc_type text,
  p_processing_policy_version text,
  p_title text,
  p_instructions text,
  p_due_on date,
  p_idempotency_key text
)
returns public.tenancy_document_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.tenancy_document_requests%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_landlord_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_landlord_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> 'create_request'
       or transition_row.scope_id <> p_tenancy_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into created_row
    from public.tenancy_document_requests
    where id = transition_row.result_id;
    return created_row;
  end if;

  if not exists (
    select 1
    from public.tenancies
    where id = p_tenancy_id
      and landlord_id = p_landlord_id
      and status in ('draft', 'pending_verification')
  ) then
    raise exception 'Owned pending tenancy not found';
  end if;
  if p_doc_type not in ('agreement', 'reference') then
    raise exception 'Unsupported request type';
  end if;

  insert into public.tenancy_document_requests (
    tenancy_id,
    landlord_id,
    doc_type,
    processing_policy_version,
    title,
    instructions,
    due_on,
    created_by
  ) values (
    p_tenancy_id,
    p_landlord_id,
    p_doc_type,
    p_processing_policy_version,
    trim(p_title),
    nullif(trim(p_instructions), ''),
    p_due_on,
    p_landlord_id
  )
  returning * into created_row;

  insert into public.tenancy_document_request_events (
    request_id,
    actor_id,
    event_type
  ) values (
    created_row.id,
    p_landlord_id,
    'request_created'
  );
  insert into public.tenancy_document_transition_keys (
    actor_id,
    idempotency_key,
    operation,
    scope_id,
    result_id
  ) values (
    p_landlord_id,
    p_idempotency_key,
    'create_request',
    p_tenancy_id,
    created_row.id
  );
  return created_row;
end;
$$;

create or replace function public.cancel_tenancy_document_request(
  p_request_id uuid,
  p_landlord_id uuid,
  p_idempotency_key text
)
returns public.tenancy_document_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.tenancy_document_requests%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
  policy_row public.tenancy_document_processing_policies%rowtype;
  anchor_at timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_landlord_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_landlord_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> 'cancel_request'
       or transition_row.scope_id <> p_request_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into updated_row
    from public.tenancy_document_requests
    where id = transition_row.result_id;
    return updated_row;
  end if;

  update public.tenancy_document_requests
  set status = 'cancelled',
      closed_at = now(),
      updated_at = now()
  where id = p_request_id
    and landlord_id = p_landlord_id
    and status in ('open', 'changes_requested')
  returning * into updated_row;
  if not found then
    raise exception 'Cancelable document request not found';
  end if;

  insert into public.tenancy_document_request_events (
    request_id,
    actor_id,
    event_type
  ) values (
    p_request_id,
    p_landlord_id,
    'request_cancelled'
  );

  select * into policy_row
  from public.tenancy_document_processing_policies
  where version = updated_row.processing_policy_version;
  anchor_at := case policy_row.retention_anchor
    when 'request_closed' then now()
    when 'tenancy_ended' then (
      select ended_at
      from public.tenancies
      where id = updated_row.tenancy_id and ended_at is not null
    )
    else null
  end;
  if anchor_at is not null then
    update public.tenancy_documents d
    set retain_until = anchor_at::date + policy_row.retention_days
    from public.tenancy_document_submissions s
    where s.request_id = updated_row.id and s.document_id = d.id;
    update public.tenancy_document_submissions
    set retention_anchor_at = anchor_at
    where request_id = updated_row.id and retention_anchor_at is null;
  end if;

  insert into public.tenancy_document_transition_keys (
    actor_id,
    idempotency_key,
    operation,
    scope_id,
    result_id
  ) values (
    p_landlord_id,
    p_idempotency_key,
    'cancel_request',
    p_request_id,
    updated_row.id
  );
  return updated_row;
end;
$$;

create or replace function public.create_tenancy_document_submission(
  p_request_id uuid,
  p_document_id uuid,
  p_actor_id uuid,
  p_notice_version text,
  p_notice_presented_at timestamptz,
  p_replaces_submission_id uuid,
  p_idempotency_key text
)
returns public.tenancy_document_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.tenancy_document_requests%rowtype;
  document_row public.tenancy_documents%rowtype;
  previous_row public.tenancy_document_submissions%rowtype;
  existing_row public.tenancy_document_submissions%rowtype;
  created_row public.tenancy_document_submissions%rowtype;
  linked_tenant uuid;
  tenancy_status text;
  next_version integer;
  actor_role text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into existing_row
  from public.tenancy_document_submissions
  where submitted_by = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if existing_row.request_id <> p_request_id then
      raise exception 'Idempotency key was used for another request';
    end if;
    return existing_row;
  end if;

  select * into request_row
  from public.tenancy_document_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Document request not found';
  end if;
  if request_row.status not in ('open', 'changes_requested') then
    raise exception 'Document request is not accepting submissions';
  end if;

  select tenant_user_id, status
    into linked_tenant, tenancy_status
  from public.tenancies
  where id = request_row.tenancy_id;
  if linked_tenant = p_actor_id
     and tenancy_status in ('draft', 'pending_verification') then
    actor_role := 'tenant';
  else
    raise exception 'Actor is not authorized for this document request';
  end if;

  select * into document_row
  from public.tenancy_documents
  where id = p_document_id
    and tenancy_id = request_row.tenancy_id
    and landlord_id = request_row.landlord_id
    and doc_type = request_row.doc_type
    and uploaded_by = p_actor_id
    and scan_status = 'clean'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Clean request document not found';
  end if;

  if p_notice_version <> (
    select privacy_notice_version
    from public.tenancy_document_processing_policies
    where version = request_row.processing_policy_version
  ) then
    raise exception 'Privacy notice version does not match request policy';
  end if;

  if request_row.status = 'changes_requested' then
    if p_replaces_submission_id is null
       or p_replaces_submission_id <> request_row.current_submission_id then
      raise exception 'Replacement must follow the current submission';
    end if;
    select * into previous_row
    from public.tenancy_document_submissions
    where id = p_replaces_submission_id
      and request_id = p_request_id
      and review_status = 'changes_requested'
    for update;
    if not found then
      raise exception 'Replaceable submission not found';
    end if;
  elsif p_replaces_submission_id is not null then
    raise exception 'Initial submission cannot replace another submission';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.tenancy_document_submissions
  where request_id = p_request_id;

  insert into public.tenancy_document_submissions (
    request_id,
    document_id,
    version,
    replaces_submission_id,
    submitted_by,
    submitted_by_role,
    review_status,
    notice_version,
    notice_presented_at,
    idempotency_key
  ) values (
    p_request_id,
    p_document_id,
    next_version,
    p_replaces_submission_id,
    p_actor_id,
    actor_role,
    'pending_review',
    p_notice_version,
    p_notice_presented_at,
    p_idempotency_key
  )
  returning * into created_row;

  if p_replaces_submission_id is not null then
    update public.tenancy_document_submissions
    set review_status = 'superseded'
    where id = p_replaces_submission_id;
  end if;

  update public.tenancy_document_requests
  set status = 'submitted',
      current_submission_id = created_row.id,
      updated_at = now()
  where id = p_request_id;

  insert into public.tenancy_document_request_events (
    request_id,
    submission_id,
    actor_id,
    event_type
  ) values (
    p_request_id,
    created_row.id,
    p_actor_id,
    case
      when p_replaces_submission_id is null then 'tenant_submitted'
      else 'replacement_submitted'
    end
  );

  insert into public.tenancy_document_events (
    document_id,
    tenancy_id,
    actor_id,
    event_type,
    metadata
  ) values (
    p_document_id,
    request_row.tenancy_id,
    p_actor_id,
    'request_uploaded',
    jsonb_build_object(
      'request_id', p_request_id,
      'submission_id', created_row.id,
      'version', created_row.version
    )
  );

  return created_row;
end;
$$;

create or replace function public.decide_tenancy_document_submission(
  p_request_id uuid,
  p_submission_id uuid,
  p_landlord_id uuid,
  p_decision text,
  p_reason_code text,
  p_comment text,
  p_idempotency_key text
)
returns public.tenancy_document_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.tenancy_document_requests%rowtype;
  submission_row public.tenancy_document_submissions%rowtype;
  policy_row public.tenancy_document_processing_policies%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
  anchor_at timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_landlord_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_landlord_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> 'review_submission'
       or transition_row.scope_id <> p_submission_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into submission_row
    from public.tenancy_document_submissions
    where id = transition_row.result_id;
    return submission_row;
  end if;

  if p_decision not in ('accepted', 'changes_requested') then
    raise exception 'Invalid review decision';
  end if;
  if p_decision = 'changes_requested'
     and p_reason_code not in (
       'incorrect_document', 'incomplete', 'illegible', 'expired', 'other'
     ) then
    raise exception 'A valid reason is required';
  end if;
  if p_comment is not null and length(p_comment) > 500 then
    raise exception 'Review comment is too long';
  end if;

  select * into request_row
  from public.tenancy_document_requests
  where id = p_request_id
    and landlord_id = p_landlord_id
    and status = 'submitted'
    and current_submission_id = p_submission_id
  for update;
  if not found then
    raise exception 'Current submitted request not found';
  end if;

  select * into submission_row
  from public.tenancy_document_submissions
  where id = p_submission_id
    and request_id = p_request_id
    and review_status = 'pending_review'
  for update;
  if not found then
    raise exception 'Current pending submission not found';
  end if;

  select * into policy_row
  from public.tenancy_document_processing_policies
  where version = request_row.processing_policy_version;

  if p_decision = 'accepted' then
    anchor_at := case policy_row.retention_anchor
      when 'request_closed' then now()
      when 'tenancy_ended' then (
        select ended_at
        from public.tenancies
        where id = request_row.tenancy_id and ended_at is not null
      )
      else null
    end;
  end if;

  update public.tenancy_document_submissions
  set review_status = p_decision,
      decided_by = p_landlord_id,
      decided_at = now(),
      retention_anchor_at = anchor_at
  where id = p_submission_id
  returning * into submission_row;

  update public.tenancy_document_requests
  set status = p_decision,
      closed_at = case when p_decision = 'accepted' then now() else null end,
      updated_at = now()
  where id = p_request_id;

  if p_decision = 'accepted' and anchor_at is not null then
    update public.tenancy_document_submissions
    set retention_anchor_at = anchor_at
    where request_id = p_request_id and retention_anchor_at is null;
    update public.tenancy_documents d
    set retain_until = anchor_at::date + policy_row.retention_days
    from public.tenancy_document_submissions s
    where s.request_id = p_request_id and s.document_id = d.id;
  end if;

  insert into public.tenancy_document_request_events (
    request_id,
    submission_id,
    actor_id,
    event_type,
    reason_code,
    comment
  ) values (
    p_request_id,
    p_submission_id,
    p_landlord_id,
    p_decision,
    p_reason_code,
    p_comment
  );

  insert into public.tenancy_document_transition_keys (
    actor_id,
    idempotency_key,
    operation,
    scope_id,
    result_id
  ) values (
    p_landlord_id,
    p_idempotency_key,
    'review_submission',
    p_submission_id,
    submission_row.id
  );

  return submission_row;
end;
$$;

create or replace function public.apply_tenancy_document_hold(
  p_document_id uuid,
  p_actor_id uuid,
  p_reason_code text,
  p_external_reference text,
  p_idempotency_key text
)
returns public.tenancy_document_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.tenancy_documents%rowtype;
  hold_row public.tenancy_document_holds%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> 'apply_hold'
       or transition_row.scope_id <> p_document_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into hold_row
    from public.tenancy_document_holds
    where id = transition_row.result_id;
    return hold_row;
  end if;

  select * into document_row
  from public.tenancy_documents
  where id = p_document_id and deleted_at is null and purged_at is null
  for update;
  if not found then
    raise exception 'Available document not found';
  end if;

  insert into public.tenancy_document_holds (
    document_id,
    reason_code,
    external_reference,
    applied_by
  ) values (
    p_document_id,
    p_reason_code,
    nullif(trim(p_external_reference), ''),
    p_actor_id
  )
  returning * into hold_row;

  update public.tenancy_documents
  set legal_hold = true
  where id = p_document_id;

  insert into public.tenancy_document_events (
    document_id,
    tenancy_id,
    actor_id,
    event_type,
    metadata
  ) values (
    p_document_id,
    document_row.tenancy_id,
    p_actor_id,
    'legal_hold_applied',
    jsonb_build_object('hold_id', hold_row.id, 'reason_code', p_reason_code)
  );
  insert into public.tenancy_document_transition_keys (
    actor_id, idempotency_key, operation, scope_id, result_id
  ) values (
    p_actor_id, p_idempotency_key, 'apply_hold', p_document_id, hold_row.id
  );
  return hold_row;
end;
$$;

create or replace function public.release_tenancy_document_hold(
  p_hold_id uuid,
  p_actor_id uuid,
  p_release_reason text,
  p_idempotency_key text
)
returns public.tenancy_document_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  hold_row public.tenancy_document_holds%rowtype;
  document_row public.tenancy_documents%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> 'release_hold'
       or transition_row.scope_id <> p_hold_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into hold_row
    from public.tenancy_document_holds
    where id = transition_row.result_id;
    return hold_row;
  end if;

  select * into hold_row
  from public.tenancy_document_holds
  where id = p_hold_id and released_at is null
  for update;
  if not found then
    raise exception 'Active hold not found';
  end if;
  if hold_row.reason_code = 'privacy_request'
     and exists (
       select 1
       from public.tenancy_privacy_requests pr
       where pr.id::text = hold_row.external_reference
         and pr.status = 'restricted'
     ) then
    raise exception 'Restricted privacy case must be resolved before hold release';
  end if;

  update public.tenancy_document_holds
  set released_by = p_actor_id,
      released_at = now(),
      release_reason = trim(p_release_reason)
  where id = p_hold_id
  returning * into hold_row;

  update public.tenancy_documents
  set legal_hold = exists (
    select 1
    from public.tenancy_document_holds
    where document_id = hold_row.document_id and released_at is null
  )
  where id = hold_row.document_id
  returning * into document_row;

  insert into public.tenancy_document_events (
    document_id,
    tenancy_id,
    actor_id,
    event_type,
    metadata
  ) values (
    hold_row.document_id,
    document_row.tenancy_id,
    p_actor_id,
    'legal_hold_released',
    jsonb_build_object('hold_id', hold_row.id)
  );
  insert into public.tenancy_document_transition_keys (
    actor_id, idempotency_key, operation, scope_id, result_id
  ) values (
    p_actor_id, p_idempotency_key, 'release_hold', p_hold_id, hold_row.id
  );
  return hold_row;
end;
$$;

create or replace function public.create_tenancy_privacy_request(
  p_tenancy_id uuid,
  p_data_subject_id uuid,
  p_request_type text,
  p_privacy_policy_version text,
  p_idempotency_key text
)
returns public.tenancy_privacy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  tenancy_row public.tenancies%rowtype;
  policy_row public.tenancy_privacy_case_policies%rowtype;
  created_row public.tenancy_privacy_requests%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_data_subject_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_data_subject_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> 'create_privacy_request'
       or transition_row.scope_id <> p_tenancy_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into created_row
    from public.tenancy_privacy_requests
    where id = transition_row.result_id;
    return created_row;
  end if;

  select * into tenancy_row
  from public.tenancies
  where id = p_tenancy_id and tenant_user_id = p_data_subject_id;
  if not found then
    raise exception 'Linked tenancy not found';
  end if;

  select * into policy_row
  from public.tenancy_privacy_case_policies
  where version = p_privacy_policy_version
    and approved_at <= now()
    and effective_at <= now()
    and (retired_at is null or retired_at > now());
  if not found then
    raise exception 'Approved privacy-case policy not found';
  end if;

  insert into public.tenancy_privacy_requests (
    tenancy_id,
    landlord_id,
    data_subject_id,
    request_type,
    privacy_policy_version,
    notice_presented_at,
    due_on
  ) values (
    p_tenancy_id,
    tenancy_row.landlord_id,
    p_data_subject_id,
    p_request_type,
    p_privacy_policy_version,
    now(),
    current_date + policy_row.response_days
  )
  returning * into created_row;

  insert into public.tenancy_privacy_request_events (
    privacy_request_id,
    actor_id,
    event_type
  ) values (
    created_row.id,
    p_data_subject_id,
    'received'
  );
  insert into public.tenancy_document_transition_keys (
    actor_id,
    idempotency_key,
    operation,
    scope_id,
    result_id
  ) values (
    p_data_subject_id,
    p_idempotency_key,
    'create_privacy_request',
    p_tenancy_id,
    created_row.id
  );
  return created_row;
end;
$$;

create or replace function public.update_tenancy_privacy_request(
  p_privacy_request_id uuid,
  p_actor_id uuid,
  p_status text,
  p_outcome_code text,
  p_idempotency_key text
)
returns public.tenancy_privacy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.tenancy_privacy_requests%rowtype;
  event_name text;
  linked_document_id uuid;
  created_hold_id uuid;
  transition_row public.tenancy_document_transition_keys%rowtype;
  document_tenancy_id uuid;
  affected_rows integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> ('update_privacy_' || p_status)
       or transition_row.scope_id <> p_privacy_request_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into updated_row
    from public.tenancy_privacy_requests
    where id = transition_row.result_id;
    return updated_row;
  end if;

  if p_status not in (
    'identity_check', 'in_review', 'restricted', 'completed', 'refused'
  ) then
    raise exception 'Invalid privacy request status';
  end if;

  event_name := case p_status
    when 'identity_check' then 'scope_confirmed'
    when 'in_review' then 'scope_confirmed'
    when 'restricted' then 'restricted'
    when 'completed' then 'completed'
    when 'refused' then 'decision_recorded'
  end;

  update public.tenancy_privacy_requests
  set status = p_status,
      completed_at = case
        when p_status in ('completed', 'refused') then now()
        else null
      end,
      outcome_code = nullif(trim(p_outcome_code), ''),
      updated_at = now()
  where id = p_privacy_request_id
    and status not in ('completed', 'refused')
    and (p_status = 'identity_check' or identity_verified_at is not null)
  returning * into updated_row;
  if not found then
    raise exception 'Open privacy request not found';
  end if;

  insert into public.tenancy_privacy_request_events (
    privacy_request_id,
    actor_id,
    event_type,
    reason_code
  ) values (
    p_privacy_request_id,
    p_actor_id,
    event_name,
    nullif(trim(p_outcome_code), '')
  );

  if p_status = 'restricted' then
    for linked_document_id in
      select document_id
      from public.tenancy_privacy_request_documents
      where privacy_request_id = p_privacy_request_id
        and relation_type in ('restricted', 'erasure_review')
      order by document_id
    loop
      select tenancy_id into document_tenancy_id
      from public.tenancy_documents
      where id = linked_document_id;
      perform pg_advisory_xact_lock(
        hashtextextended('tenancy-doc-scope:' || document_tenancy_id::text, 0)
      );
      perform 1
      from public.tenancy_documents
      where id = linked_document_id
        and deleted_at is null
        and purged_at is null
      for update;
      if not found then
        raise exception 'Available document could not be restricted';
      end if;
      created_hold_id := null;
      insert into public.tenancy_document_holds (
        document_id,
        reason_code,
        external_reference,
        applied_by
      )
      select
        linked_document_id,
        'privacy_request',
        p_privacy_request_id::text,
        p_actor_id
      where not exists (
        select 1
        from public.tenancy_document_holds
        where document_id = linked_document_id and released_at is null
      )
      returning id into created_hold_id;

      update public.tenancy_documents
      set legal_hold = true
      where id = linked_document_id
        and deleted_at is null
        and purged_at is null;
      get diagnostics affected_rows = row_count;
      if affected_rows <> 1 then
        raise exception 'Available document could not be restricted';
      end if;

      if created_hold_id is not null then
        insert into public.tenancy_document_events (
          document_id,
          tenancy_id,
          actor_id,
          event_type,
          metadata
        )
        select
          d.id,
          d.tenancy_id,
          p_actor_id,
          'legal_hold_applied',
          jsonb_build_object(
            'hold_id', created_hold_id,
            'reason_code', 'privacy_request'
          )
        from public.tenancy_documents d
        where d.id = linked_document_id;
      end if;
    end loop;
  end if;
  insert into public.tenancy_document_transition_keys (
    actor_id, idempotency_key, operation, scope_id, result_id
  ) values (
    p_actor_id,
    p_idempotency_key,
    'update_privacy_' || p_status,
    p_privacy_request_id,
    updated_row.id
  );
  return updated_row;
end;
$$;

create or replace function public.verify_tenancy_privacy_request_identity(
  p_privacy_request_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
returns public.tenancy_privacy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.tenancy_privacy_requests%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> 'verify_privacy_identity'
       or transition_row.scope_id <> p_privacy_request_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into updated_row
    from public.tenancy_privacy_requests
    where id = transition_row.result_id;
    return updated_row;
  end if;

  update public.tenancy_privacy_requests
  set status = 'in_review',
      identity_verified_at = now(),
      updated_at = now()
  where id = p_privacy_request_id
    and status in ('received', 'identity_check')
    and identity_verified_at is null
  returning * into updated_row;
  if not found then
    raise exception 'Privacy request is not awaiting identity verification';
  end if;

  insert into public.tenancy_privacy_request_events (
    privacy_request_id,
    actor_id,
    event_type
  ) values (
    p_privacy_request_id,
    p_actor_id,
    'identity_verified'
  );
  insert into public.tenancy_document_transition_keys (
    actor_id, idempotency_key, operation, scope_id, result_id
  ) values (
    p_actor_id,
    p_idempotency_key,
    'verify_privacy_identity',
    p_privacy_request_id,
    updated_row.id
  );
  return updated_row;
end;
$$;

create or replace function public.link_tenancy_privacy_request_document(
  p_privacy_request_id uuid,
  p_document_id uuid,
  p_actor_id uuid,
  p_relation_type text,
  p_idempotency_key text
)
returns public.tenancy_privacy_request_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  privacy_row public.tenancy_privacy_requests%rowtype;
  linked_row public.tenancy_privacy_request_documents%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
  created_hold_id uuid;
  document_tenancy_id uuid;
  affected_rows integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> ('link_privacy_' || p_relation_type)
       or transition_row.scope_id <> p_privacy_request_id
       or transition_row.result_id <> p_document_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into linked_row
    from public.tenancy_privacy_request_documents
    where privacy_request_id = p_privacy_request_id
      and document_id = p_document_id
      and relation_type = p_relation_type;
    return linked_row;
  end if;

  select * into privacy_row
  from public.tenancy_privacy_requests
  where id = p_privacy_request_id and status not in ('completed', 'refused')
  for update;
  if not found then
    raise exception 'Open privacy request not found';
  end if;
  select tenancy_id into document_tenancy_id
  from public.tenancy_documents
  where id = p_document_id;
  perform pg_advisory_xact_lock(
    hashtextextended('tenancy-doc-scope:' || document_tenancy_id::text, 0)
  );
  select d.tenancy_id into document_tenancy_id
  from public.tenancy_documents d
  where d.id = p_document_id
    and d.landlord_id = privacy_row.landlord_id
    and d.deleted_at is null
    and d.purged_at is null
    and (
      privacy_row.tenancy_id is null
      or d.tenancy_id = privacy_row.tenancy_id
    )
  for update;
  if not found then
    raise exception 'Document is outside the privacy request scope';
  end if;

  insert into public.tenancy_privacy_request_documents (
    privacy_request_id,
    document_id,
    relation_type,
    created_by
  ) values (
    p_privacy_request_id,
    p_document_id,
    p_relation_type,
    p_actor_id
  )
  on conflict (privacy_request_id, document_id, relation_type)
  do nothing;

  select * into linked_row
  from public.tenancy_privacy_request_documents
  where privacy_request_id = p_privacy_request_id
    and document_id = p_document_id
    and relation_type = p_relation_type;

  if privacy_row.status = 'restricted'
     and p_relation_type in ('restricted', 'erasure_review') then
    insert into public.tenancy_document_holds (
      document_id,
      reason_code,
      external_reference,
      applied_by
    )
    select
      p_document_id,
      'privacy_request',
      p_privacy_request_id::text,
      p_actor_id
    where not exists (
      select 1
      from public.tenancy_document_holds
      where document_id = p_document_id and released_at is null
    )
    returning id into created_hold_id;

    update public.tenancy_documents
    set legal_hold = true
    where id = p_document_id and deleted_at is null and purged_at is null;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception 'Available document could not be restricted';
    end if;

    if created_hold_id is not null then
      insert into public.tenancy_document_events (
        document_id,
        tenancy_id,
        actor_id,
        event_type,
        metadata
      )
      select
        d.id,
        d.tenancy_id,
        p_actor_id,
        'legal_hold_applied',
        jsonb_build_object(
          'hold_id', created_hold_id,
          'reason_code', 'privacy_request'
        )
      from public.tenancy_documents d
      where d.id = p_document_id;
    end if;
  end if;

  insert into public.tenancy_privacy_request_events (
    privacy_request_id,
    actor_id,
    event_type
  ) values (
    p_privacy_request_id,
    p_actor_id,
    'scope_confirmed'
  );
  insert into public.tenancy_document_transition_keys (
    actor_id, idempotency_key, operation, scope_id, result_id
  ) values (
    p_actor_id,
    p_idempotency_key,
    'link_privacy_' || p_relation_type,
    p_privacy_request_id,
    p_document_id
  );
  return linked_row;
end;
$$;

create or replace function public.claim_tenancy_document_deletion(
  p_document_id uuid,
  p_landlord_id uuid,
  p_deleted_at timestamptz
)
returns public.tenancy_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row public.tenancy_documents%rowtype;
  scope_tenancy_id uuid;
begin
  select tenancy_id into scope_tenancy_id
  from public.tenancy_documents
  where id = p_document_id;
  perform pg_advisory_xact_lock(
    hashtextextended('tenancy-doc-scope:' || scope_tenancy_id::text, 0)
  );
  update public.tenancy_documents d
  set deleted_at = p_deleted_at,
      deleted_by = p_landlord_id,
      deletion_evidence_pending = true
  where d.id = p_document_id
    and d.landlord_id = p_landlord_id
    and d.deleted_at is null
    and d.purged_at is null
    and d.retain_until is not null
    and d.retain_until <= current_date
    and d.legal_hold = false
    and not exists (
      select 1
      from public.tenancy_document_holds h
      where h.document_id = d.id and h.released_at is null
    )
    and not exists (
      select 1
      from public.tenancies t
      where t.id = d.tenancy_id and t.status = 'active'
    )
    and not exists (
      select 1
      from public.tenancy_document_submissions s
      join public.tenancy_document_requests r on r.id = s.request_id
      where s.document_id = d.id
        and r.status in ('open', 'submitted', 'changes_requested')
    )
    and not exists (
      select 1
      from public.tenancy_privacy_request_documents pd
      join public.tenancy_privacy_requests pr
        on pr.id = pd.privacy_request_id
      where pd.document_id = d.id
        and pd.relation_type in ('restricted', 'erasure_review')
        and pr.status not in ('completed', 'refused')
    )
  returning d.* into claimed_row;

  if claimed_row.id is not null then
    insert into public.tenancy_document_events (
      document_id, tenancy_id, actor_id, event_type, metadata
    ) values (
      claimed_row.id,
      claimed_row.tenancy_id,
      p_landlord_id,
      'delete_started',
      '{}'::jsonb
    );
  end if;
  return claimed_row;
end;
$$;

create or replace function public.claim_tenancy_document_purge(
  p_document_id uuid,
  p_purged_at timestamptz
)
returns public.tenancy_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row public.tenancy_documents%rowtype;
  scope_tenancy_id uuid;
begin
  select tenancy_id into scope_tenancy_id
  from public.tenancy_documents
  where id = p_document_id;
  perform pg_advisory_xact_lock(
    hashtextextended('tenancy-doc-scope:' || scope_tenancy_id::text, 0)
  );
  update public.tenancy_documents d
  set purged_at = p_purged_at,
      deleted_at = coalesce(d.deleted_at, p_purged_at),
      purge_evidence_pending = true
  where d.id = p_document_id
    and d.purged_at is null
    and d.retain_until is not null
    and d.retain_until < current_date
    and d.legal_hold = false
    and not exists (
      select 1
      from public.tenancy_document_holds h
      where h.document_id = d.id and h.released_at is null
    )
    and not exists (
      select 1
      from public.tenancies t
      where t.id = d.tenancy_id and t.status = 'active'
    )
    and not exists (
      select 1
      from public.tenancy_document_submissions s
      join public.tenancy_document_requests r on r.id = s.request_id
      where s.document_id = d.id
        and r.status in ('open', 'submitted', 'changes_requested')
    )
    and not exists (
      select 1
      from public.tenancy_privacy_request_documents pd
      join public.tenancy_privacy_requests pr
        on pr.id = pd.privacy_request_id
      where pd.document_id = d.id
        and pd.relation_type in ('restricted', 'erasure_review')
        and pr.status not in ('completed', 'refused')
    )
  returning d.* into claimed_row;
  if claimed_row.id is not null then
    insert into public.tenancy_document_events (
      document_id, tenancy_id, actor_id, event_type, metadata
    ) values (
      claimed_row.id,
      claimed_row.tenancy_id,
      null,
      'purge_started',
      jsonb_build_object('retain_until', claimed_row.retain_until)
    );
  end if;
  return claimed_row;
end;
$$;

create or replace function public.complete_tenancy_document_storage_operation(
  p_document_id uuid,
  p_operation text,
  p_actor_id uuid
)
returns public.tenancy_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.tenancy_documents%rowtype;
begin
  select * into document_row
  from public.tenancy_documents
  where id = p_document_id
  for update;
  if not found then
    raise exception 'Document not found';
  end if;

  if p_operation = 'delete' and document_row.deletion_evidence_pending then
    insert into public.tenancy_document_events (
      document_id, tenancy_id, actor_id, event_type, metadata
    ) values (
      document_row.id, document_row.tenancy_id, p_actor_id, 'deleted', '{}'::jsonb
    );
    update public.tenancy_documents
    set deletion_evidence_pending = false
    where id = p_document_id
    returning * into document_row;
  elsif p_operation = 'purge' and document_row.purge_evidence_pending then
    insert into public.tenancy_document_events (
      document_id, tenancy_id, actor_id, event_type, metadata
    ) values (
      document_row.id,
      document_row.tenancy_id,
      p_actor_id,
      'purged',
      jsonb_build_object('retain_until', document_row.retain_until)
    );
    update public.tenancy_documents
    set purge_evidence_pending = false
    where id = p_document_id
    returning * into document_row;
  elsif p_operation = 'orphan_cleanup' and document_row.orphan_cleanup_pending then
    insert into public.tenancy_document_events (
      document_id, tenancy_id, actor_id, event_type, metadata
    ) values (
      document_row.id,
      document_row.tenancy_id,
      coalesce(p_actor_id, document_row.uploaded_by),
      'orphan_cleaned',
      jsonb_build_object('reason_code', 'idempotency_loser')
    );
    update public.tenancy_documents
    set orphan_cleanup_pending = false,
        purged_at = coalesce(purged_at, now()),
        deleted_at = coalesce(deleted_at, now())
    where id = p_document_id
    returning * into document_row;
  else
    raise exception 'Storage operation is not awaiting completion evidence';
  end if;
  return document_row;
end;
$$;

create or replace function public.record_tenancy_privacy_request_evidence(
  p_privacy_request_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_reason_code text,
  p_idempotency_key text
)
returns public.tenancy_privacy_request_events
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.tenancy_privacy_request_events%rowtype;
  transition_row public.tenancy_document_transition_keys%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into transition_row
  from public.tenancy_document_transition_keys
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if transition_row.operation <> ('privacy_evidence_' || p_event_type)
       or transition_row.scope_id <> p_privacy_request_id then
      raise exception 'Idempotency key was used for another transition';
    end if;
    select * into event_row
    from public.tenancy_privacy_request_events
    where id = transition_row.result_id;
    return event_row;
  end if;
  if p_event_type not in ('scope_confirmed', 'export_prepared', 'decision_recorded')
     or length(coalesce(p_reason_code, '')) > 80 then
    raise exception 'Invalid privacy evidence event';
  end if;
  if not exists (
    select 1
    from public.tenancy_privacy_requests
    where id = p_privacy_request_id
  ) then
    raise exception 'Privacy request not found';
  end if;

  insert into public.tenancy_privacy_request_events (
    privacy_request_id,
    actor_id,
    event_type,
    reason_code
  ) values (
    p_privacy_request_id,
    p_actor_id,
    p_event_type,
    nullif(trim(p_reason_code), '')
  )
  returning * into event_row;

  insert into public.tenancy_document_transition_keys (
    actor_id, idempotency_key, operation, scope_id, result_id
  ) values (
    p_actor_id,
    p_idempotency_key,
    'privacy_evidence_' || p_event_type,
    p_privacy_request_id,
    event_row.id
  );
  return event_row;
end;
$$;

revoke all on function public.create_tenancy_document_request(
  uuid, uuid, text, text, text, text, date, text
) from public, anon, authenticated;
grant execute on function public.create_tenancy_document_request(
  uuid, uuid, text, text, text, text, date, text
) to service_role;

revoke all on function public.cancel_tenancy_document_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_tenancy_document_request(uuid, uuid, text)
  to service_role;

revoke all on function public.create_tenancy_document_submission(
  uuid, uuid, uuid, text, timestamptz, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_tenancy_document_submission(
  uuid, uuid, uuid, text, timestamptz, uuid, text
) to service_role;

revoke all on function public.decide_tenancy_document_submission(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.decide_tenancy_document_submission(
  uuid, uuid, uuid, text, text, text, text
) to service_role;

revoke all on function public.apply_tenancy_document_hold(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_tenancy_document_hold(
  uuid, uuid, text, text, text
) to service_role;

revoke all on function public.release_tenancy_document_hold(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.release_tenancy_document_hold(
  uuid, uuid, text, text
) to service_role;

revoke all on function public.create_tenancy_privacy_request(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_tenancy_privacy_request(
  uuid, uuid, text, text, text
) to service_role;

revoke all on function public.update_tenancy_privacy_request(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_tenancy_privacy_request(
  uuid, uuid, text, text, text
) to service_role;

revoke all on function public.verify_tenancy_privacy_request_identity(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.verify_tenancy_privacy_request_identity(
  uuid, uuid, text
) to service_role;

revoke all on function public.link_tenancy_privacy_request_document(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.link_tenancy_privacy_request_document(
  uuid, uuid, uuid, text, text
) to service_role;

revoke all on function public.claim_tenancy_document_purge(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_tenancy_document_purge(uuid, timestamptz)
  to service_role;

revoke all on function public.claim_tenancy_document_deletion(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_tenancy_document_deletion(
  uuid, uuid, timestamptz
) to service_role;

revoke all on function public.complete_tenancy_document_storage_operation(
  uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.complete_tenancy_document_storage_operation(
  uuid, text, uuid
) to service_role;

revoke all on function public.record_tenancy_privacy_request_evidence(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_tenancy_privacy_request_evidence(
  uuid, uuid, text, text, text
) to service_role;

alter table public.tenancy_document_processing_policies enable row level security;
alter table public.tenancy_privacy_case_policies enable row level security;
alter table public.tenancy_document_requests enable row level security;
alter table public.tenancy_document_submissions enable row level security;
alter table public.tenancy_document_request_events enable row level security;
alter table public.tenancy_document_transition_keys enable row level security;
alter table public.tenancy_document_holds enable row level security;
alter table public.tenancy_privacy_requests enable row level security;
alter table public.tenancy_privacy_request_events enable row level security;
alter table public.tenancy_privacy_request_documents enable row level security;

revoke insert, update, delete
  on public.tenancy_document_processing_policies,
     public.tenancy_privacy_case_policies,
     public.tenancy_document_requests,
     public.tenancy_document_submissions,
     public.tenancy_document_request_events,
     public.tenancy_document_transition_keys,
     public.tenancy_document_holds,
     public.tenancy_privacy_requests,
     public.tenancy_privacy_request_events,
     public.tenancy_privacy_request_documents
  from anon, authenticated;

drop policy if exists tenancy_doc_policies_authenticated_select
  on public.tenancy_document_processing_policies;
create policy tenancy_doc_policies_authenticated_select
  on public.tenancy_document_processing_policies
  for select to authenticated
  using (
    approved_at <= now()
    and effective_at <= now()
    and (retired_at is null or retired_at > now())
  );

drop policy if exists tenancy_privacy_case_policies_authenticated_select
  on public.tenancy_privacy_case_policies;
create policy tenancy_privacy_case_policies_authenticated_select
  on public.tenancy_privacy_case_policies
  for select to authenticated
  using (
    approved_at <= now()
    and effective_at <= now()
    and (retired_at is null or retired_at > now())
  );

drop policy if exists tenancy_doc_requests_landlord_select
  on public.tenancy_document_requests;
create policy tenancy_doc_requests_landlord_select
  on public.tenancy_document_requests
  for select to authenticated
  using (landlord_id = auth.uid());

drop policy if exists tenancy_doc_requests_tenant_select
  on public.tenancy_document_requests;
create policy tenancy_doc_requests_tenant_select
  on public.tenancy_document_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancies t
      where t.id = tenancy_document_requests.tenancy_id
        and t.tenant_user_id = auth.uid()
        and t.status in ('draft', 'pending_verification')
    )
  );

drop policy if exists tenancy_doc_submissions_landlord_select
  on public.tenancy_document_submissions;
create policy tenancy_doc_submissions_landlord_select
  on public.tenancy_document_submissions
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_document_requests r
      where r.id = tenancy_document_submissions.request_id
        and r.landlord_id = auth.uid()
    )
  );

drop policy if exists tenancy_doc_submissions_tenant_select
  on public.tenancy_document_submissions;
create policy tenancy_doc_submissions_tenant_select
  on public.tenancy_document_submissions
  for select to authenticated
  using (submitted_by = auth.uid());

drop policy if exists tenancy_doc_request_events_landlord_select
  on public.tenancy_document_request_events;
create policy tenancy_doc_request_events_landlord_select
  on public.tenancy_document_request_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_document_requests r
      where r.id = tenancy_document_request_events.request_id
        and r.landlord_id = auth.uid()
    )
  );

drop policy if exists tenancy_doc_request_events_tenant_select
  on public.tenancy_document_request_events;
create policy tenancy_doc_request_events_tenant_select
  on public.tenancy_document_request_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_document_requests r
      join public.tenancies t on t.id = r.tenancy_id
      where r.id = tenancy_document_request_events.request_id
        and t.tenant_user_id = auth.uid()
        and t.status in ('draft', 'pending_verification')
    )
  );

drop policy if exists tenancy_document_holds_landlord_select
  on public.tenancy_document_holds;
create policy tenancy_document_holds_landlord_select
  on public.tenancy_document_holds
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_documents d
      where d.id = tenancy_document_holds.document_id
        and d.landlord_id = auth.uid()
    )
  );

drop policy if exists tenancy_privacy_requests_subject_select
  on public.tenancy_privacy_requests;
create policy tenancy_privacy_requests_subject_select
  on public.tenancy_privacy_requests
  for select to authenticated
  using (data_subject_id = auth.uid());

drop policy if exists tenancy_privacy_requests_landlord_select
  on public.tenancy_privacy_requests;
create policy tenancy_privacy_requests_landlord_select
  on public.tenancy_privacy_requests
  for select to authenticated
  using (landlord_id = auth.uid());

drop policy if exists tenancy_privacy_request_events_subject_select
  on public.tenancy_privacy_request_events;
create policy tenancy_privacy_request_events_subject_select
  on public.tenancy_privacy_request_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_privacy_requests p
      where p.id = tenancy_privacy_request_events.privacy_request_id
        and p.data_subject_id = auth.uid()
    )
  );

drop policy if exists tenancy_privacy_request_events_landlord_select
  on public.tenancy_privacy_request_events;
create policy tenancy_privacy_request_events_landlord_select
  on public.tenancy_privacy_request_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_privacy_requests p
      where p.id = tenancy_privacy_request_events.privacy_request_id
        and p.landlord_id = auth.uid()
    )
  );

drop policy if exists tenancy_privacy_request_documents_landlord_select
  on public.tenancy_privacy_request_documents;
create policy tenancy_privacy_request_documents_landlord_select
  on public.tenancy_privacy_request_documents
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_privacy_requests p
      where p.id = tenancy_privacy_request_documents.privacy_request_id
        and p.landlord_id = auth.uid()
    )
  );

drop policy if exists tenancy_privacy_request_documents_subject_select
  on public.tenancy_privacy_request_documents;
create policy tenancy_privacy_request_documents_subject_select
  on public.tenancy_privacy_request_documents
  for select to authenticated
  using (
    exists (
      select 1
      from public.tenancy_privacy_requests p
      where p.id = tenancy_privacy_request_documents.privacy_request_id
        and p.data_subject_id = auth.uid()
    )
  );

comment on table public.tenancy_document_processing_policies is
  'Immutable counsel/DPO-approved purpose, notice and retention versions.';
comment on table public.tenancy_document_request_events is
  'Append-only request, review, notice and disclosure evidence.';
comment on table public.tenancy_privacy_requests is
  'Reviewed NDPA rights-case projection; never an automatic erasure instruction.';
