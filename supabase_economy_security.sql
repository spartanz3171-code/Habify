-- Habify: run manually after security hardening and habit cycles v5.
BEGIN;

ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS economy_version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.habify_protect_economy()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE slot record; equipped text;
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME<>'avatars' OR TG_OP<>'UPDATE' THEN
  RAISE EXCEPTION 'Economy is server managed' USING ERRCODE='42501';
 END IF;
 IF (NEW.gold,NEW.current_xp,NEW.xp_to_level,NEW.level,NEW.hp,NEW.max_hp,NEW.is_dead,NEW.economy_version,
      NEW.last_penalty_check,NEW.last_habit_modified)
  IS DISTINCT FROM (OLD.gold,OLD.current_xp,OLD.xp_to_level,OLD.level,OLD.hp,OLD.max_hp,OLD.is_dead,OLD.economy_version,
      OLD.last_penalty_check,OLD.last_habit_modified) THEN
  RAISE EXCEPTION 'Economy is server managed' USING ERRCODE='42501';
 END IF;
 FOR slot IN SELECT * FROM (VALUES
  ('equipped_background','background'),('equipped_pet','pet'),('equipped_weapon','weapon'),
  ('equipped_shield','shield'),('equipped_spell','spell')) AS slots(field,kind) LOOP
  FOR equipped IN SELECT unnest(string_to_array(to_jsonb(NEW)->>slot.field,',')) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.inventory owned JOIN public.shop_items product ON product.id=owned.item_id
     WHERE owned.avatar_id=NEW.id AND product.id::text=equipped AND product.type=slot.kind) THEN
     RAISE EXCEPTION 'Equipment is not owned' USING ERRCODE='42501';
    END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.habify_protect_economy() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS habify_protect_economy ON public.avatars;
CREATE TRIGGER habify_protect_economy BEFORE INSERT OR UPDATE OR DELETE ON public.avatars
 FOR EACH ROW EXECUTE FUNCTION public.habify_protect_economy();
DROP TRIGGER IF EXISTS habify_protect_economy ON public.inventory;
CREATE TRIGGER habify_protect_economy BEFORE INSERT OR UPDATE OR DELETE ON public.inventory
 FOR EACH ROW EXECUTE FUNCTION public.habify_protect_economy();
DROP TRIGGER IF EXISTS habify_protect_economy ON public.battle_log;
CREATE TRIGGER habify_protect_economy BEFORE INSERT OR UPDATE OR DELETE ON public.battle_log
 FOR EACH ROW EXECUTE FUNCTION public.habify_protect_economy();
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inventory,public.battle_log FROM PUBLIC,anon,authenticated;
REVOKE INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.avatars FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.purchase_shop_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 account public.avatars%ROWTYPE;
 product public.shop_items%ROWTYPE;
 habit record;
 action_time timestamptz:=now();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO account FROM public.avatars WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avatar not found' USING ERRCODE='42501'; END IF;
 FOR habit IN SELECT id::text AS id FROM public.habits WHERE avatar_id=account.id AND archived_at IS NULL LOOP
  PERFORM public.habit_reconcile(habit.id,action_time);
 END LOOP;
 SELECT * INTO account FROM public.avatars WHERE id=account.id;
 SELECT * INTO product FROM public.shop_items WHERE id::text=p_item_id FOR SHARE;
 IF NOT FOUND OR product.cost IS NULL OR product.cost<0 THEN
  RAISE EXCEPTION 'Invalid shop item' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory WHERE avatar_id=account.id AND item_id=product.id) THEN
  RETURN jsonb_build_object('status','owned','item_id',product.id,'avatar',to_jsonb(account));
 END IF;
 IF account.gold IS NULL OR account.gold<product.cost THEN
  RETURN jsonb_build_object('status','insufficient_gold','item_id',product.id,'avatar',to_jsonb(account));
 END IF;
 INSERT INTO public.inventory(avatar_id,item_id) VALUES(account.id,product.id);
 UPDATE public.avatars SET gold=gold-product.cost,updated_at=action_time
  WHERE id=account.id RETURNING * INTO account;
 RETURN jsonb_build_object('status','purchased','item_id',product.id,'avatar',to_jsonb(account));
END $$;

REVOKE ALL ON FUNCTION public.purchase_shop_item(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.verified_battles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 avatar_id text NOT NULL,engine_version text NOT NULL,snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),result jsonb
);
CREATE INDEX IF NOT EXISTS verified_battles_user_time ON public.verified_battles(user_id,created_at DESC);
ALTER TABLE public.verified_battles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_battles FROM PUBLIC,anon,authenticated;

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
 SELECT coalesce(jsonb_agg(to_jsonb(monster) ORDER BY monster.id),'[]'::jsonb) INTO catalog FROM public.monsters monster;
 INSERT INTO public.verified_battles(user_id,avatar_id,engine_version,snapshot)
  VALUES(p_user,account.id::text,p_engine_version,jsonb_build_object('avatar',to_jsonb(account),'inventory',owned,'monsters',catalog,'opponent_sprite',p_opponent_sprite))
  RETURNING * INTO battle;
 RETURN to_jsonb(battle);
END $$;

CREATE OR REPLACE FUNCTION public.combat_read(p_user uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(battle) FROM public.verified_battles battle WHERE id=p_id AND user_id=p_user
$$;

CREATE OR REPLACE FUNCTION public.combat_settle(p_user uuid,p_id uuid,p_won boolean,p_fled boolean,
 p_frames integer,p_xp integer,p_gold integer,p_opponent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.avatars%ROWTYPE; battle public.verified_battles%ROWTYPE;
 bonus integer:=0; lost integer:=0; habit record;
BEGIN
 SELECT * INTO account FROM public.avatars WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avatar not found' USING ERRCODE='42501'; END IF;
 SELECT * INTO battle FROM public.verified_battles WHERE id=p_id AND user_id=p_user AND avatar_id=account.id::text FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found' USING ERRCODE='42501'; END IF;
 IF battle.result IS NOT NULL THEN RETURN battle.result||jsonb_build_object('avatar',to_jsonb(account)); END IF;
 IF p_won IS NULL OR p_fled IS NULL OR (p_won AND p_fled) OR p_frames IS NULL OR p_frames<0 OR p_frames>72000
  OR p_xp IS NULL OR p_gold IS NULL OR p_xp<0 OR p_gold<0 OR p_xp>1000000 OR p_gold>1000000
  OR (NOT p_won AND (p_xp<>0 OR p_gold<>0)) OR p_opponent IS NULL
  OR now()>battle.created_at+interval '20 minutes'
  OR p_frames/120.0>extract(epoch FROM now()-battle.created_at)+1 THEN
  RAISE EXCEPTION 'Invalid battle settlement' USING ERRCODE='22023';
 END IF;
 FOR habit IN SELECT id::text AS id FROM public.habits WHERE avatar_id=account.id AND archived_at IS NULL LOOP
  PERFORM public.habit_reconcile(habit.id,now());
 END LOOP;
 SELECT * INTO account FROM public.avatars WHERE id=account.id;
 IF p_won THEN
  account.current_xp:=account.current_xp+p_xp; account.gold:=account.gold+p_gold;
  account.hp:=least(account.max_hp,account.hp+5); account.is_dead:=account.hp<=0;
  WHILE account.xp_to_level>0 AND account.current_xp>=account.xp_to_level LOOP
   account.current_xp:=account.current_xp-account.xp_to_level; account.level:=account.level+1;
   account.xp_to_level:=floor(account.xp_to_level*1.5); account.gold:=account.gold+25;
   bonus:=bonus+25; account.hp:=least(account.max_hp,account.hp+20);
  END LOOP;
 ELSE
  lost:=least(greatest(account.hp-1,0),CASE WHEN p_fled THEN 10 ELSE 20 END);
  account.hp:=account.hp-lost; account.is_dead:=account.hp<=0;
 END IF;
 UPDATE public.avatars SET current_xp=account.current_xp,gold=account.gold,hp=account.hp,is_dead=account.is_dead,
  level=account.level,xp_to_level=account.xp_to_level,updated_at=now() WHERE id=account.id RETURNING * INTO account;
 INSERT INTO public.battle_log(avatar_id,opponent,won,xp_gained,gold_gained,hp_lost)
  VALUES(account.id,p_opponent,p_won,p_xp,p_gold+bonus,lost);
 battle.result:=jsonb_build_object('status','settled','battle_id',p_id,'won',p_won,'fled',p_fled,
  'xp',p_xp,'gold',p_gold,'avatar_bonus_gold',bonus,'hp_lost',lost,'opponent',p_opponent);
 UPDATE public.verified_battles SET result=battle.result WHERE id=p_id;
 RETURN battle.result||jsonb_build_object('avatar',to_jsonb(account));
END $$;

REVOKE ALL ON FUNCTION public.combat_open(uuid,text,text),public.combat_read(uuid,uuid),
 public.combat_settle(uuid,uuid,boolean,boolean,integer,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.combat_open(uuid,text,text),public.combat_read(uuid,uuid),
 public.combat_settle(uuid,uuid,boolean,boolean,integer,integer,integer,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;