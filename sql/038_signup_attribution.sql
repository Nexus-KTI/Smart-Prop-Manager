-- Signup attribution: referral code, how-heard, company name for PM personas.
-- Safe to re-run.

alter table public.profiles
  add column if not exists signup_referral_code text;

alter table public.profiles
  add column if not exists signup_attribution text;

alter table public.profiles
  add column if not exists company_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_signup_referral_code_len'
  ) then
    alter table public.profiles
      add constraint profiles_signup_referral_code_len
      check (
        signup_referral_code is null
        or char_length(btrim(signup_referral_code)) between 1 and 64
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_signup_attribution_check'
  ) then
    alter table public.profiles
      add constraint profiles_signup_attribution_check
      check (
        signup_attribution is null
        or signup_attribution = any (array[
          'whatsapp'::text,
          'instagram'::text,
          'friend'::text,
          'google'::text,
          'agent'::text,
          'other'::text
        ])
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_company_name_len'
  ) then
    alter table public.profiles
      add constraint profiles_company_name_len
      check (
        company_name is null
        or char_length(btrim(company_name)) between 1 and 120
      );
  end if;
end $$;

comment on column public.profiles.signup_referral_code is
  'Optional referral code captured at signup (analytics only; no reward engine)';
comment on column public.profiles.signup_attribution is
  'Optional how-heard: whatsapp | instagram | friend | google | agent | other';
comment on column public.profiles.company_name is
  'Company / agency name when signup persona is manage_others or manage_mix';

-- Prefer role + signup fields from auth user_metadata when the profile is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role text := 'landlord';
  meta_role text := coalesce(new.raw_user_meta_data->>'role', '');
  ref_code text := nullif(btrim(coalesce(new.raw_user_meta_data->>'signup_referral_code', '')), '');
  company text := nullif(btrim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  attribution text := nullif(btrim(coalesce(new.raw_user_meta_data->>'signup_attribution', '')), '');
begin
  if meta_role = 'tenant' then
    chosen_role := 'tenant';
  elsif meta_role = 'artisan' then
    chosen_role := 'artisan';
  end if;

  if ref_code is not null and char_length(ref_code) > 64 then
    ref_code := left(ref_code, 64);
  end if;
  if company is not null and char_length(company) > 120 then
    company := left(company, 120);
  end if;
  if attribution is not null
     and attribution not in ('whatsapp', 'instagram', 'friend', 'google', 'agent', 'other') then
    attribution := null;
  end if;

  insert into public.profiles (
    id,
    role,
    signup_persona,
    signup_unit_count,
    signup_years,
    signup_referral_code,
    signup_attribution,
    company_name
  )
  values (
    new.id,
    chosen_role,
    nullif(new.raw_user_meta_data->>'signup_persona', ''),
    case
      when (new.raw_user_meta_data->>'signup_unit_count') ~ '^[0-9]+$'
        then (new.raw_user_meta_data->>'signup_unit_count')::integer
      else null
    end,
    nullif(new.raw_user_meta_data->>'signup_years', ''),
    ref_code,
    attribution,
    company
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
