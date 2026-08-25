-- Signup: allow artisan role from auth user_metadata at profile create.
-- Safe to re-run.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role text := 'landlord';
  meta_role text := coalesce(new.raw_user_meta_data->>'role', '');
begin
  if meta_role = 'tenant' then
    chosen_role := 'tenant';
  elsif meta_role = 'artisan' then
    chosen_role := 'artisan';
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
