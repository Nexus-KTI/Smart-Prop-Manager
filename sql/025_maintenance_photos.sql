-- Maintenance request photos: public URL stored on maintenance_requests.photo_url;
-- files live in Supabase storage bucket `maintenance-photos` (created at upload time
-- by the API service role, same pattern as `avatars`).

comment on column public.maintenance_requests.photo_url is
  'Public URL for optional repair photo (Supabase storage maintenance-photos bucket).';
