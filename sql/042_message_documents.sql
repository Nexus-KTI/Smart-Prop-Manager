-- PDF and Word attachments on message threads.
-- Safe to re-run.

alter table public.messages
  add column if not exists media_name text;

alter table public.messages drop constraint if exists messages_media_kind_check;
alter table public.messages
  add constraint messages_media_kind_check
  check (
    media_kind is null
    or media_kind = any (array['image'::text, 'video'::text, 'audio'::text, 'document'::text])
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_media_name_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_media_name_check
      check (media_name is null or char_length(btrim(media_name)) between 1 and 120);
  end if;
end $$;

comment on column public.messages.media_name is
  'Original file name for a document attachment. Not a storage path.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'message-media',
  'message-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
