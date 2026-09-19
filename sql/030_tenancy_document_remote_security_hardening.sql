-- Security follow-up for tenancy document migrations 028/029.
-- Trigger functions are invoked by Postgres and must not be callable as RPCs.

alter function public.prevent_acknowledgment_mutation()
  set search_path = public;
alter function public.prevent_tenancy_evidence_mutation()
  set search_path = public;
alter function public.allow_policy_retirement_only()
  set search_path = public;
alter function public.validate_tenancy_document_hold_release()
  set search_path = public;
alter function public.prevent_legacy_document_ack_update()
  set search_path = public;

revoke execute on function public.anchor_tenancy_document_retention_on_end()
  from public, anon, authenticated;
revoke execute on function public.set_document_request_owner()
  from public, anon, authenticated;
revoke execute on function public.set_tenancy_document_event_tenancy()
  from public, anon, authenticated;
revoke execute on function public.set_tenancy_document_owner()
  from public, anon, authenticated;
revoke execute on function public.validate_document_acknowledgment()
  from public, anon, authenticated;

-- These flows are server-authoritative. RLS remains defense in depth, but the
-- browser roles must not retain TRUNCATE or other direct table privileges.
revoke all privileges
  on table public.tenancy_documents,
           public.tenancy_document_acknowledgments,
           public.tenancy_document_events,
           public.tenancy_document_processing_policies,
           public.tenancy_privacy_case_policies,
           public.tenancy_document_requests,
           public.tenancy_document_submissions,
           public.tenancy_document_request_events,
           public.tenancy_document_transition_keys,
           public.tenancy_document_holds,
           public.tenancy_privacy_requests,
           public.tenancy_privacy_request_events,
           public.tenancy_privacy_request_documents,
           public.tenancy_workflow_notification_deliveries
  from public, anon, authenticated;

