-- Track landlord payment-notice emails in reminders (visible in unit reminder log).
-- Safe to re-run.

alter table public.reminders
  drop constraint if exists reminders_kind_check;

alter table public.reminders
  add constraint reminders_kind_check
  check (
    kind = any (
      array[
        'due'::text,
        'receipt'::text,
        'landlord_payment'::text
      ]
    )
  );

alter table public.reminders
  drop constraint if exists reminders_status_check;

alter table public.reminders
  add constraint reminders_status_check
  check (
    status = any (
      array[
        'sent'::text,
        'failed'::text,
        'skipped'::text
      ]
    )
  );
