-- 050: multi-step writes in one transaction each.
-- Before this, each was 2-4 separate API calls; a failure part-way left a
-- tenant linked without the tenant role, an application approved with no
-- tenancy, or a chat message with a stale thread preview.

-- Tenant claims an invite: link the tenancy, clear the token, set the role.
-- The caller has already matched the signed-in phone/email to the invite.
create or replace function public.claim_tenancy_invite(
  p_tenancy_id uuid,
  p_token text,
  p_user_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  t public.tenancies%rowtype;
begin
  select * into t from public.tenancies where id = p_tenancy_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if t.invite_token is distinct from p_token then
    -- A second click that lost the race to its own first click.
    if t.tenant_user_id = p_user_id then
      return jsonb_build_object('outcome', 'claimed', 'tenancy', to_jsonb(t));
    end if;
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if t.tenant_user_id is not null and t.tenant_user_id <> p_user_id then
    return jsonb_build_object('outcome', 'already_claimed');
  end if;

  update public.tenancies
  set tenant_user_id = p_user_id,
      invite_token = null,
      updated_at = now()
  where id = p_tenancy_id
  returning * into t;

  insert into public.profiles (id, role)
  values (p_user_id, 'tenant')
  on conflict (id) do update set role = 'tenant';

  return jsonb_build_object('outcome', 'claimed', 'tenancy', to_jsonb(t));
end;
$$;

revoke all on function public.claim_tenancy_invite(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_tenancy_invite(uuid, text, uuid)
  to service_role;

-- Artisan claims an invite: profile, role, and the landlord link together.
create or replace function public.claim_artisan_invite(
  p_invite_id uuid,
  p_token text,
  p_user_id uuid,
  p_display_name text,
  p_trades text[],
  p_phone text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  link public.landlord_artisans%rowtype;
  prof public.artisan_profiles%rowtype;
begin
  select * into link from public.landlord_artisans where id = p_invite_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if link.invite_token is distinct from p_token or link.status <> 'invited' then
    if link.artisan_user_id = p_user_id and link.status = 'active' then
      select * into prof from public.artisan_profiles where user_id = p_user_id;
      return jsonb_build_object(
        'outcome', 'claimed', 'link', to_jsonb(link), 'profile', to_jsonb(prof)
      );
    end if;
    return jsonb_build_object('outcome', 'not_found');
  end if;

  insert into public.artisan_profiles (user_id, display_name, trades, phone, status, updated_at)
  values (p_user_id, left(p_display_name, 120), coalesce(p_trades, '{}'), p_phone, 'active', now())
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      trades = excluded.trades,
      phone = excluded.phone,
      status = 'active',
      updated_at = now()
  returning * into prof;

  update public.profiles set role = 'artisan' where id = p_user_id;

  update public.landlord_artisans
  set artisan_user_id = p_user_id,
      status = 'active',
      invite_token = null,
      claimed_at = now(),
      updated_at = now()
  where id = p_invite_id
  returning * into link;

  return jsonb_build_object(
    'outcome', 'claimed', 'link', to_jsonb(link), 'profile', to_jsonb(prof)
  );
end;
$$;

revoke all on function public.claim_artisan_invite(uuid, text, uuid, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.claim_artisan_invite(uuid, text, uuid, text, text[], text)
  to service_role;

-- Chat send: message, thread preview, and the sender's read marker together.
-- A repeated p_client_key returns the first message.
create or replace function public.store_thread_message(
  p_thread_id uuid,
  p_sender_id uuid,
  p_body text,
  p_preview text,
  p_media jsonb default null,
  p_client_key text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  msg public.messages%rowtype;
  v_now timestamptz := now();
begin
  insert into public.messages (
    thread_id, sender_id, body, kind, created_at,
    media_kind, media_path, media_mime, media_bytes, media_duration_ms, media_name,
    client_key
  )
  values (
    p_thread_id, p_sender_id, p_body, 'user', v_now,
    p_media->>'media_kind', p_media->>'media_path', p_media->>'media_mime',
    (p_media->>'media_bytes')::int, (p_media->>'media_duration_ms')::int,
    p_media->>'media_name',
    p_client_key
  )
  on conflict (sender_id, client_key) where client_key is not null do nothing
  returning * into msg;

  if not found then
    select * into msg
    from public.messages
    where sender_id = p_sender_id and client_key = p_client_key;
    if msg.thread_id <> p_thread_id then
      return jsonb_build_object('outcome', 'key_conflict');
    end if;
    return jsonb_build_object('outcome', 'replayed', 'message', to_jsonb(msg));
  end if;

  update public.message_threads
  set last_message_at = v_now,
      last_message_preview = left(p_preview, 140)
  where id = p_thread_id;

  insert into public.message_thread_reads (thread_id, user_id, last_read_at)
  values (p_thread_id, p_sender_id, v_now)
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;

  return jsonb_build_object('outcome', 'created', 'message', to_jsonb(msg));
end;
$$;

revoke all on function public.store_thread_message(uuid, uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.store_thread_message(uuid, uuid, text, text, jsonb, text)
  to service_role;

-- Landlord decides an application. Approve also reuses the unit's open
-- tenancy (filling blanks) or creates a draft, in the same transaction.
-- Runs as the caller: RLS still limits it to the landlord's own rows.
create or replace function public.decide_rental_application(
  p_application_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  app public.rental_applications%rowtype;
  t public.tenancies%rowtype;
  v_now timestamptz := now();
  v_contact text;
  v_name text;
begin
  if p_status not in ('approved', 'rejected', 'closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select * into app
  from public.rental_applications
  where id = p_application_id and landlord_id = auth.uid()
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if app.status not in ('open', 'submitted') then
    return jsonb_build_object('outcome', 'already_decided', 'status', app.status);
  end if;

  update public.rental_applications
  set status = p_status,
      updated_at = v_now,
      decided_at = case when p_status in ('approved', 'rejected') then v_now end
  where id = app.id
  returning * into app;

  if p_status <> 'approved' then
    return jsonb_build_object('outcome', 'decided', 'application', to_jsonb(app));
  end if;

  -- Two approvals for the same unit queue here; the second reuses the first's tenancy.
  perform pg_advisory_xact_lock(hashtext('tenancy-open-unit:' || app.unit_id::text));

  v_contact := nullif(btrim(coalesce(
    nullif(app.applicant_phone, ''), nullif(app.applicant_email, ''), ''
  )), '');
  v_name := nullif(btrim(coalesce(app.applicant_name, '')), '');

  select * into t
  from public.tenancies
  where unit_id = app.unit_id
    and status in ('draft', 'pending_verification', 'active')
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.tenancies
    set tenant_contact = case
          when v_contact is not null and coalesce(btrim(tenant_contact), '') = ''
            then v_contact else tenant_contact end,
        tenant_name = case
          when v_name is not null and coalesce(btrim(tenant_name), '') = ''
            then v_name else tenant_name end,
        tenant_user_id = coalesce(tenant_user_id, app.applicant_user_id),
        checklist_id_collected = true,
        checklist_agreement_signed = true,
        checklist_references_checked = true,
        updated_at = v_now
    where id = t.id
    returning * into t;
  else
    insert into public.tenancies (
      unit_id, landlord_id, tenant_user_id, status, tenant_name, tenant_contact,
      checklist_id_collected, checklist_agreement_signed, checklist_references_checked
    )
    values (
      app.unit_id, app.landlord_id, app.applicant_user_id, 'draft', v_name, v_contact,
      true, true, true
    )
    returning * into t;
  end if;

  return jsonb_build_object(
    'outcome', 'decided', 'application', to_jsonb(app), 'tenancy_id', t.id
  );
end;
$$;

revoke all on function public.decide_rental_application(uuid, text)
  from public, anon;
grant execute on function public.decide_rental_application(uuid, text)
  to authenticated, service_role;
