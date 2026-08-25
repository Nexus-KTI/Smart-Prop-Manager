-- TenantCloud-style messages hub: chat + maintenance threads.
-- Publications stay on publications table; hub UI surfaces them as a tab.
-- Safe to re-run.

create table if not exists public.message_threads (
  id uuid primary key default extensions.uuid_generate_v4(),
  kind text not null
    check (kind = any (array['chat'::text, 'maintenance'::text])),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  tenant_user_id uuid references auth.users (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  maintenance_request_id uuid unique references public.maintenance_requests (id) on delete cascade,
  subject text,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now()
);

create index if not exists message_threads_landlord_id_idx
  on public.message_threads (landlord_id);
create index if not exists message_threads_tenant_user_id_idx
  on public.message_threads (tenant_user_id);
create index if not exists message_threads_kind_idx
  on public.message_threads (kind);
create index if not exists message_threads_last_message_at_idx
  on public.message_threads (last_message_at desc nulls last);

-- One direct chat per landlord + tenant + unit (when unit known).
create unique index if not exists message_threads_chat_unique_idx
  on public.message_threads (landlord_id, tenant_user_id, unit_id)
  where kind = 'chat' and tenant_user_id is not null and unit_id is not null;

comment on table public.message_threads is
  'Messages hub threads: direct landlord↔tenant chat, or per maintenance request.';

alter table public.message_threads enable row level security;

drop policy if exists message_threads_landlord_all on public.message_threads;
create policy message_threads_landlord_all
  on public.message_threads
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists message_threads_tenant_select on public.message_threads;
create policy message_threads_tenant_select
  on public.message_threads
  for select
  using (auth.uid() = tenant_user_id);

drop policy if exists message_threads_tenant_update on public.message_threads;
create policy message_threads_tenant_update
  on public.message_threads
  for update
  using (auth.uid() = tenant_user_id)
  with check (auth.uid() = tenant_user_id);

create table if not exists public.messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_id_idx
  on public.messages (thread_id, created_at);

alter table public.messages enable row level security;

drop policy if exists messages_participants_select on public.messages;
create policy messages_participants_select
  on public.messages
  for select
  using (
    exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (t.landlord_id = auth.uid() or t.tenant_user_id = auth.uid())
    )
  );

drop policy if exists messages_participants_insert on public.messages;
create policy messages_participants_insert
  on public.messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (t.landlord_id = auth.uid() or t.tenant_user_id = auth.uid())
    )
  );

create table if not exists public.message_thread_reads (
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.message_thread_reads enable row level security;

drop policy if exists message_thread_reads_own on public.message_thread_reads;
create policy message_thread_reads_own
  on public.message_thread_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
