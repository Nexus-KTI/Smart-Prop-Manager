-- Allow authenticated users to see whether their own email is on the admin allowlist
-- (used by Next.js middleware). Service role / env ADMIN_EMAILS remain authoritative on API.

alter table public.admin_allowlist enable row level security;

drop policy if exists "Users can read own admin allowlist row" on public.admin_allowlist;
create policy "Users can read own admin allowlist row"
  on public.admin_allowlist
  for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
