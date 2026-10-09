-- Habify 3.5.2. Run after the original supabase_habit_progression.sql.
-- Restores one deletion per account every 24h, protects rewards across duplicated
-- or reactivated habit ids, fixes progression to seven, and includes the water fix.
-- No account, historical activity, or earned balance is deleted.
BEGIN;
-- A paid mission keeps its identity even if an old duplicate has another row id.
CREATE TABLE IF NOT EXISTS public.habit_reward_guard (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 habit_key text NOT NULL, last_period date, next_reward_at timestamptz,
 rewarded_level integer NOT NULL DEFAULT 1, PRIMARY KEY(user_id,habit_key)
);
CREATE TABLE IF NOT EXISTS public.habit_account_rules (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 delete_available_at timestamptz NOT NULL
);
ALTER TABLE public.habit_reward_guard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_account_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.habit_reward_guard,public.habit_account_rules FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.habit_reward_key(p_catalog text,p_title text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce('catalog:'||p_catalog,
  (SELECT 'catalog:'||id FROM public.habit_catalog WHERE definition->>'title'=p_title ORDER BY id LIMIT 1),
  'title:'||lower(trim(p_title)))
$$;

CREATE OR REPLACE FUNCTION public.habit_goal_title(p_catalog text,p_title text,p_target numeric,p_unit text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_target IS NULL THEN p_title ELSE CASE p_catalog
  WHEN 'hab_water' THEN 'Beber '||p_target||' litros de agua'
  WHEN 'hab_read' THEN 'Leer '||p_target||' páginas de un libro'
  WHEN 'hab_sleep' THEN 'Dormir '||p_target||' horas'
  WHEN 'hab_cardio' THEN 'Hacer '||p_target||' minutos de cardio'
  WHEN 'hab_meditate' THEN 'Meditar '||p_target||' minutos'
  WHEN 'hab_code' THEN 'Estudiar programación '||p_target||' minutos'
  ELSE p_title END END
$$;
REVOKE ALL ON FUNCTION public.habit_reward_key(text,text),public.habit_goal_title(text,text,numeric,text) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public.habit_snapshot(p_avatar text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object(
 'period',public.habit_period((p_now AT TIME ZONE h.habit_timezone)::date,h.frequency),
 'recorded',EXISTS(SELECT 1 FROM public.habit_activity x WHERE x.habit_id=h.id::text
   AND x.period=public.habit_period((p_now AT TIME ZONE h.habit_timezone)::date,h.frequency) AND outcome IN ('completed','legacy')) OR EXISTS(
   SELECT 1 FROM public.habit_reward_guard g JOIN public.avatars a ON a.user_id=g.user_id
   WHERE a.id=h.avatar_id AND g.habit_key=public.habit_reward_key(h.catalog_id,h.title)
   AND (g.next_reward_at>p_now OR g.last_period>=public.habit_period((p_now AT TIME ZONE h.habit_timezone)::date,h.frequency))),
 'current_target',CASE WHEN progression IS NOT NULL THEN least((progression->>'max')::numeric,(progression->>'initial')::numeric+(difficulty_level-1)*(progression->>'step')::numeric) END,
 'rewards',CASE WHEN progression IS NOT NULL THEN public.habit_reward(difficulty_level) ELSE jsonb_build_object('xp',xp_reward,'gold',gold_reward) END
 ) ORDER BY h.created_at),'[]'::jsonb) FROM public.habits h WHERE h.avatar_id::text=p_avatar AND h.archived_at IS NULL
$$;

-- Only the public wrapper supplies the clock. The testable internal function is never granted to clients.
CREATE OR REPLACE FUNCTION public.habit_validate_progression(cfg jsonb,p_type text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF cfg IS NOT NULL THEN
   IF jsonb_typeof(cfg)<>'object' THEN RAISE EXCEPTION 'Invalid progression' USING ERRCODE='22023'; END IF;
   cfg:=jsonb_set(cfg,'{required}','7'::jsonb);
   IF p_type<>'positive' OR jsonb_typeof(cfg)<>'object' OR
    coalesce((cfg->>'initial')::numeric,0)<=0 OR coalesce((cfg->>'step')::numeric,0)<=0 OR
    coalesce((cfg->>'max')::numeric,0)<(cfg->>'initial')::numeric OR (cfg->>'max')::numeric>100000 OR
    ceil(((cfg->>'max')::numeric-(cfg->>'initial')::numeric)/(cfg->>'step')::numeric)>19 OR
    coalesce(cfg->>'unit','') NOT IN ('liters','hours','minutes','pages','units') THEN RAISE EXCEPTION 'Invalid progression' USING ERRCODE='22023'; END IF;
  END IF;

 RETURN cfg;
END $$;

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
  cfg:=nullif(p_config->'progression','null'::jsonb);
  cfg:=public.habit_validate_progression(cfg,def->>'type');
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
   cfg:=public.habit_validate_progression(nullif(p_config->'progression','null'::jsonb),h.type);
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
 'rules_version',2,'server_now',p_now,'delete_available_at',delete_after);
END $$;


-- 3.5.1: daily habits reopen on the next local calendar day. The unique period
-- history, not a rolling legacy timer, prevents a second reward on the same day.
UPDATE public.habits SET available_after=NULL WHERE available_after IS NOT NULL;
-- Repair only the accidental generic water preset. Keep history, streaks,
-- difficulty, earned bonuses and balances intact; custom targets are untouched.
UPDATE public.habits SET progression='{"initial":2,"max":3,"step":1,"required":7,"unit":"liters"}'::jsonb
 WHERE (catalog_id='hab_water' OR title='Beber 2 Litros de Agua')
 AND progression='{"initial":5,"max":20,"step":5,"required":7,"unit":"units"}'::jsonb;
-- 3.5.2: seven scheduled completions are fixed by the server, including old settings.
UPDATE public.habits SET progression=jsonb_set(progression,'{required}','7'::jsonb),progress_count=least(progress_count,6)
 WHERE progression IS NOT NULL AND progression->'required' IS DISTINCT FROM '7'::jsonb;
ALTER TABLE public.habits DROP CONSTRAINT IF EXISTS habit_seven_completions;
ALTER TABLE public.habits ADD CONSTRAINT habit_seven_completions
 CHECK(progression IS NULL OR coalesce(progression->'required'='7'::jsonb,false));

-- Backfill paid eligibility without rewriting historical activities or balances.
INSERT INTO public.habit_reward_guard(user_id,habit_key,rewarded_level)
 SELECT a.user_id,public.habit_reward_key(h.catalog_id,h.title),max(h.rewarded_level)
 FROM public.habits h JOIN public.avatars a ON a.id=h.avatar_id
 GROUP BY a.user_id,public.habit_reward_key(h.catalog_id,h.title)
 ON CONFLICT(user_id,habit_key) DO UPDATE SET rewarded_level=greatest(habit_reward_guard.rewarded_level,excluded.rewarded_level);
INSERT INTO public.habit_reward_guard(user_id,habit_key,last_period,next_reward_at,rewarded_level)
 SELECT x.user_id,public.habit_reward_key(h.catalog_id,coalesce(h.title,x.title)),max(x.period),
 max((x.period+CASE WHEN h.frequency='weekly' THEN 7 ELSE 1 END)::timestamp AT TIME ZONE coalesce(h.habit_timezone,'America/Mexico_City')),
 max(greatest(coalesce(h.rewarded_level,1),x.difficulty+CASE WHEN x.bonus_xp>0 OR x.bonus_gold>0 THEN 1 ELSE 0 END))
 FROM public.habit_activity x LEFT JOIN public.habits h ON h.id::text=x.habit_id
 WHERE x.outcome IN ('completed','legacy')
 GROUP BY x.user_id,public.habit_reward_key(h.catalog_id,coalesce(h.title,x.title))
 ON CONFLICT(user_id,habit_key) DO UPDATE SET last_period=greatest(habit_reward_guard.last_period,excluded.last_period),
 next_reward_at=greatest(habit_reward_guard.next_reward_at,excluded.next_reward_at),
 rewarded_level=greatest(habit_reward_guard.rewarded_level,excluded.rewarded_level);
INSERT INTO public.habit_account_rules(user_id,delete_available_at)
 SELECT user_id,max(created_at)+interval '24 hours' FROM public.habit_events WHERE kind='archived' GROUP BY user_id
 ON CONFLICT(user_id) DO UPDATE SET delete_available_at=greatest(habit_account_rules.delete_available_at,excluded.delete_available_at);

REVOKE ALL ON FUNCTION public.habit_snapshot(text,timestamptz),public.habit_action_at(text,text,jsonb,numeric,date,timestamptz) FROM PUBLIC,anon,authenticated;
COMMIT;
