-- 043: Indexes for the hottest filters, foreign keys, and RLS joins.
-- Before this, properties / units / reminders had only primary keys and
-- transactions had no unit_id index, so portfolio reads and the RLS EXISTS
-- joins (unit -> property -> owner) scanned whole tables.
-- Plain CREATE INDEX (not CONCURRENTLY) because migrations run in a transaction;
-- re-run as CONCURRENTLY by hand if these tables are large when applied.

create index if not exists properties_owner_id_created_idx
  on public.properties (owner_id, created_at desc, id desc);

create index if not exists units_property_id_created_idx
  on public.units (property_id, created_at desc, id desc);

create index if not exists transactions_unit_created_idx
  on public.transactions (unit_id, created_at desc, id desc);

create index if not exists transactions_unit_paid_rent_idx
  on public.transactions (unit_id, paid_at desc)
  where status = 'paid';

create index if not exists reminders_unit_sent_idx
  on public.reminders (unit_id, sent_at desc);

create index if not exists reminders_unit_kind_status_sent_idx
  on public.reminders (unit_id, kind, status, sent_at desc);

create index if not exists message_threads_landlord_last_idx
  on public.message_threads (landlord_id, last_message_at desc);

create index if not exists message_threads_tenant_last_idx
  on public.message_threads (tenant_user_id, last_message_at desc);

create index if not exists message_thread_reads_user_idx
  on public.message_thread_reads (user_id);
