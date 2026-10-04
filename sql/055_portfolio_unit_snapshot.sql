-- 055: Portfolio unit snapshot — one call returns every unit in scope with only the
-- transactions that decide its payment status, plus its latest failed chase.
-- Replaces paging units with 36 embedded transactions each (Action needed, ops overdue).
--
-- Status rules stay in lib/unit_status.py (mirrors web/lib/dashboard.ts). Per unit and
-- charge type (rent / service charge), from the 36 most recent transactions:
--   * the 6 most recent paid rows — every period ends on or after today, so a payment
--     in the current period is among them unless six later ones are future-dated;
--   * the most recent overdue row.
-- Returns one jsonb array (not a row set), so the API's max-rows cap cannot truncate it.
-- Security invoker: owners call it under RLS; staff go through the service role after
-- the API has checked their portfolio grant.

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
          'status', r.status,
          'amount', r.amount,
          'paid_at', r.paid_at,
          'created_at', r.created_at,
          'charge_type', r.charge_type
        )
        order by r.created_at desc
      ) as items
      from (
        select
          t.*,
          row_number() over (
            partition by t.status, t.kind
            order by coalesce(t.paid_at, t.created_at) desc
          ) as rn
        from (
          select
            status,
            amount,
            paid_at,
            created_at,
            charge_type,
            case
              when lower(btrim(coalesce(charge_type, ''))) = 'service_charge' then 'service_charge'
              when lower(btrim(coalesce(charge_type, ''))) = 'other' then 'other'
              else 'rent'
            end as kind
          from transactions
          where unit_id = u.id
          order by created_at desc, id desc
          limit 36
        ) t
        where t.status in ('paid', 'overdue') and t.kind <> 'other'
      ) r
      where (r.status = 'paid' and r.rn <= 6) or (r.status = 'overdue' and r.rn = 1)
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
