-- Habify: repair battle setup on installations without the optional monster catalog.
-- Run after supabase_economy_security.sql. Safe to repeat; preserves balances,
-- inventory, habits, battle history, pending battles and daily reward limits.
BEGIN;

CREATE OR REPLACE FUNCTION public.combat_open(p_user uuid,p_engine_version text,p_opponent_sprite text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.avatars%ROWTYPE; battle public.verified_battles%ROWTYPE;
 owned jsonb; catalog jsonb; habit record;
BEGIN
 SELECT * INTO account FROM public.avatars WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avatar not found' USING ERRCODE='42501'; END IF;
 FOR habit IN SELECT id::text AS id FROM public.habits WHERE avatar_id=account.id AND archived_at IS NULL LOOP
  PERFORM public.habit_reconcile(habit.id,now());
 END LOOP;
 SELECT * INTO account FROM public.avatars WHERE id=account.id;
 IF account.is_dead OR account.hp<=0 THEN RAISE EXCEPTION 'Complete a habit to revive first' USING ERRCODE='22023'; END IF;
 SELECT * INTO battle FROM public.verified_battles WHERE user_id=p_user AND result IS NULL
  AND engine_version=p_engine_version AND created_at>now()-interval '20 minutes'
  ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN to_jsonb(battle); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(product)),'[]'::jsonb) INTO owned
  FROM public.inventory inventory JOIN public.shop_items product ON product.id=inventory.item_id WHERE inventory.avatar_id=account.id;
 -- The monster catalog is optional; the shared server engine already has
 -- built-in rivals. Older installations may never have created this table.
 IF to_regclass('public.monsters') IS NULL THEN
  catalog:='[]'::jsonb;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(monster) ORDER BY monster.id),'[]'::jsonb) INTO catalog FROM public.monsters monster;
 END IF;
 INSERT INTO public.verified_battles(user_id,avatar_id,engine_version,snapshot)
  VALUES(p_user,account.id::text,p_engine_version,jsonb_build_object('avatar',to_jsonb(account),'inventory',owned,'monsters',catalog,'opponent_sprite',p_opponent_sprite))
  RETURNING * INTO battle;
 RETURN to_jsonb(battle);
END $$;

REVOKE ALL ON FUNCTION public.combat_open(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.combat_open(uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
