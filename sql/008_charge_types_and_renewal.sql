-- Phase 2: charge types on the shared ledger + unit service charge / term end + renewal reminders.
-- Safe to re-run.

-- Units: optional service charge (same due_day/frequency as rent) + term-end for renewals.
alter table public.units
  add column if not exists service_charge_amount numeric;

alter table public.units
  add column if not exists term_end date;

comment on column public.units.service_charge_amount is
  'Optional recurring service charge; status uses unit due_day/frequency.';
comment on column public.units.term_end is
  'Occupancy term end / renewal date (light field; not a full tenancy entity).';

-- Transactions: tag each ledger row without a parallel payment system.
alter table public.transactions
  add column if not exists charge_type text;

alter table public.transactions
  add column if not exists charge_label text;

update public.transactions
set charge_type = 'rent'
where charge_type is null;

alter table public.transactions
  alter column charge_type set default 'rent';

alter table public.transactions
  alter column charge_type set not null;

alter table public.transactions
  drop constraint if exists transactions_charge_type_check;

alter table public.transactions
  add constraint transactions_charge_type_check
  check (
    charge_type = any (
      array[
        'rent'::text,
        'service_charge'::text,
        'other'::text
      ]
    )
  );

comment on column public.transactions.charge_type is
  'rent | service_charge | other — same history/receipts/Paystack path.';
comment on column public.transactions.charge_label is
  'Required for charge_type=other (e.g. Generator fuel levy).';

-- Reminders: landlord renewal notices reuse the due-job cron.
alter table public.reminders
  drop constraint if exists reminders_kind_check;

alter table public.reminders
  add constraint reminders_kind_check
  check (
    kind = any (
      array[
        'due'::text,
        'receipt'::text,
        'landlord_payment'::text,
        'renewal'::text
      ]
    )
  );
