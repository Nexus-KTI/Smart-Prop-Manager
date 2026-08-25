-- Competitive ops gaps (pragmatic NG slices): applications, expenses,
-- publications, tasks, doc ack, MR category/photo, scheduled fees.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Rental applications (unit invite → apply → landlord decide)
-- ---------------------------------------------------------------------------
create table if not exists public.rental_applications (
  id uuid primary key default extensions.uuid_generate_v4(),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  invite_token text not null unique,
  status text not null default 'open'
    check (status = any (array[
      'open'::text,
      'submitted'::text,
      'approved'::text,
      'rejected'::text,
      'withdrawn'::text,
      'closed'::text
    ])),
  applicant_name text,
  applicant_email text,
  applicant_phone text,
  applicant_user_id uuid references auth.users (id) on delete set null,
  notes text,
  screening_answers jsonb not null default '{}'::jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_applications_landlord_id_idx
  on public.rental_applications (landlord_id);
create index if not exists rental_applications_unit_id_idx
  on public.rental_applications (unit_id);
create index if not exists rental_applications_status_idx
  on public.rental_applications (status);

comment on table public.rental_applications is
  'Thin leasing intake: landlord opens invite link; applicant submits; landlord approves/rejects.';

alter table public.rental_applications enable row level security;

drop policy if exists rental_applications_landlord_all on public.rental_applications;
create policy rental_applications_landlord_all
  on public.rental_applications
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists rental_applications_applicant_select on public.rental_applications;
create policy rental_applications_applicant_select
  on public.rental_applications
  for select
  using (auth.uid() = applicant_user_id);

-- ---------------------------------------------------------------------------
-- Tenant → landlord connect (invite your landlord)
-- ---------------------------------------------------------------------------
create table if not exists public.landlord_connect_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_user_id uuid not null references auth.users (id) on delete cascade,
  landlord_email text not null,
  landlord_name text,
  message text,
  status text not null default 'pending'
    check (status = any (array[
      'pending'::text,
      'sent'::text,
      'claimed'::text,
      'closed'::text
    ])),
  created_at timestamptz not null default now()
);

create index if not exists landlord_connect_requests_tenant_idx
  on public.landlord_connect_requests (tenant_user_id);

alter table public.landlord_connect_requests enable row level security;

drop policy if exists landlord_connect_requests_tenant_all on public.landlord_connect_requests;
create policy landlord_connect_requests_tenant_all
  on public.landlord_connect_requests
  for all
  using (auth.uid() = tenant_user_id)
  with check (auth.uid() = tenant_user_id);

-- ---------------------------------------------------------------------------
-- Expenses (Money Out)
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default extensions.uuid_generate_v4(),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  category text not null default 'other'
    check (category = any (array[
      'repairs'::text,
      'utilities'::text,
      'security'::text,
      'service_charge'::text,
      'tax'::text,
      'agency'::text,
      'other'::text
    ])),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'NGN',
  paid_on date not null default (timezone('utc', now()))::date,
  vendor text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_landlord_id_idx on public.expenses (landlord_id);
create index if not exists expenses_paid_on_idx on public.expenses (paid_on desc);

alter table public.expenses enable row level security;

drop policy if exists expenses_landlord_all on public.expenses;
create policy expenses_landlord_all
  on public.expenses
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

-- ---------------------------------------------------------------------------
-- Publications / estate bulletin
-- ---------------------------------------------------------------------------
create table if not exists public.publications (
  id uuid primary key default extensions.uuid_generate_v4(),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists publications_landlord_id_idx on public.publications (landlord_id);
create index if not exists publications_published_at_idx
  on public.publications (published_at desc);

alter table public.publications enable row level security;

drop policy if exists publications_landlord_all on public.publications;
create policy publications_landlord_all
  on public.publications
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

-- Tenants read posts for properties they occupy (active tenancy).
drop policy if exists publications_tenant_select on public.publications;
create policy publications_tenant_select
  on public.publications
  for select
  using (
    archived_at is null
    and exists (
      select 1
      from public.tenancies t
      join public.units u on u.id = t.unit_id
      where t.tenant_user_id = auth.uid()
        and t.status = 'active'
        and t.landlord_id = publications.landlord_id
        and (
          publications.property_id is null
          or publications.property_id = u.property_id
        )
    )
  );

create table if not exists public.publication_reads (
  publication_id uuid not null references public.publications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (publication_id, user_id)
);

alter table public.publication_reads enable row level security;

drop policy if exists publication_reads_own on public.publication_reads;
create policy publication_reads_own
  on public.publication_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Tasks (landlord + tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.ops_tasks (
  id uuid primary key default extensions.uuid_generate_v4(),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  audience text not null default 'landlord'
    check (audience = any (array['landlord'::text, 'tenant'::text])),
  tenant_user_id uuid references auth.users (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  title text not null,
  details text,
  due_on date,
  status text not null default 'open'
    check (status = any (array[
      'open'::text,
      'done'::text,
      'canceled'::text
    ])),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops_tasks_landlord_id_idx on public.ops_tasks (landlord_id);
create index if not exists ops_tasks_tenant_user_id_idx on public.ops_tasks (tenant_user_id);
create index if not exists ops_tasks_due_on_idx on public.ops_tasks (due_on);

alter table public.ops_tasks enable row level security;

drop policy if exists ops_tasks_landlord_all on public.ops_tasks;
create policy ops_tasks_landlord_all
  on public.ops_tasks
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists ops_tasks_tenant_select on public.ops_tasks;
create policy ops_tasks_tenant_select
  on public.ops_tasks
  for select
  using (
    audience = 'tenant'
    and auth.uid() = tenant_user_id
  );

drop policy if exists ops_tasks_tenant_update on public.ops_tasks;
create policy ops_tasks_tenant_update
  on public.ops_tasks
  for update
  using (
    audience = 'tenant'
    and auth.uid() = tenant_user_id
  )
  with check (
    audience = 'tenant'
    and auth.uid() = tenant_user_id
  );

-- ---------------------------------------------------------------------------
-- Scheduled fees (tenant-visible non-rent charges)
-- ---------------------------------------------------------------------------
create table if not exists public.scheduled_fees (
  id uuid primary key default extensions.uuid_generate_v4(),
  landlord_id uuid not null references auth.users (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  label text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'NGN',
  due_on date not null,
  charge_type text not null default 'other'
    check (charge_type = any (array[
      'service_charge'::text,
      'other'::text
    ])),
  status text not null default 'due'
    check (status = any (array[
      'due'::text,
      'paid'::text,
      'waived'::text,
      'canceled'::text
    ])),
  created_at timestamptz not null default now()
);

create index if not exists scheduled_fees_landlord_id_idx on public.scheduled_fees (landlord_id);
create index if not exists scheduled_fees_unit_id_idx on public.scheduled_fees (unit_id);
create index if not exists scheduled_fees_due_on_idx on public.scheduled_fees (due_on);

alter table public.scheduled_fees enable row level security;

drop policy if exists scheduled_fees_landlord_all on public.scheduled_fees;
create policy scheduled_fees_landlord_all
  on public.scheduled_fees
  for all
  using (auth.uid() = landlord_id)
  with check (auth.uid() = landlord_id);

drop policy if exists scheduled_fees_tenant_select on public.scheduled_fees;
create policy scheduled_fees_tenant_select
  on public.scheduled_fees
  for select
  using (
    exists (
      select 1 from public.tenancies t
      where t.unit_id = scheduled_fees.unit_id
        and t.tenant_user_id = auth.uid()
        and t.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Document acknowledge (thin e-sign)
-- ---------------------------------------------------------------------------
alter table public.tenancy_documents
  add column if not exists requires_ack boolean not null default false;

alter table public.tenancy_documents
  add column if not exists acknowledged_at timestamptz;

alter table public.tenancy_documents
  add column if not exists acknowledged_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Maintenance: category + single photo URL
-- ---------------------------------------------------------------------------
alter table public.maintenance_requests
  add column if not exists category text;

update public.maintenance_requests set category = 'general' where category is null;

alter table public.maintenance_requests
  alter column category set default 'general';

do $$
begin
  alter table public.maintenance_requests
    alter column category set not null;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_requests_category_check'
  ) then
    alter table public.maintenance_requests
      add constraint maintenance_requests_category_check
      check (category = any (array[
        'general'::text,
        'plumbing'::text,
        'electrical'::text,
        'hvac'::text,
        'appliance'::text,
        'structural'::text,
        'pest'::text,
        'other'::text
      ]));
  end if;
end $$;

alter table public.maintenance_requests
  add column if not exists photo_url text;

alter table public.maintenance_requests
  add column if not exists preferred_time text;
