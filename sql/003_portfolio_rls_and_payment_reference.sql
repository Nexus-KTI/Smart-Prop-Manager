-- Portfolio RLS, payment_reference column, SMS default for profiles.
-- Safe to re-run (IF NOT EXISTS / drop policy if exists).

-- Persist manual / external payment references on transactions
alter table public.transactions
  add column if not exists payment_reference text;

-- New profiles default to SMS (WhatsApp needs a production sender)
alter table public.profiles
  alter column notification_channel set default 'sms';

alter table public.profiles
  drop constraint if exists profiles_notification_channel_check;

alter table public.profiles
  add constraint profiles_notification_channel_check
  check (
    notification_channel = any (
      array['whatsapp'::text, 'sms'::text, 'email'::text]
    )
  );

-- Admin helper for leads policies (allowlist only; env ADMIN_EMAILS use service role in API)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_allowlist a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- Properties
alter table public.properties enable row level security;

drop policy if exists "Owners select properties" on public.properties;
create policy "Owners select properties"
  on public.properties for select
  using (auth.uid() = owner_id);

drop policy if exists "Owners insert properties" on public.properties;
create policy "Owners insert properties"
  on public.properties for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Owners update properties" on public.properties;
create policy "Owners update properties"
  on public.properties for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners delete properties" on public.properties;
create policy "Owners delete properties"
  on public.properties for delete
  using (auth.uid() = owner_id);

-- Units (via owning property)
alter table public.units enable row level security;

drop policy if exists "Owners select units" on public.units;
create policy "Owners select units"
  on public.units for select
  using (
    exists (
      select 1 from public.properties p
      where p.id = units.property_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners insert units" on public.units;
create policy "Owners insert units"
  on public.units for insert
  with check (
    exists (
      select 1 from public.properties p
      where p.id = units.property_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners update units" on public.units;
create policy "Owners update units"
  on public.units for update
  using (
    exists (
      select 1 from public.properties p
      where p.id = units.property_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.properties p
      where p.id = units.property_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners delete units" on public.units;
create policy "Owners delete units"
  on public.units for delete
  using (
    exists (
      select 1 from public.properties p
      where p.id = units.property_id and p.owner_id = auth.uid()
    )
  );

-- Transactions
alter table public.transactions enable row level security;

drop policy if exists "Owners select transactions" on public.transactions;
create policy "Owners select transactions"
  on public.transactions for select
  using (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = transactions.unit_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners insert transactions" on public.transactions;
create policy "Owners insert transactions"
  on public.transactions for insert
  with check (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = transactions.unit_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners update transactions" on public.transactions;
create policy "Owners update transactions"
  on public.transactions for update
  using (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = transactions.unit_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = transactions.unit_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners delete transactions" on public.transactions;
create policy "Owners delete transactions"
  on public.transactions for delete
  using (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = transactions.unit_id and p.owner_id = auth.uid()
    )
  );

-- Reminders
alter table public.reminders enable row level security;

drop policy if exists "Owners select reminders" on public.reminders;
create policy "Owners select reminders"
  on public.reminders for select
  using (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = reminders.unit_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners insert reminders" on public.reminders;
create policy "Owners insert reminders"
  on public.reminders for insert
  with check (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = reminders.unit_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners update reminders" on public.reminders;
create policy "Owners update reminders"
  on public.reminders for update
  using (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = reminders.unit_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = reminders.unit_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners delete reminders" on public.reminders;
create policy "Owners delete reminders"
  on public.reminders for delete
  using (
    exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = reminders.unit_id and p.owner_id = auth.uid()
    )
  );

-- Leads: public insert (marketing); admin_allowlist for read/update
alter table public.leads enable row level security;

drop policy if exists "Anyone can insert leads" on public.leads;
create policy "Anyone can insert leads"
  on public.leads for insert
  with check (true);

drop policy if exists "Admins select leads" on public.leads;
create policy "Admins select leads"
  on public.leads for select
  using (public.is_admin());

drop policy if exists "Admins update leads" on public.leads;
create policy "Admins update leads"
  on public.leads for update
  using (public.is_admin())
  with check (public.is_admin());
