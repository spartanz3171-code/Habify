-- Habify 3.6.1. Run after progression + reward guards (3.5.2 or newer).
-- For a fresh installation use supabase_habit_progression.sql instead.
BEGIN;
-- Progression belongs to the mission, never to client-supplied quantities.
CREATE OR REPLACE FUNCTION public.habit_fixed_progression(p_catalog text,p_type text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_type='positive' THEN CASE p_catalog
  WHEN 'hab_water' THEN '{"initial":2,"max":3,"step":1,"required":7,"unit":"liters"}'::jsonb
  WHEN 'hab_sleep' THEN '{"initial":5,"max":8,"step":1,"required":7,"unit":"hours"}'::jsonb
  WHEN 'hab_read' THEN '{"initial":5,"max":30,"step":5,"required":7,"unit":"pages"}'::jsonb
  WHEN 'hab_cardio' THEN '{"initial":10,"max":40,"step":10,"required":7,"unit":"minutes"}'::jsonb
  WHEN 'hab_meditate' THEN '{"initial":5,"max":20,"step":5,"required":7,"unit":"minutes"}'::jsonb
  WHEN 'hab_code' THEN '{"initial":15,"max":60,"step":15,"required":7,"unit":"minutes"}'::jsonb
 END END
$$;
REVOKE ALL ON FUNCTION public.habit_fixed_progression(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.habit_action_at(p_action text,p_id text,p_config jsonb,p_value numeric,p_expected_period date,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE a public.avatars%ROWTYPE; h public.habits%ROWTYPE; g public.habit_reward_guard%ROWTYPE; def jsonb; cfg jsonb;
 today date; period date; target numeric; top numeric; reward jsonb; xp integer:=0; gold integer:=0;
 bx integer:=0; bg integer:=0; avatar_bonus integer:=0; advanced boolean:=false; status text:='saved';
 item record; tz text; freq text; v_catalog text; existed boolean; reward_key text; delete_after timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.avatars WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avatar not found' USING ERRCODE='42501'; END IF;
 SELECT delete_available_at INTO delete_after FROM public.habit_account_rules WHERE user_id=auth.uid();
 IF p_action='list' THEN
  FOR item IN SELECT id::text AS id FROM public.habits WHERE avatar_id=a.id AND archived_at IS NULL LOOP
   PERFORM public.habit_reconcile(item.id,p_now);
  END LOOP;
 ELSIF p_action='create' THEN
  v_catalog:=p_config->>'catalog_id';
  SELECT definition INTO def FROM public.habit_catalog WHERE id=v_catalog;
  IF def IS NULL THEN RAISE EXCEPTION 'Unknown catalog item' USING ERRCODE='22023'; END IF;
  -- Reuse archived identity: deleting/recreating cannot reset reward eligibility.
  SELECT * INTO h FROM public.habits WHERE avatar_id=a.id AND (catalog_id=v_catalog OR title=def->>'title') ORDER BY (archived_at IS NULL) DESC,created_at LIMIT 1 FOR UPDATE;
  existed:=FOUND;
  IF existed AND h.archived_at IS NULL THEN RAISE EXCEPTION 'Habit already active' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.habits WHERE avatar_id=a.id AND archived_at IS NULL)>=20 THEN RAISE EXCEPTION 'Habit limit reached' USING ERRCODE='22023'; END IF;
  tz:=coalesce(p_config->>'timezone','America/Mexico_City');
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=tz) THEN RAISE EXCEPTION 'Invalid timezone' USING ERRCODE='22023'; END IF;
  freq:=coalesce(p_config->>'frequency',def->>'defaultFrequency','daily');
  IF freq NOT IN ('daily','workdays','3x_week','2x_week','weekly') THEN RAISE EXCEPTION 'Invalid frequency' USING ERRCODE='22023'; END IF;
  cfg:=public.habit_fixed_progression(v_catalog,def->>'type');
  IF existed THEN
   status:='reactivated';
   -- A reactivation preserves schedule, difficulty and eligibility. Reconfiguration has its own action.
   UPDATE public.habits SET archived_at=NULL,catalog_id=v_catalog,checked_through=(p_now AT TIME ZONE habit_timezone)::date-1,
    progress_count=0,current_streak=0 WHERE id=h.id RETURNING * INTO h;
  ELSE
   h.id:=gen_random_uuid(); h.avatar_id:=a.id;
   INSERT INTO public.habits(id,avatar_id,title,type,xp_reward,hp_penalty,gold_reward,frequency,description,catalog_id,habit_timezone,progression,checked_through,created_at)
   VALUES(h.id,a.id,def->>'title',def->>'type',(def->>'xpReward')::integer,(def->>'hpPenalty')::integer,(def->>'goldReward')::integer,
    freq,coalesce(def->>'description',''),v_catalog,tz,cfg,(p_now AT TIME ZONE tz)::date-1,p_now) RETURNING * INTO h;
  END IF;
  INSERT INTO public.habit_events(user_id,habit_id,kind) VALUES(auth.uid(),h.id::text,'activated');
 ELSE
  SELECT * INTO h FROM public.habits WHERE id::text=p_id AND avatar_id=a.id FOR UPDATE;
  IF NOT FOUND OR h.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Habit not found' USING ERRCODE='42501'; END IF;
  PERFORM public.habit_reconcile(p_id,p_now);
  SELECT * INTO h FROM public.habits WHERE id::text=p_id;
  SELECT * INTO a FROM public.avatars WHERE id=a.id;
  today:=(p_now AT TIME ZONE h.habit_timezone)::date;
  period:=public.habit_period(today,h.frequency);
  reward_key:=public.habit_reward_key(h.catalog_id,h.title);
  SELECT * INTO g FROM public.habit_reward_guard WHERE user_id=auth.uid() AND habit_key=reward_key;
  IF p_action='reset' THEN
   UPDATE public.habits SET difficulty_level=1,progress_count=0,current_streak=0 WHERE id=h.id;
   INSERT INTO public.habit_events(user_id,habit_id,kind) VALUES(auth.uid(),p_id,'reset');
  ELSIF p_action='archive' THEN
   IF delete_after>p_now THEN status:='delete_cooldown';
   ELSE
    UPDATE public.habits SET archived_at=p_now WHERE id=h.id;
    delete_after:=p_now+interval '24 hours';
    INSERT INTO public.habit_account_rules(user_id,delete_available_at) VALUES(auth.uid(),delete_after)
     ON CONFLICT(user_id) DO UPDATE SET delete_available_at=excluded.delete_available_at;
    INSERT INTO public.habit_events(user_id,habit_id,kind,created_at) VALUES(auth.uid(),p_id,'archived',p_now);
   END IF;
  ELSIF p_action='configure' THEN
   IF h.progression IS NOT NULL THEN RAISE EXCEPTION 'Progression already configured' USING ERRCODE='22023'; END IF;
   cfg:=public.habit_fixed_progression(h.catalog_id,h.type);
   IF cfg IS NULL THEN RAISE EXCEPTION 'Progression required' USING ERRCODE='22023'; END IF;
   UPDATE public.habits SET progression=cfg,difficulty_level=1,progress_count=0 WHERE id=h.id;
   INSERT INTO public.habit_events(user_id,habit_id,kind) VALUES(auth.uid(),p_id,'configured');
  ELSIF p_action='complete' THEN
   IF period IS NULL OR p_now<h.available_after THEN status:='not_due';
   ELSIF p_expected_period IS DISTINCT FROM period THEN status:='period_changed';
   ELSIF g.next_reward_at>p_now OR g.last_period>=period THEN status:='already_recorded';
   ELSIF EXISTS(SELECT 1 FROM public.habit_activity x WHERE x.habit_id=p_id AND x.period=period AND x.outcome IN ('completed','legacy')) THEN status:='already_recorded';
   ELSE
    IF h.progression IS NOT NULL THEN
     target:=least((h.progression->>'max')::numeric,(h.progression->>'initial')::numeric+(h.difficulty_level-1)*(h.progression->>'step')::numeric);
     top:=(h.progression->>'max')::numeric;
     IF p_value IS NULL OR p_value<0 OR p_value>100000 OR p_value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid measurement' USING ERRCODE='22023'; END IF;
    END IF;
    IF target IS NOT NULL AND p_value<target THEN
     status:='below_target';
     UPDATE public.habits SET current_streak=0,progress_count=0 WHERE id=h.id;
    ELSE
     status:='completed';
     IF h.type='positive' THEN
      reward:=CASE WHEN h.progression IS NULL THEN jsonb_build_object('xp',h.xp_reward,'gold',h.gold_reward) ELSE public.habit_reward(h.difficulty_level) END;
      xp:=(reward->>'xp')::integer; gold:=(reward->>'gold')::integer;
      h.current_streak:=h.current_streak+1; h.best_streak:=greatest(h.best_streak,h.current_streak);
      h.rewarded_level:=greatest(h.rewarded_level,coalesce(g.rewarded_level,1));
      IF target<top THEN
       h.progress_count:=h.progress_count+1;
       IF h.progress_count>=7 THEN
        h.difficulty_level:=h.difficulty_level+1; h.progress_count:=0; advanced:=true;
        IF h.difficulty_level>h.rewarded_level THEN bx:=(reward->>'bonus_xp')::integer; bg:=(reward->>'bonus_gold')::integer; END IF;
        h.rewarded_level:=greatest(h.rewarded_level,h.difficulty_level);
       END IF;
      END IF;
      a.current_xp:=a.current_xp+xp+bx; a.gold:=a.gold+gold+bg;
      IF a.is_dead THEN a.is_dead:=false; a.hp:=30; END IF;
      WHILE a.current_xp>=a.xp_to_level AND a.xp_to_level>0 LOOP
       a.current_xp:=a.current_xp-a.xp_to_level; a.level:=a.level+1;
       a.xp_to_level:=floor(a.xp_to_level*1.5); a.gold:=a.gold+25; avatar_bonus:=avatar_bonus+25; a.hp:=least(a.max_hp,a.hp+20);
      END LOOP;
     ELSE
      a.hp:=greatest(0,a.hp-h.hp_penalty);
      IF a.hp=0 AND NOT a.is_dead THEN a.current_xp:=greatest(0,a.current_xp-20); a.is_dead:=true; END IF;
     END IF;
     UPDATE public.habits SET completed_at=p_now,current_streak=h.current_streak,best_streak=h.best_streak,
      difficulty_level=h.difficulty_level,progress_count=h.progress_count,rewarded_level=h.rewarded_level WHERE id=h.id;
     UPDATE public.avatars SET current_xp=a.current_xp,gold=a.gold,hp=a.hp,is_dead=a.is_dead,level=a.level,xp_to_level=a.xp_to_level,updated_at=p_now WHERE id=a.id;
     INSERT INTO public.habit_reward_guard(user_id,habit_key,last_period,next_reward_at,rewarded_level)
      VALUES(auth.uid(),reward_key,period,((period+CASE WHEN h.frequency='weekly' THEN 7 ELSE 1 END)::timestamp AT TIME ZONE h.habit_timezone),h.rewarded_level)
      ON CONFLICT(user_id,habit_key) DO UPDATE SET last_period=excluded.last_period,next_reward_at=excluded.next_reward_at,
       rewarded_level=greatest(habit_reward_guard.rewarded_level,excluded.rewarded_level);
    END IF;
    INSERT INTO public.habit_activity(user_id,habit_id,period,title,measured,target,difficulty,outcome,xp,gold,bonus_xp,bonus_gold,avatar_bonus_gold,created_at)
     VALUES(auth.uid(),p_id,period,public.habit_goal_title(h.catalog_id,h.title,target,h.progression->>'unit'),p_value,target,CASE WHEN advanced THEN h.difficulty_level-1 ELSE h.difficulty_level END,status,xp,gold,bx,bg,avatar_bonus,p_now)
     ON CONFLICT ON CONSTRAINT habit_activity_habit_id_period_key DO UPDATE SET measured=excluded.measured,target=excluded.target,difficulty=excluded.difficulty,
      outcome=excluded.outcome,xp=excluded.xp,gold=excluded.gold,bonus_xp=excluded.bonus_xp,bonus_gold=excluded.bonus_gold,avatar_bonus_gold=excluded.avatar_bonus_gold,created_at=excluded.created_at;
   END IF;
  ELSE RAISE EXCEPTION 'Unknown action' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO a FROM public.avatars WHERE id=a.id;
 RETURN jsonb_build_object('status',status,'avatar',to_jsonb(a),'habits',public.habit_snapshot(a.id::text,p_now),
 'xp',xp,'gold',gold,'bonus_xp',bx,'bonus_gold',bg,'advanced',advanced,'habit_id',h.id,
 'rules_version',3,'server_now',p_now,'delete_available_at',delete_after);
END $$;

-- Apply fixed stages to active and archived habits. Preserve history, streaks,
-- paid periods and bonus eligibility; no currency or retroactive bonuses are issued.
UPDATE public.habits h SET catalog_id=c.id FROM public.habit_catalog c
 WHERE h.catalog_id IS NULL AND h.title=c.definition->>'title';
WITH fixed AS (
 SELECT id,public.habit_fixed_progression(catalog_id,type) AS cfg FROM public.habits
)
UPDATE public.habits h SET progression=f.cfg,
 difficulty_level=CASE WHEN f.cfg IS NULL THEN 1 ELSE greatest(1,least(h.difficulty_level,
  1+ceil(((f.cfg->>'max')::numeric-(f.cfg->>'initial')::numeric)/(f.cfg->>'step')::numeric)::int)) END,
 progress_count=CASE WHEN f.cfg IS NULL THEN 0 ELSE least(h.progress_count,6) END
 FROM fixed f WHERE h.id=f.id AND h.progression IS DISTINCT FROM f.cfg;
NOTIFY pgrst,'reload schema';
COMMIT;
