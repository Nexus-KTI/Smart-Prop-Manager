-- Profile avatars: public URL stored on profiles; files in storage bucket `avatars`.

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL for profile photo (Supabase storage avatars bucket).';
