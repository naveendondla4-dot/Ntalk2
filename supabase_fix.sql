-- NTalk FIX: inspect result batti mee DB lo lekunda unnavi add chestundi. Okasari run cheyandi (safe to re-run).

-- 1) Chat RPC (idi ledu! app chat open cheyalekapovadaniki main karanam)
create or replace function public.get_or_create_direct_chat(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other_user_id is null or other_user_id = me then raise exception 'invalid user'; end if;

  select c.id into cid
  from public.chats c
  where c.chat_type = 'private'
    and exists (select 1 from public.chat_members m where m.chat_id = c.id and m.user_id = me)
    and exists (select 1 from public.chat_members m where m.chat_id = c.id and m.user_id = other_user_id)
    and (select count(*) from public.chat_members m where m.chat_id = c.id) = 2
  limit 1;

  if cid is null then
    insert into public.chats (chat_type, created_by) values ('private', me) returning id into cid;
    insert into public.chat_members (chat_id, user_id) values (cid, me), (cid, other_user_id);
  end if;

  return cid;
end;
$$;

revoke all on function public.get_or_create_direct_chat(uuid) from public, anon;
grant execute on function public.get_or_create_direct_chat(uuid) to authenticated;

-- 2) Delivered/seen update (supabase_patch.sql lo undi kani mee DB lo ledu)
drop policy if exists "Chat members can update delivery state" on public.messages;
create policy "Chat members can update delivery state"
on public.messages for update to authenticated
using (exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()))
with check (exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()));

-- 3) Media bucket: app 'ntalk-media' vadutundi, mee bucket peru "Ntalk media" (space). Kotta private bucket + policies.
insert into storage.buckets (id, name, public)
values ('ntalk-media', 'ntalk-media', false)
on conflict (id) do nothing;

drop policy if exists "ntalk-media upload own folder" on storage.objects;
create policy "ntalk-media upload own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'ntalk-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ntalk-media read" on storage.objects;
create policy "ntalk-media read"
on storage.objects for select to authenticated
using (bucket_id = 'ntalk-media');

-- 4) Check: ee function ippudu undo lekho
select proname from pg_proc where proname = 'get_or_create_direct_chat';
