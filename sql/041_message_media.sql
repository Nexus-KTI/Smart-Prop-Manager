-- Private photos, videos, and voice notes on message threads.
-- Files live in the private `message-media` bucket. The API signs a short-lived URL.
-- Safe to re-run.

alter table public.messages
  add column if not exists media_kind text,
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists media_bytes integer,
  add column if not exists media_duration_ms integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_media_kind_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_media_kind_check
      check (
        media_kind is null
        or media_kind = any (array['image'::text, 'video'::text, 'audio'::text])
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_media_pair_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_media_pair_check
      check (
        (
          media_path is null
          and media_kind is null
          and media_mime is null
        )
        or (
          media_path is not null
          and media_kind is not null
          and media_mime is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_media_bytes_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_media_bytes_check
      check (media_bytes is null or (media_bytes > 0 and media_bytes <= 26214400));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_media_duration_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_media_duration_check
      check (
        media_duration_ms is null
        or (media_duration_ms >= 0 and media_duration_ms <= 600000)
      );
  end if;
end $$;

comment on column public.messages.media_kind is
  'image, video, or audio. Null on text and payment lines.';
comment on column public.messages.media_path is
  'Private object path in the message-media bucket. Never a public URL.';

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
    'audio/wav'
  ]::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
