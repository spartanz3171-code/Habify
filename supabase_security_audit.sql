-- READ ONLY. Run in Supabase SQL Editor to inspect the installed database.
-- Does not read account content, passwords or tokens.
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;

SELECT tablename,policyname,permissive,roles,cmd,qual,with_check
 FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;

SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated') ORDER BY table_name,grantee,privilege_type;

SELECT p.proname AS function_name,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous_can_call,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS signed_in_can_call
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname;

SELECT count(*) FILTER(WHERE is_admin IS TRUE) AS administrator_accounts FROM public.avatars;
