-- Tenant self-serve guest gate codes (software passes).
-- API mints via service role after active-tenancy checks; RLS below is defense-in-depth
-- if a user-scoped client ever inserts/updates guest rows.
-- Safe to re-run.

-- Tenants may insert guest passes they create for their own active unit/property.
drop policy if exists access_passes_tenant_guest_insert on public.access_passes;
create policy access_passes_tenant_guest_insert
  on public.access_passes
  for insert
  to authenticated
  with check (
    subject_type = 'guest'
    and created_by = auth.uid()
    and subject_user_id = auth.uid()
    and status = 'active'
    and unit_id is not null
    and exists (
      select 1
      from public.tenancies t
      where t.unit_id = access_passes.unit_id
        and t.tenant_user_id = auth.uid()
        and t.landlord_id = access_passes.landlord_id
        and t.status = 'active'
    )
    and exists (
      select 1
      from public.units u
      where u.id = access_passes.unit_id
        and u.property_id = access_passes.property_id
    )
  );

-- Tenants may revoke guest passes they created.
drop policy if exists access_passes_tenant_guest_revoke on public.access_passes;
create policy access_passes_tenant_guest_revoke
  on public.access_passes
  for update
  to authenticated
  using (
    subject_type = 'guest'
    and created_by = auth.uid()
  )
  with check (
    subject_type = 'guest'
    and created_by = auth.uid()
    and status = any (array['active'::text, 'revoked'::text, 'expired'::text])
  );

comment on policy access_passes_tenant_guest_insert on public.access_passes is
  'Tenant may mint guest gate codes for their active tenancy unit.';

comment on policy access_passes_tenant_guest_revoke on public.access_passes is
  'Tenant may revoke guest gate codes they created.';
