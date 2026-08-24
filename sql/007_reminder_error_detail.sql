-- Store human-readable failure reasons for reminder/receipt log rows.
-- Safe to re-run.

alter table public.reminders
  add column if not exists error_detail text;

comment on column public.reminders.error_detail is
  'Optional failure/skip reason shown in the unit reminders UI';
