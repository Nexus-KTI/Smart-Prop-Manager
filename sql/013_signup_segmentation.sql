-- Signup segmentation: role from auth metadata + landlord qualify fields.
-- Safe to re-run.

alter table public.profiles
  add column if not exists signup_persona text;

alter table public.profiles
  add column if not exists signup_unit_count integer;

alter table public.profiles
  add column if not exists signup_years text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_signup_persona_check'
  ) then
    alter table public.profiles
      add constraint profiles_signup_persona_check
      check (
        signup_persona is null
        or signup_persona = any (array[
          'manage_own'::text,
          'manage_others'::text,
          'manage_mix'::text,
          'none_yet'::text,
          'broker'::text
        ])
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_signup_years_check'
  ) then
    alter table public.profiles
      add constraint profiles_signup_years_check
      check (
        signup_years is null
        or signup_years = any (array[
          'less_1'::text,
          '1_4'::text,
          '5_10'::text,
          'more_10'::text,
          'none_yet'::text
        ])
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_signup_unit_count_check'
  ) then
    alter table public.profiles
      add constraint profiles_signup_unit_count_check
      check (signup_unit_count is null or signup_unit_count >= 0);
  end if;
end $$;

comment on column public.profiles.signup_persona is
  'Landlord signup qualify: manage_own | manage_others | manage_mix | none_yet | broker';
comment on column public.profiles.signup_unit_count is
  'Self-reported units owned/managed at signup';
comment on column public.profiles.signup_years is
  'Self-reported years managing rentals at signup';

-- Prefer role from auth user_metadata when the profile is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role text := 'landlord';
begin
  if coalesce(new.raw_user_meta_data->>'role', '') = 'tenant' then
    chosen_role := 'tenant';
  end if;

  insert into public.profiles (
    id,
    role,
    signup_persona,
    signup_unit_count,
    signup_years
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
    nullif(new.raw_user_meta_data->>'signup_years', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
