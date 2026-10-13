-- Habify 3.6.2: real administrator authorization and account isolation.
-- Run after the existing game/habit migrations. Does not grant admin to anyone.
-- Preserves rows and balances. This is not server validation of combat rewards.
BEGIN;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Reads only the current authenticated user's server-managed flag; never email
-- or editable user_metadata. SECURITY DEFINER avoids recursive avatar policies.
CREATE OR REPLACE FUNCTION public.habify_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.avatars WHERE user_id=auth.uid() AND is_admin IS TRUE
 )
$$;
REVOKE ALL ON FUNCTION public.habify_is_admin() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.habify_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.habify_protect_avatar_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF TG_OP='INSERT' THEN
   IF coalesce(NEW.is_admin,false) THEN RAISE EXCEPTION 'Admin is server managed' USING ERRCODE='42501'; END IF;
  ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'Account identity and role are server managed' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.habify_protect_avatar_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS habify_protect_avatar_identity ON public.avatars;
CREATE TRIGGER habify_protect_avatar_identity BEFORE INSERT OR UPDATE ON public.avatars
 FOR EACH ROW EXECUTE FUNCTION public.habify_protect_avatar_identity();

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
-- This legacy policy queried avatars from its own policy, causing recursion.
DROP POLICY IF EXISTS "Admins can view all avatars" ON public.avatars;
REVOKE ALL ON public.avatars FROM PUBLIC,anon;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.avatars FROM authenticated;
GRANT SELECT,INSERT,UPDATE ON public.avatars TO authenticated;
DROP POLICY IF EXISTS habify_avatar_access ON public.avatars;
CREATE POLICY habify_avatar_access ON public.avatars FOR ALL TO authenticated
 USING(user_id=auth.uid() OR public.habify_is_admin())
 WITH CHECK(user_id=auth.uid() OR public.habify_is_admin());
-- A restrictive boundary also constrains any older permissive policies.
DROP POLICY IF EXISTS habify_avatar_boundary ON public.avatars;
CREATE POLICY habify_avatar_boundary ON public.avatars AS RESTRICTIVE FOR ALL TO authenticated
 USING(user_id=auth.uid() OR public.habify_is_admin())
 WITH CHECK(user_id=auth.uid() OR public.habify_is_admin());

DO $$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['shop_items','monsters'] LOOP
  IF to_regclass('public.'||tbl) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tbl);
  EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',tbl);
  EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public.%I TO authenticated',tbl);
  EXECUTE format('DROP POLICY IF EXISTS habify_catalog_read ON public.%I',tbl);
  EXECUTE format('CREATE POLICY habify_catalog_read ON public.%I FOR SELECT TO anon,authenticated USING(true)',tbl);
  EXECUTE format('DROP POLICY IF EXISTS habify_catalog_admin ON public.%I',tbl);
  EXECUTE format('CREATE POLICY habify_catalog_admin ON public.%I FOR ALL TO authenticated USING(public.habify_is_admin()) WITH CHECK(public.habify_is_admin())',tbl);
  EXECUTE format('DROP POLICY IF EXISTS habify_insert_boundary ON public.%I',tbl);
  EXECUTE format('CREATE POLICY habify_insert_boundary ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.habify_is_admin())',tbl);
  EXECUTE format('DROP POLICY IF EXISTS habify_update_boundary ON public.%I',tbl);
  EXECUTE format('CREATE POLICY habify_update_boundary ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.habify_is_admin()) WITH CHECK(public.habify_is_admin())',tbl);
  EXECUTE format('DROP POLICY IF EXISTS habify_delete_boundary ON public.%I',tbl);
  EXECUTE format('CREATE POLICY habify_delete_boundary ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.habify_is_admin())',tbl);
 END LOOP;
 IF to_regclass('public.monsters_id_seq') IS NOT NULL THEN
  GRANT USAGE ON SEQUENCE public.monsters_id_seq TO authenticated;
 END IF;
 FOREACH tbl IN ARRAY ARRAY['habits','inventory','battle_log'] LOOP
  IF to_regclass('public.'||tbl) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',tbl);
  EXECUTE format('DROP POLICY IF EXISTS habify_account_boundary ON public.%I',tbl);
  EXECUTE format('CREATE POLICY habify_account_boundary ON public.%1$I AS RESTRICTIVE FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.avatars a WHERE a.id=%1$I.avatar_id AND a.user_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM public.avatars a WHERE a.id=%1$I.avatar_id AND a.user_id=auth.uid()))',tbl);
 END LOOP;
 IF to_regclass('public.admin_settings') IS NOT NULL THEN
  ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.admin_settings FROM PUBLIC,anon,authenticated;
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_settings TO authenticated;
  DROP POLICY IF EXISTS "Admin settings readable by everyone" ON public.admin_settings;
  DROP POLICY IF EXISTS habify_settings_admin ON public.admin_settings;
  CREATE POLICY habify_settings_admin ON public.admin_settings FOR ALL TO authenticated USING(public.habify_is_admin()) WITH CHECK(public.habify_is_admin());
  DROP POLICY IF EXISTS habify_settings_boundary ON public.admin_settings;
  CREATE POLICY habify_settings_boundary ON public.admin_settings AS RESTRICTIVE FOR ALL TO authenticated USING(public.habify_is_admin()) WITH CHECK(public.habify_is_admin());
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
