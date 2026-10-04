-- 047: Cover every remaining foreign key the Supabase advisor lists as unindexed.
-- Generated from pg_constraint on 2026-10-03 (51 keys). Without these, deleting a
-- parent row (user, tenancy, unit, document) scans each child table, and joins on
-- these columns cannot use an index. Tables are small, so plain CREATE INDEX.

create index if not exists access_pass_events_actor_user_id_fk_idx on public.access_pass_events (actor_user_id);
create index if not exists access_passes_created_by_fk_idx on public.access_passes (created_by);
create index if not exists access_passes_last_admitted_by_fk_idx on public.access_passes (last_admitted_by);
create index if not exists access_passes_unit_id_fk_idx on public.access_passes (unit_id);
create index if not exists audit_events_membership_id_fk_idx on public.audit_events (membership_id);
create index if not exists expenses_property_id_fk_idx on public.expenses (property_id);
create index if not exists expenses_unit_id_fk_idx on public.expenses (unit_id);
create index if not exists maintenance_requests_access_pass_id_fk_idx on public.maintenance_requests (access_pass_id);
create index if not exists message_threads_tenancy_id_fk_idx on public.message_threads (tenancy_id);
create index if not exists message_threads_unit_id_fk_idx on public.message_threads (unit_id);
create index if not exists messages_sender_id_fk_idx on public.messages (sender_id);
create index if not exists ops_tasks_created_by_fk_idx on public.ops_tasks (created_by);
create index if not exists ops_tasks_property_id_fk_idx on public.ops_tasks (property_id);
create index if not exists ops_tasks_tenancy_id_fk_idx on public.ops_tasks (tenancy_id);
create index if not exists ops_tasks_unit_id_fk_idx on public.ops_tasks (unit_id);
create index if not exists product_events_unit_id_fk_idx on public.product_events (unit_id);
create index if not exists publication_reads_user_id_fk_idx on public.publication_reads (user_id);
create index if not exists publications_property_id_fk_idx on public.publications (property_id);
create index if not exists rental_applications_applicant_user_id_fk_idx on public.rental_applications (applicant_user_id);
create index if not exists rental_applications_property_id_fk_idx on public.rental_applications (property_id);
create index if not exists scheduled_fees_tenancy_id_fk_idx on public.scheduled_fees (tenancy_id);
create index if not exists tenancies_autopay_payment_method_id_fk_idx on public.tenancies (autopay_payment_method_id);
create index if not exists tenancy_document_acknowledgments_actor_id_fk_idx on public.tenancy_document_acknowledgments (actor_id);
create index if not exists tenancy_document_acknowledgments_tenancy_id_fk_idx on public.tenancy_document_acknowledgments (tenancy_id);
create index if not exists tenancy_document_events_actor_id_fk_idx on public.tenancy_document_events (actor_id);
create index if not exists tenancy_document_events_document_id_fk_idx on public.tenancy_document_events (document_id);
create index if not exists tenancy_document_events_tenancy_id_fk_idx on public.tenancy_document_events (tenancy_id);
create index if not exists tenancy_document_holds_applied_by_fk_idx on public.tenancy_document_holds (applied_by);
create index if not exists tenancy_document_holds_released_by_fk_idx on public.tenancy_document_holds (released_by);
create index if not exists tenancy_document_request_events_actor_id_fk_idx on public.tenancy_document_request_events (actor_id);
create index if not exists tenancy_document_request_events_submission_id_fk_idx on public.tenancy_document_request_events (submission_id);
create index if not exists tenancy_document_requests_created_by_fk_idx on public.tenancy_document_requests (created_by);
create index if not exists tenancy_document_requests_current_submission_id_fk_idx on public.tenancy_document_requests (current_submission_id);
create index if not exists tenancy_document_requests_landlord_id_fk_idx on public.tenancy_document_requests (landlord_id);
create index if not exists tenancy_document_requests_processing_policy_version_fk_idx on public.tenancy_document_requests (processing_policy_version);
create index if not exists tenancy_document_submissions_decided_by_fk_idx on public.tenancy_document_submissions (decided_by);
create index if not exists tenancy_documents_acknowledged_by_fk_idx on public.tenancy_documents (acknowledged_by);
create index if not exists tenancy_documents_deleted_by_fk_idx on public.tenancy_documents (deleted_by);
create index if not exists tenancy_documents_landlord_id_fk_idx on public.tenancy_documents (landlord_id);
create index if not exists tenancy_documents_uploaded_by_fk_idx on public.tenancy_documents (uploaded_by);
create index if not exists tenancy_privacy_request_documents_created_by_fk_idx on public.tenancy_privacy_request_documents (created_by);
create index if not exists tenancy_privacy_request_documents_document_id_fk_idx on public.tenancy_privacy_request_documents (document_id);
create index if not exists tenancy_privacy_request_events_actor_id_fk_idx on public.tenancy_privacy_request_events (actor_id);
create index if not exists tenancy_privacy_request_events_privacy_request_id_fk_idx on public.tenancy_privacy_request_events (privacy_request_id);
create index if not exists tenancy_privacy_requests_data_subject_id_fk_idx on public.tenancy_privacy_requests (data_subject_id);
create index if not exists tenancy_privacy_requests_landlord_id_fk_idx on public.tenancy_privacy_requests (landlord_id);
create index if not exists tenancy_privacy_requests_privacy_policy_version_fk_idx on public.tenancy_privacy_requests (privacy_policy_version);
create index if not exists tenancy_privacy_requests_tenancy_id_fk_idx on public.tenancy_privacy_requests (tenancy_id);
create index if not exists tenancy_workflow_notification_deliveries_privacy_request_fk_idx on public.tenancy_workflow_notification_deliveries (privacy_request_id);
create index if not exists tenancy_workflow_notification_deliveries_request_id_fk_idx on public.tenancy_workflow_notification_deliveries (request_id);
create index if not exists transactions_initiator_user_id_fk_idx on public.transactions (initiator_user_id);
