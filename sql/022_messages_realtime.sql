-- Enable Realtime for messages hub + allow participants to see peer read cursors.
-- Safe to re-run.

-- Participants need SELECT on the other person's read cursor for live Sent/Read.
drop policy if exists message_thread_reads_own on public.message_thread_reads;

drop policy if exists message_thread_reads_select_participants on public.message_thread_reads;
create policy message_thread_reads_select_participants
  on public.message_thread_reads
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.message_threads t
      where t.id = message_thread_reads.thread_id
        and (t.landlord_id = auth.uid() or t.tenant_user_id = auth.uid())
    )
  );

drop policy if exists message_thread_reads_write_own on public.message_thread_reads;
create policy message_thread_reads_write_own
  on public.message_thread_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime publication (ignore if already added).
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.message_threads;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.message_thread_reads;
  exception
    when duplicate_object then null;
  end;
end $$;
