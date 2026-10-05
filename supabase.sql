-- NTalk advanced Supabase schema
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null default 'NTalk User',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  file_url text,
  file_name text,
  file_type text,
  delivered_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_not_self check (sender_id <> receiver_id)
);

create index if not exists messages_sender_receiver_idx on public.messages(sender_id, receiver_id, created_at);
create index if not exists messages_receiver_idx on public.messages(receiver_id, created_at);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id=auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages for select to authenticated using (sender_id=auth.uid() or receiver_id=auth.uid());

drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender" on public.messages for insert to authenticated with check (sender_id=auth.uid());

drop policy if exists "messages_update_receiver" on public.messages;
create policy "messages_update_receiver" on public.messages for update to authenticated using (receiver_id=auth.uid()) with check (receiver_id=auth.uid());

-- Storage bucket for chat media
insert into storage.buckets (id,name,public)
values ('ntalk-media','ntalk-media',true)
on conflict (id) do update set public=true;

drop policy if exists "ntalk_media_read" on storage.objects;
create policy "ntalk_media_read" on storage.objects for select to public using (bucket_id='ntalk-media');

drop policy if exists "ntalk_media_upload" on storage.objects;
create policy "ntalk_media_upload" on storage.objects for insert to authenticated with check (bucket_id='ntalk-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "ntalk_media_delete" on storage.objects;
create policy "ntalk_media_delete" on storage.objects for delete to authenticated using (bucket_id='ntalk-media' and owner_id=auth.uid()::text);

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;