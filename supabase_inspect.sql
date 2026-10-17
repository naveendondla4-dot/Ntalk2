-- NTalk: Supabase lo em undo telusukodaniki ee okka query run cheyandi (read-only, em change cheyadu).
-- Supabase SQL Editor last statement result matrame chupistundi, anduke anni okka query lo union chesanu.
-- Results lo "section" column tho filter/scroll cheyandi.

select * from (

-- 1) Tables + RLS on/off + approx rows
select 1 as ord, 'tables' as section, c.relname::text as name,
       (case when c.relrowsecurity then 'RLS ON' else 'RLS OFF  <-- check!' end)
       || ' | approx rows: ' || c.reltuples::bigint::text as detail
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'

union all
-- 2) Columns
select 2, 'columns', table_name::text,
       column_name || ' ' || data_type || case when is_nullable='NO' then ' NOT NULL' else '' end
         || coalesce(' default '||column_default,'')
from information_schema.columns where table_schema='public'

union all
-- 3) RLS policies
select 3, 'policies', tablename||' :: '||policyname,
       cmd||' to '||array_to_string(roles,',')||
       ' | using: '||coalesce(qual,'-')||' | check: '||coalesce(with_check,'-')
from pg_policies where schemaname='public'

union all
-- 4) Functions / RPCs
select 4, 'functions', p.proname::text,
       pg_get_function_arguments(p.oid)||' -> '||pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'

union all
-- 5) Full definition of the chat RPC the app calls
select 5, 'rpc_definition', p.proname::text, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='get_or_create_direct_chat'

union all
-- 6) Triggers (auth.users -> profiles auto-create undo ledo)
select 6, 'triggers', event_object_schema||'.'||event_object_table,
       trigger_name||' ('||event_manipulation||' '||action_timing||') -> '||action_statement
from information_schema.triggers where event_object_schema in ('public','auth')

union all
-- 7) Realtime publication lo e tables unnayi (messages undali)
select 7, 'realtime', schemaname||'.'||tablename, pubname
from pg_publication_tables where pubname='supabase_realtime'

union all
-- 8) messages replica identity (FULL kavali)
select 8, 'replica_identity', relname::text,
       case relreplident when 'f' then 'FULL' when 'd' then 'default  <-- should be FULL' else relreplident::text end
from pg_class where oid='public.messages'::regclass

union all
-- 9) Storage buckets
select 9, 'buckets', id::text,
       case when public then 'PUBLIC' else 'private' end||' | size limit: '||coalesce(file_size_limit::text,'none')
from storage.buckets

union all
-- 10) Storage policies
select 10, 'storage_policies', policyname::text,
       cmd||' | using: '||coalesce(qual,'-')||' | check: '||coalesce(with_check,'-')
from pg_policies where schemaname='storage' and tablename='objects'

union all
-- 11) Row counts
select 11, 'counts', 'auth.users', count(*)::text from auth.users
union all select 11, 'counts', 'profiles', count(*)::text from public.profiles
union all select 11, 'counts', 'chats', count(*)::text from public.chats
union all select 11, 'counts', 'chat_members', count(*)::text from public.chat_members
union all select 11, 'counts', 'messages', count(*)::text from public.messages

union all
-- 12) Register aina kani profile row ledu (People list lo kanipincharu)
select 12, 'users_without_profile', u.id::text, u.email::text
from auth.users u left join public.profiles p on p.id=u.id where p.id is null

union all
-- 13) RLS ON kani policy ledu -> anni block avtayi
select 13, 'rls_no_policy', c.relname::text, 'RLS ON but NO policy -> all access blocked'
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)

) t
order by ord, name, detail;
