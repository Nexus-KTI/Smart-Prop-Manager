-- Annual (yearly) rent frequency + due_month for the yearly anniversary.
-- Safe to re-run.

alter table public.units
  drop constraint if exists units_frequency_check;

alter table public.units
  add constraint units_frequency_check
  check (
    frequency = any (
      array[
        'daily'::text,
        'weekly'::text,
        'monthly'::text,
        'annual'::text
      ]
    )
  );

alter table public.units
  add column if not exists due_month integer;

alter table public.units
  drop constraint if exists units_due_month_check;

alter table public.units
  add constraint units_due_month_check
  check (
    due_month is null
    or (due_month >= 1 and due_month <= 12)
  );

comment on column public.units.due_month is
  '1–12; used when frequency=annual (with due_day) for the yearly due date.';
