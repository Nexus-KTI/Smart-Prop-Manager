-- 046: Saved-card claims serialise per unit.
-- claim_autopay_transaction locks per idempotency key, so two tabs that each mint a
-- key could both start a Paystack charge for the same unit. This wrapper takes a
-- per-unit lock first and refuses a new key while another saved-card charge on the
-- unit still holds a live processing lease. Replays of an existing key pass through.

create or replace function public.claim_saved_card_transaction(
  p_idempotency_key text,
  p_unit_id uuid,
  p_amount numeric,
  p_tenant_user_id uuid,
  p_payment_reference text,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if left(coalesce(p_idempotency_key, ''), 11) <> 'saved-card:' then
    raise exception 'Invalid saved-card claim';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('saved-card-unit:' || p_unit_id::text, 0)
  );

  if not exists (
    select 1 from public.transactions where idempotency_key = p_idempotency_key
  ) and exists (
    select 1
    from public.transactions
    where unit_id = p_unit_id
      and status = 'pending'
      and idempotency_key like 'saved-card:%'
      and processing_lease_expires_at > now()
  ) then
    return jsonb_build_object('claimed', false, 'busy', true);
  end if;

  return public.claim_autopay_transaction(
    p_idempotency_key,
    p_unit_id,
    p_amount,
    p_tenant_user_id,
    p_payment_reference,
    p_lease_seconds
  );
end;
$$;

revoke all on function public.claim_saved_card_transaction(
  text, uuid, numeric, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.claim_saved_card_transaction(
  text, uuid, numeric, uuid, text, integer
) to service_role;
