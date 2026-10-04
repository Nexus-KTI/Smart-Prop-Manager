-- 051: RLS policies evaluate auth.uid() / auth.jwt() once per query, not once per row.
-- Generated from pg_policies on 2026-10-03 (84 advisor findings: auth_rls_initplan).
-- Each ALTER keeps the policy name, roles, and command; only the auth call is wrapped
-- in a scalar subselect so the planner runs it as an initplan.
--
-- properties / units / reminders / transactions each had an owner_* FOR ALL policy plus
-- four per-command "Owners ..." policies with the same condition. FOR ALL with no
-- WITH CHECK reuses USING for writes, so the per-command policies grant nothing extra.

drop policy if exists "Owners select properties" on public.properties;
drop policy if exists "Owners insert properties" on public.properties;
drop policy if exists "Owners update properties" on public.properties;
drop policy if exists "Owners delete properties" on public.properties;

drop policy if exists "Owners select units" on public.units;
drop policy if exists "Owners insert units" on public.units;
drop policy if exists "Owners update units" on public.units;
drop policy if exists "Owners delete units" on public.units;

drop policy if exists "Owners select reminders" on public.reminders;
drop policy if exists "Owners insert reminders" on public.reminders;
drop policy if exists "Owners update reminders" on public.reminders;
drop policy if exists "Owners delete reminders" on public.reminders;

drop policy if exists "Owners select transactions" on public.transactions;
drop policy if exists "Owners insert transactions" on public.transactions;
drop policy if exists "Owners update transactions" on public.transactions;
drop policy if exists "Owners delete transactions" on public.transactions;

alter policy access_passes_landlord_all on public.access_passes
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy access_passes_subject_select on public.access_passes
  using (((select auth.uid()) = subject_user_id));

alter policy access_passes_tenant_guest_insert on public.access_passes
  with check (((subject_type = 'guest'::text) AND (created_by = (select auth.uid())) AND (subject_user_id = (select auth.uid())) AND (status = 'active'::text) AND (unit_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM tenancies t
  WHERE ((t.unit_id = access_passes.unit_id) AND (t.tenant_user_id = (select auth.uid())) AND (t.landlord_id = access_passes.landlord_id) AND (t.status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM units u
  WHERE ((u.id = access_passes.unit_id) AND (u.property_id = access_passes.property_id))))));

alter policy access_passes_tenant_guest_revoke on public.access_passes
  using (((subject_type = 'guest'::text) AND (created_by = (select auth.uid()))))
  with check (((subject_type = 'guest'::text) AND (created_by = (select auth.uid())) AND (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text]))));

alter policy "Users can read own admin allowlist row" on public.admin_allowlist
  using ((lower(email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text))));

alter policy artisan_profiles_landlord_select on public.artisan_profiles
  using ((EXISTS ( SELECT 1
   FROM landlord_artisans la
  WHERE ((la.artisan_user_id = artisan_profiles.user_id) AND (la.landlord_id = (select auth.uid())) AND (la.status = 'active'::text)))));

alter policy artisan_profiles_self_all on public.artisan_profiles
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy audit_events_owner_select on public.audit_events
  using ((((select auth.uid()) = owner_id) OR ((select auth.uid()) = actor_user_id)));

alter policy expenses_landlord_all on public.expenses
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy landlord_artisans_artisan_claim_update on public.landlord_artisans
  using (((status = 'invited'::text) AND ((artisan_user_id IS NULL) OR (artisan_user_id = (select auth.uid())))))
  with check (((select auth.uid()) = artisan_user_id));

alter policy landlord_artisans_artisan_select on public.landlord_artisans
  using (((select auth.uid()) = artisan_user_id));

alter policy landlord_artisans_landlord_all on public.landlord_artisans
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy landlord_connect_requests_tenant_all on public.landlord_connect_requests
  using (((select auth.uid()) = tenant_user_id))
  with check (((select auth.uid()) = tenant_user_id));

alter policy maintenance_requests_artisan_complete on public.maintenance_requests
  using (((select auth.uid()) = artisan_user_id))
  with check (((select auth.uid()) = artisan_user_id));

alter policy maintenance_requests_artisan_select on public.maintenance_requests
  using (((select auth.uid()) = artisan_user_id));

alter policy maintenance_requests_landlord_all on public.maintenance_requests
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy maintenance_requests_tenant_cancel on public.maintenance_requests
  using (((select auth.uid()) = tenant_user_id))
  with check (((select auth.uid()) = tenant_user_id));

alter policy maintenance_requests_tenant_insert on public.maintenance_requests
  with check (((select auth.uid()) = tenant_user_id));

alter policy maintenance_requests_tenant_select on public.maintenance_requests
  using (((select auth.uid()) = tenant_user_id));

alter policy message_thread_reads_select_participants on public.message_thread_reads
  using ((((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = message_thread_reads.thread_id) AND ((t.landlord_id = (select auth.uid())) OR (t.tenant_user_id = (select auth.uid()))))))));

alter policy message_thread_reads_write_own on public.message_thread_reads
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy message_threads_landlord_all on public.message_threads
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy message_threads_tenant_select on public.message_threads
  using (((select auth.uid()) = tenant_user_id));

alter policy message_threads_tenant_update on public.message_threads
  using (((select auth.uid()) = tenant_user_id))
  with check (((select auth.uid()) = tenant_user_id));

alter policy messages_participants_insert on public.messages
  with check (((sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND ((t.landlord_id = (select auth.uid())) OR (t.tenant_user_id = (select auth.uid()))))))));

alter policy messages_participants_select on public.messages
  using ((EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND ((t.landlord_id = (select auth.uid())) OR (t.tenant_user_id = (select auth.uid())))))));

alter policy ops_tasks_landlord_all on public.ops_tasks
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy ops_tasks_tenant_select on public.ops_tasks
  using (((audience = 'tenant'::text) AND ((select auth.uid()) = tenant_user_id)));

alter policy ops_tasks_tenant_update on public.ops_tasks
  using (((audience = 'tenant'::text) AND ((select auth.uid()) = tenant_user_id)))
  with check (((audience = 'tenant'::text) AND ((select auth.uid()) = tenant_user_id)));

alter policy payment_methods_owner_all on public.payment_methods
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "Users can insert own profile" on public.profiles
  with check (((select auth.uid()) = id));

alter policy "Users can read own profile" on public.profiles
  using (((select auth.uid()) = id));

alter policy "Users can update own profile" on public.profiles
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));

alter policy owner_properties on public.properties
  using (((select auth.uid()) = owner_id));

alter policy publication_reads_own on public.publication_reads
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy publications_landlord_all on public.publications
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy publications_tenant_select on public.publications
  using (((archived_at IS NULL) AND (EXISTS ( SELECT 1
   FROM (tenancies t
     JOIN units u ON ((u.id = t.unit_id)))
  WHERE ((t.tenant_user_id = (select auth.uid())) AND (t.status = 'active'::text) AND (t.landlord_id = publications.landlord_id) AND ((publications.property_id IS NULL) OR (publications.property_id = u.property_id)))))));

alter policy owner_reminders on public.reminders
  using ((unit_id IN ( SELECT u.id
   FROM (units u
     JOIN properties p ON ((u.property_id = p.id)))
  WHERE (p.owner_id = (select auth.uid())))));

alter policy rental_applications_applicant_select on public.rental_applications
  using (((select auth.uid()) = applicant_user_id));

alter policy rental_applications_landlord_all on public.rental_applications
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy scheduled_fees_landlord_all on public.scheduled_fees
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy scheduled_fees_tenant_select on public.scheduled_fees
  using ((EXISTS ( SELECT 1
   FROM tenancies t
  WHERE ((t.unit_id = scheduled_fees.unit_id) AND (t.tenant_user_id = (select auth.uid())) AND (t.status = 'active'::text)))));

alter policy staff_membership_properties_select on public.staff_membership_properties
  using ((EXISTS ( SELECT 1
   FROM staff_memberships m
  WHERE ((m.id = staff_membership_properties.membership_id) AND ((m.owner_id = (select auth.uid())) OR (m.user_id = (select auth.uid())))))));

alter policy staff_memberships_owner_select on public.staff_memberships
  using ((((select auth.uid()) = owner_id) OR ((select auth.uid()) = user_id)));

alter policy tenancies_landlord_all on public.tenancies
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy tenancies_tenant_select on public.tenancies
  using (((select auth.uid()) = tenant_user_id));

alter policy tenancy_document_ack_actor_select on public.tenancy_document_acknowledgments
  using ((actor_id = (select auth.uid())));

alter policy tenancy_document_ack_landlord_select on public.tenancy_document_acknowledgments
  using ((EXISTS ( SELECT 1
   FROM tenancies t
  WHERE ((t.id = tenancy_document_acknowledgments.tenancy_id) AND (t.landlord_id = (select auth.uid()))))));

alter policy tenancy_document_events_landlord_select on public.tenancy_document_events
  using ((EXISTS ( SELECT 1
   FROM tenancies t
  WHERE ((t.id = tenancy_document_events.tenancy_id) AND (t.landlord_id = (select auth.uid()))))));

alter policy tenancy_document_holds_landlord_select on public.tenancy_document_holds
  using ((EXISTS ( SELECT 1
   FROM tenancy_documents d
  WHERE ((d.id = tenancy_document_holds.document_id) AND (d.landlord_id = (select auth.uid()))))));

alter policy tenancy_doc_request_events_landlord_select on public.tenancy_document_request_events
  using ((EXISTS ( SELECT 1
   FROM tenancy_document_requests r
  WHERE ((r.id = tenancy_document_request_events.request_id) AND (r.landlord_id = (select auth.uid()))))));

alter policy tenancy_doc_request_events_tenant_select on public.tenancy_document_request_events
  using ((EXISTS ( SELECT 1
   FROM (tenancy_document_requests r
     JOIN tenancies t ON ((t.id = r.tenancy_id)))
  WHERE ((r.id = tenancy_document_request_events.request_id) AND (t.tenant_user_id = (select auth.uid())) AND (t.status = ANY (ARRAY['draft'::text, 'pending_verification'::text]))))));

alter policy tenancy_doc_requests_landlord_select on public.tenancy_document_requests
  using ((landlord_id = (select auth.uid())));

alter policy tenancy_doc_requests_tenant_select on public.tenancy_document_requests
  using ((EXISTS ( SELECT 1
   FROM tenancies t
  WHERE ((t.id = tenancy_document_requests.tenancy_id) AND (t.tenant_user_id = (select auth.uid())) AND (t.status = ANY (ARRAY['draft'::text, 'pending_verification'::text]))))));

alter policy tenancy_doc_submissions_landlord_select on public.tenancy_document_submissions
  using ((EXISTS ( SELECT 1
   FROM tenancy_document_requests r
  WHERE ((r.id = tenancy_document_submissions.request_id) AND (r.landlord_id = (select auth.uid()))))));

alter policy tenancy_doc_submissions_tenant_select on public.tenancy_document_submissions
  using ((submitted_by = (select auth.uid())));

alter policy tenancy_documents_landlord_select on public.tenancy_documents
  using ((((select auth.uid()) = landlord_id) AND (deleted_at IS NULL)));

alter policy tenancy_documents_tenant_select on public.tenancy_documents
  using (((deleted_at IS NULL) AND (scan_status = 'clean'::text) AND (EXISTS ( SELECT 1
   FROM tenancies t
  WHERE ((t.id = tenancy_documents.tenancy_id) AND (t.tenant_user_id = (select auth.uid())) AND (t.status = 'active'::text))))));

alter policy tenancy_privacy_request_documents_landlord_select on public.tenancy_privacy_request_documents
  using ((EXISTS ( SELECT 1
   FROM tenancy_privacy_requests p
  WHERE ((p.id = tenancy_privacy_request_documents.privacy_request_id) AND (p.landlord_id = (select auth.uid()))))));

alter policy tenancy_privacy_request_documents_subject_select on public.tenancy_privacy_request_documents
  using ((EXISTS ( SELECT 1
   FROM tenancy_privacy_requests p
  WHERE ((p.id = tenancy_privacy_request_documents.privacy_request_id) AND (p.data_subject_id = (select auth.uid()))))));

alter policy tenancy_privacy_request_events_landlord_select on public.tenancy_privacy_request_events
  using ((EXISTS ( SELECT 1
   FROM tenancy_privacy_requests p
  WHERE ((p.id = tenancy_privacy_request_events.privacy_request_id) AND (p.landlord_id = (select auth.uid()))))));

alter policy tenancy_privacy_request_events_subject_select on public.tenancy_privacy_request_events
  using ((EXISTS ( SELECT 1
   FROM tenancy_privacy_requests p
  WHERE ((p.id = tenancy_privacy_request_events.privacy_request_id) AND (p.data_subject_id = (select auth.uid()))))));

alter policy tenancy_privacy_requests_landlord_select on public.tenancy_privacy_requests
  using ((landlord_id = (select auth.uid())));

alter policy tenancy_privacy_requests_subject_select on public.tenancy_privacy_requests
  using ((data_subject_id = (select auth.uid())));

alter policy owner_transactions on public.transactions
  using ((unit_id IN ( SELECT u.id
   FROM (units u
     JOIN properties p ON ((u.property_id = p.id)))
  WHERE (p.owner_id = (select auth.uid())))));

alter policy unit_utility_providers_landlord_all on public.unit_utility_providers
  using (((select auth.uid()) = landlord_id))
  with check (((select auth.uid()) = landlord_id));

alter policy unit_utility_providers_tenant_select on public.unit_utility_providers
  using (((is_enabled = true) AND (EXISTS ( SELECT 1
   FROM tenancies t
  WHERE ((t.unit_id = unit_utility_providers.unit_id) AND (t.tenant_user_id = (select auth.uid())) AND (t.status = 'active'::text))))));

alter policy owner_units on public.units
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = (select auth.uid())))));
