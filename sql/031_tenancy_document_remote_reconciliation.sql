-- Reconciles the remotely applied 028/029 baseline without replaying it.
-- Local SHA-256:
-- 028: 69a0de96351e43ac51359937d7893e97258d452e25ef35057ea67d8d988f84e0
-- 029: 4897b02899300ab000642700d82a70bd0ec4f7593ac47709d2023f0bc022100b

do $$
declare
  missing text[];
begin
  select array_agg(name order by name)
  into missing
  from unnest(array[
    'tenancy_documents',
    'tenancy_document_acknowledgments',
    'tenancy_document_events',
    'tenancy_document_processing_policies',
    'tenancy_privacy_case_policies',
    'tenancy_document_requests',
    'tenancy_document_submissions',
    'tenancy_document_request_events',
    'tenancy_document_holds',
    'tenancy_privacy_requests',
    'tenancy_privacy_request_events',
    'tenancy_privacy_request_documents',
    'tenancy_document_transition_keys',
    'tenancy_workflow_notification_deliveries'
  ]::text[]) as expected(name)
  where to_regclass('public.' || name) is null;

  if missing is not null then
    raise exception '028/029 reconciliation failed; missing tables: %', missing;
  end if;

  if to_regprocedure(
    'public.create_tenancy_document_request(uuid,uuid,text,text,text,text,date,text)'
  ) is null
     or to_regprocedure(
       'public.create_tenancy_document_submission(uuid,uuid,uuid,text,timestamptz,uuid,text)'
     ) is null
     or to_regprocedure(
       'public.claim_tenancy_document_deletion(uuid,uuid,timestamptz)'
     ) is null
     or to_regprocedure(
       'public.claim_tenancy_document_purge(uuid,timestamptz)'
     ) is null then
    raise exception '028/029 reconciliation failed; required RPC missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenancy_documents'
      and column_name = 'orphan_cleanup_pending'
  ) then
    raise exception '028/029 reconciliation failed; current document columns missing';
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'tenancy-docs',
  'tenancy-docs',
  false,
  8388608,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

