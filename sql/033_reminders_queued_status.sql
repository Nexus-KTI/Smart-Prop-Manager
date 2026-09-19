-- Allow queued reminder log rows for interactive chase that enqueues to the
-- delivery outbox before the worker marks them sent/failed.
-- Safe to re-run.

alter table public.reminders
  drop constraint if exists reminders_status_check;

alter table public.reminders
  add constraint reminders_status_check
  check (
    status = any (
      array[
        'sent'::text,
        'failed'::text,
        'skipped'::text,
        'queued'::text
      ]
    )
  );
