-- Locale preferences for account settings (NG defaults).
alter table public.profiles
  add column if not exists timezone text not null default 'Africa/Lagos';

alter table public.profiles
  add column if not exists date_format text not null default 'dd/mm/yyyy';

alter table public.profiles
  drop constraint if exists profiles_date_format_check;

alter table public.profiles
  add constraint profiles_date_format_check
  check (date_format in ('dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd'));

comment on column public.profiles.timezone is
  'IANA timezone for display (default Africa/Lagos)';
comment on column public.profiles.date_format is
  'Preferred date display format';
