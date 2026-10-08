-- 057: portfolio_unit_snapshot (056) returns every paid rent / service-charge row that can
-- fall in the current period (since 1 Jan Lagos, less 7 days for weekly rent; newest 120 per
-- unit) instead of the 6 latest paid per kind, plus id and refunded_amount. Partial payments
-- are summed per period in lib/unit_status.py, so installments must not be capped at 6.
-- The latest overdue row still comes from the 36 most recent rows. Same signature and grants.

create or replace function public.portfolio_unit_snapshot(
  p_owner_id uuid,
  p_property_ids uuid[],
  p_failed_since timestamptz,
  p_max_units int default 5000
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(s.row_data order by s.unit_created desc, s.unit_id desc), '[]'::jsonb)
  from (
    select
      u.created_at as unit_created,
      u.id as unit_id,
      jsonb_build_object(
        'id', u.id,
        'label', u.label,
        'rent_amount', u.rent_amount,
        'service_charge_amount', u.service_charge_amount,
        'frequency', u.frequency,
        'due_day', u.due_day,
        'due_month', u.due_month,
        'term_end', u.term_end,
        'tenant_name', u.tenant_name,
        'tenant_contact', u.tenant_contact,
        'photo_url', u.photo_url,
        'property_id', u.property_id,
        'property_name', p.name,
        'transactions', coalesce(st.items, '[]'::jsonb),
        'failed_reminder', fr.item
      ) as row_data
    from units u
    join properties p on p.id = u.property_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'status', r.status,
          'amount', r.amount,
          'refunded_amount', r.refunded_amount,
          'paid_at', r.paid_at,
          'created_at', r.created_at,
          'charge_type', r.charge_type
        )
        order by r.created_at desc
      ) as items
      from (
        (
          select t.id, t.status, t.amount, t.refunded_amount, t.paid_at, t.created_at, t.charge_type
          from transactions t
          where t.unit_id = u.id
            and t.status = 'paid'
            and lower(btrim(coalesce(t.charge_type, ''))) <> 'other'
            and coalesce(t.paid_at, t.created_at) >= (
              (date_trunc('year', now() at time zone 'Africa/Lagos') - interval '7 days')
              at time zone 'Africa/Lagos'
            )
          order by coalesce(t.paid_at, t.created_at) desc
          limit 120
        )
        union all
        (
          select w.id, w.status, w.amount, w.refunded_amount, w.paid_at, w.created_at, w.charge_type
          from (
            select id, status, amount, refunded_amount, paid_at, created_at, charge_type
            from transactions
            where unit_id = u.id
            order by created_at desc, id desc
            limit 36
          ) w
          where w.status = 'overdue'
            and lower(btrim(coalesce(w.charge_type, ''))) <> 'other'
          order by w.created_at desc
          limit 1
        )
      ) r
    ) st on true
    left join lateral (
      select jsonb_build_object(
        'id', rem.id,
        'status', rem.status,
        'error_detail', rem.error_detail,
        'sent_at', rem.sent_at,
        'kind', rem.kind
      ) as item
      from reminders rem
      where rem.unit_id = u.id
        and rem.status in ('failed', 'skipped')
        and rem.sent_at >= p_failed_since
      order by rem.sent_at desc
      limit 1
    ) fr on true
    where p.owner_id = p_owner_id
      and u.property_id = any (p_property_ids)
    order by u.created_at desc, u.id desc
    limit greatest(1, least(coalesce(p_max_units, 5000), 5000))
  ) s;
$$;

revoke all on function public.portfolio_unit_snapshot(uuid, uuid[], timestamptz, int) from public, anon;
grant execute on function public.portfolio_unit_snapshot(uuid, uuid[], timestamptz, int) to authenticated, service_role;
