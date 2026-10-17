-- NTalk groups EXTRA: add / remove members, leave, rename.
-- Run ONCE in Supabase SQL Editor (after supabase_ntalk_final.sql).

create or replace function public.add_group_members(cid uuid, member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chats where id = cid and is_group = true and created_by = auth.uid())
  then raise exception 'Only the group admin can add members'; end if;
  insert into public.chat_members(chat_id, user_id)
    select cid, p.id from public.profiles p where p.id = any(member_ids)
    on conflict do nothing;
end $$;

create or replace function public.remove_group_member(cid uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chats where id = cid and is_group = true and created_by = auth.uid())
  then raise exception 'Only the group admin can remove members'; end if;
  if member = auth.uid() then raise exception 'Use Leave group instead'; end if;
  delete from public.chat_members where chat_id = cid and user_id = member;
end $$;

create or replace function public.rename_group(cid uuid, new_name text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(new_name, ''));
begin
  if nm = '' then raise exception 'Group name required'; end if;
  if not exists (select 1 from public.chats where id = cid and is_group = true and created_by = auth.uid())
  then raise exception 'Only the group admin can rename the group'; end if;
  update public.chats set name = left(nm, 60) where id = cid;
end $$;

create or replace function public.leave_group(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nxt uuid;
begin
  if not exists (select 1 from public.chats where id = cid and is_group = true) then raise exception 'Not a group'; end if;
  delete from public.chat_members where chat_id = cid and user_id = me;
  -- admin left: hand over to the longest-standing member, or delete the empty group
  if exists (select 1 from public.chats where id = cid and created_by = me) then
    select user_id into nxt from public.chat_members where chat_id = cid order by joined_at limit 1;
    if nxt is null then delete from public.chats where id = cid;
    else update public.chats set created_by = nxt where id = cid; end if;
  end if;
end $$;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
