-- 049: idempotent chat sends and atomic gate admit.

-- Chat: a client Idempotency-Key per send; a replay returns the first row.
alter table public.messages
  add column if not exists client_key text
  check (client_key is null or char_length(client_key) between 8 and 128);

create unique index if not exists messages_sender_client_key_idx
  on public.messages (sender_id, client_key)
  where client_key is not null;

-- Gate admit: lock the pass, check it, count the use, and write the custody
-- event in one transaction. Two scans of a 1-use pass cannot both get in.
-- A repeated p_request_key returns the first admit instead of counting again.
create or replace function public.admit_access_pass(
  p_pass_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_actor_label text,
  p_issuer_label text,
  p_request_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  pass public.access_passes%rowtype;
  prior_event_id uuid;
  new_event_id uuid;
begin
  select * into pass
  from public.access_passes
  where id = p_pass_id
  for update;

  if not found then
    return jsonb_build_object('admitted', false, 'reason', 'not_found');
  end if;

  if p_request_key is not null then
    select id into prior_event_id
    from public.access_pass_events
    where pass_id = p_pass_id
      and event_type = 'admitted'
      and metadata->>'request_key' = p_request_key
    order by created_at desc
    limit 1;
    if found then
      return jsonb_build_object(
        'admitted', true,
        'replayed', true,
        'pass', to_jsonb(pass),
        'event_id', prior_event_id
      );
    end if;
  end if;

  if pass.status <> 'active' then
    return jsonb_build_object('admitted', false, 'reason', pass.status);
  end if;
  if pass.valid_until < now() then
    return jsonb_build_object('admitted', false, 'reason', 'expired');
  end if;
  if pass.valid_from > now() then
    return jsonb_build_object('admitted', false, 'reason', 'scheduled');
  end if;
  if pass.max_uses is not null and pass.uses_count >= pass.max_uses then
    return jsonb_build_object(
      'admitted', false,
      'reason', 'used_up',
      'uses_count', pass.uses_count,
      'max_uses', pass.max_uses
    );
  end if;

  update public.access_passes
  set uses_count = uses_count + 1,
      last_admitted_by = p_actor_user_id,
      last_admitted_by_label = nullif(left(coalesce(p_actor_label, ''), 120), ''),
      last_admitted_at = now(),
      updated_at = now()
  where id = p_pass_id
  returning * into pass;

  insert into public.access_pass_events (
    pass_id,
    landlord_id,
    property_id,
    event_type,
    actor_user_id,
    actor_role,
    actor_label,
    code,
    subject_label,
    metadata
  )
  values (
    pass.id,
    pass.landlord_id,
    pass.property_id,
    'admitted',
    p_actor_user_id,
    p_actor_role,
    nullif(left(coalesce(p_actor_label, ''), 120), ''),
    left(pass.code, 32),
    nullif(left(coalesce(pass.subject_label, ''), 120), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'uses_count', pass.uses_count,
      'created_by', pass.created_by,
      'created_by_label', p_issuer_label,
      'request_key', p_request_key
    ))
  )
  returning id into new_event_id;

  return jsonb_build_object(
    'admitted', true,
    'replayed', false,
    'pass', to_jsonb(pass),
    'event_id', new_event_id
  );
end;
$$;

revoke all on function public.admit_access_pass(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admit_access_pass(uuid, uuid, text, text, text, text)
  to service_role;
