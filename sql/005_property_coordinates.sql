-- Optional geocoding fields for property addresses (Places Autocomplete).
-- Safe to re-run.

alter table public.properties
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column public.properties.latitude is 'Optional latitude from address autocomplete';
comment on column public.properties.longitude is 'Optional longitude from address autocomplete';
