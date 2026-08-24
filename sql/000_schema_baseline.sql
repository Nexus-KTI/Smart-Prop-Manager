-- Baseline schema reference for Smart Prop Manager (public tables).
-- Prefer applying via supabase-spm / SQL Editor. Safe to re-run with IF NOT EXISTS.

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- Core portfolio
create table if not exists public.properties (
  id uuid primary key default extensions.uuid_generate_v4(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  type text not null default 'rental' check (type = any (array['rental'::text, 'estate'::text])),
  created_at timestamptz default now()
);

create table if not exists public.units (
  id uuid primary key default extensions.uuid_generate_v4(),
  property_id uuid not null references public.properties (id) on delete cascade,
  label text not null,
  rent_amount numeric not null,
  frequency text not null default 'monthly'
    check (frequency = any (array['daily'::text, 'weekly'::text, 'monthly'::text, 'annual'::text])),
  due_month integer
    check (due_month is null or (due_month >= 1 and due_month <= 12)),
  tenant_name text,
  tenant_contact text,
  due_day integer,
  created_at timestamptz default now()
);

create table if not exists public.transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  unit_id uuid not null references public.units (id) on delete cascade,
  amount numeric not null,
  status text not null default 'pending'
    check (status = any (array['pending'::text, 'paid'::text, 'overdue'::text, 'failed'::text])),
  method text check (method = any (array['paystack'::text, 'manual'::text])),
  paid_at timestamptz,
  receipt_url text,
  payment_reference text,
  created_at timestamptz default now()
);

create table if not exists public.reminders (
  id uuid primary key default extensions.uuid_generate_v4(),
  unit_id uuid not null references public.units (id) on delete cascade,
  channel text not null check (channel = any (array['whatsapp'::text, 'sms'::text, 'email'::text])),
  status text not null default 'sent'
    check (status = any (array['sent'::text, 'failed'::text, 'skipped'::text])),
  sent_at timestamptz default now(),
  kind text not null default 'due'
    check (
      kind = any (
        array['due'::text, 'receipt'::text, 'landlord_payment'::text]
      )
    ),
  error_detail text
);

create table if not exists public.leads (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  whatsapp text not null,
  unit_count integer check (unit_count > 0),
  created_at timestamptz default now(),
  status text not null default 'new'
    check (status = any (array['new'::text, 'contacted'::text, 'invited'::text, 'closed'::text])),
  source text not null default 'access'
    check (source = any (array['access'::text, 'callback'::text]))
);

create table if not exists public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

-- profiles: see 001_profiles.sql
-- admin allowlist select policy: see 002_admin_allowlist_select.sql
-- portfolio RLS + payment_reference: see 003_portfolio_rls_and_payment_reference.sql
