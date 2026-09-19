-- Force marketing lead inserts through the API (rate limit + captcha).
-- Admins still read/update via existing policies + service role.

drop policy if exists "Anyone can insert leads" on public.leads;
drop policy if exists "Public can insert marketing leads" on public.leads;

comment on table public.leads is
  'Access/callback requests. Public inserts go through POST /public/leads (service role); no anon INSERT policy.';
