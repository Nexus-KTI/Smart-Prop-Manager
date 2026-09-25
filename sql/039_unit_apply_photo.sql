-- One public photo and a short note for the existing /apply/{token} page.
-- Safe to re-run. Files live in the unit-photos bucket (created at upload time).

alter table public.units
  add column if not exists photo_url text;

alter table public.units
  add column if not exists apply_note text;

comment on column public.units.photo_url is
  'Public URL for one unit photo on the apply page (Supabase storage unit-photos bucket).';

comment on column public.units.apply_note is
  'Optional short note shown on the apply page. Capped at 280 characters in the API.';
