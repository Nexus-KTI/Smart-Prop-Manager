-- Tenant/landlord settings extras: notification event matrix + saved Paystack cards.

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

comment on column public.profiles.notification_prefs is
  'Per-event channel toggles: { event: { email, sms, whatsapp, feed } }. Empty = all on.';

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'paystack',
  authorization_code text not null,
  last4 text,
  card_type text,
  exp_month text,
  exp_year text,
  bank text,
  reusable boolean not null default true,
  paystack_customer_code text,
  created_at timestamptz not null default now(),
  unique (user_id, authorization_code)
);

create index if not exists payment_methods_user_id_idx
  on public.payment_methods (user_id);

alter table public.payment_methods enable row level security;

drop policy if exists payment_methods_owner_all on public.payment_methods;
create policy payment_methods_owner_all
  on public.payment_methods
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.payment_methods is
  'Saved Paystack card authorizations for tenants (and landlords).';
