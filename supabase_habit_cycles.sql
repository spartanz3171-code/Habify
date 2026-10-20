-- Habify: activation-anchored habit cycles and personal challenges (rules v4).
-- Run AFTER supabase_habit_fixed_progression.sql. For a fresh installation run
-- supabase_habit_progression.sql, supabase_habit_fixed_progression.sql, then this file.
-- This migration preserves balances/history and grants existing active habits a
-- fresh first cycle. It never charges for time elapsed before this upgrade.
BEGIN;

ALTER TABLE public.habits
 ADD COLUMN IF NOT EXISTS cycle_start_at timestamptz,
 ADD COLUMN IF NOT EXISTS cycle_end_at timestamptz,
 ADD COLUMN IF NOT EXISTS missed_cycles integer NOT NULL DEFAULT 0;
ALTER TABLE public.habit_activity
 ADD COLUMN IF NOT EXISTS cycle_start_at timestamptz,
 ADD COLUMN IF NOT EXISTS cycle_end_at timestamptz,
 ADD COLUMN IF NOT EXISTS success_at timestamptz,
 ADD COLUMN IF NOT EXISTS lapse_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS hp_lost integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS gold_lost integer NOT NULL DEFAULT 0;
ALTER TABLE public.habit_events ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.habit_reward_guard ADD COLUMN IF NOT EXISTS last_lapse_at timestamptz;
-- Calendar-only history remains unique independently of new timestamp cycles.
ALTER TABLE public.habit_activity DROP CONSTRAINT IF EXISTS habit_activity_habit_id_period_key;
CREATE UNIQUE INDEX IF NOT EXISTS habit_activity_legacy_period_key
 ON public.habit_activity(habit_id,period) WHERE cycle_start_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS habit_activity_cycle_key
 ON public.habit_activity(habit_id,cycle_start_at) WHERE cycle_start_at IS NOT NULL;
ALTER TABLE public.habit_activity DROP CONSTRAINT IF EXISTS habit_activity_outcome_check;
ALTER TABLE public.habit_activity ADD CONSTRAINT habit_activity_outcome_check
 CHECK(outcome IN ('completed','missed','below_target','legacy','abstained','lapsed'));
ALTER TABLE public.habits DROP CONSTRAINT IF EXISTS habit_cycle_bounds;
ALTER TABLE public.habits ADD CONSTRAINT habit_cycle_bounds CHECK(
 (cycle_start_at IS NULL AND cycle_end_at IS NULL) OR
 (cycle_start_at IS NOT NULL AND cycle_end_at IS NOT NULL AND cycle_end_at>cycle_start_at));
ALTER TABLE public.habits DROP CONSTRAINT IF EXISTS habit_missed_cycle_bounds;
ALTER TABLE public.habits ADD CONSTRAINT habit_missed_cycle_bounds CHECK(missed_cycles BETWEEN 0 AND 3);

-- Every intentional report has one UUID. A retried HTTP request cannot charge
-- another penalty or repeat a reward, including after the cycle has changed.
CREATE TABLE IF NOT EXISTS public.habit_action_requests(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request_data jsonb NOT NULL,
 result_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.habit_action_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.habit_action_requests FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.habit_next_cycle(p_start timestamptz,p_frequency text,p_timezone text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE next_local timestamp;
BEGIN
 IF p_frequency NOT IN ('daily','workdays','3x_week','2x_week','weekly') THEN
  RAISE EXCEPTION 'Invalid frequency' USING ERRCODE='22023';
 END IF;
 next_local:=(p_start AT TIME ZONE p_timezone)+
  CASE WHEN p_frequency='weekly' THEN interval '7 days' ELSE interval '1 day' END;
 WHILE (p_frequency='workdays' AND extract(isodow FROM next_local)>5) OR
       (p_frequency='3x_week' AND extract(isodow FROM next_local) NOT IN (1,3,5)) OR
       (p_frequency='2x_week' AND extract(isodow FROM next_local) NOT IN (2,4)) LOOP
  next_local:=next_local+interval '1 day';
 END LOOP;
 RETURN next_local AT TIME ZONE p_timezone;
END $$;

-- Preserve catalog identity before renaming negative titles (legacy rows can
-- have a NULL catalog_id). Catalog ids and existing reward-guard keys stay stable.
UPDATE public.habits h SET catalog_id=c.id FROM public.habit_catalog c
 WHERE h.catalog_id IS NULL AND h.title=c.definition->>'title';
UPDATE public.habit_catalog SET definition=jsonb_set(definition,'{title}',
 to_jsonb('NO '||(definition->>'title')))
 WHERE definition->>'type'='negative' AND (definition->>'title') !~* '^NO[[:space:]]';
UPDATE public.habit_catalog SET definition=jsonb_set(jsonb_set(jsonb_set(definition,
 '{xpReward}','2'::jsonb),'{goldReward}','1'::jsonb),'{hpPenalty}','5'::jsonb)
 WHERE definition->>'type'='negative';
-- Older custom challenges may have no catalog identity. Carry their old
-- title-based guard to the renamed key before changing their display title.
INSERT INTO public.habit_reward_guard(user_id,habit_key,last_period,next_reward_at,rewarded_level,last_lapse_at)
 SELECT a.user_id,public.habit_reward_key(h.catalog_id,'NO '||h.title),
  max(g.last_period),max(g.next_reward_at),max(g.rewarded_level),max(g.last_lapse_at)
 FROM public.habits h JOIN public.avatars a ON a.id=h.avatar_id
 JOIN public.habit_reward_guard g ON g.user_id=a.user_id
  AND g.habit_key=public.habit_reward_key(h.catalog_id,h.title)
 WHERE h.type='negative' AND h.catalog_id IS NULL AND h.title !~* '^NO[[:space:]]'
 GROUP BY a.user_id,public.habit_reward_key(h.catalog_id,'NO '||h.title)
 ON CONFLICT(user_id,habit_key) DO UPDATE SET
  last_period=greatest(habit_reward_guard.last_period,excluded.last_period),
  next_reward_at=greatest(habit_reward_guard.next_reward_at,excluded.next_reward_at),
  rewarded_level=greatest(habit_reward_guard.rewarded_level,excluded.rewarded_level),
  last_lapse_at=greatest(habit_reward_guard.last_lapse_at,excluded.last_lapse_at);
UPDATE public.habits SET title='NO '||title,xp_reward=2,gold_reward=1,hp_penalty=5
 WHERE type='negative' AND title !~* '^NO[[:space:]]';
UPDATE public.habits SET xp_reward=2,gold_reward=1,hp_penalty=5 WHERE type='negative';

-- Run only for rows not yet upgraded, so re-running this migration is harmless.
UPDATE public.habits SET cycle_start_at=now(),
 cycle_end_at=public.habit_next_cycle(now(),frequency,habit_timezone),missed_cycles=0
 WHERE archived_at IS NULL AND cycle_start_at IS NULL;
-- A previously paid current period counts as fulfilled during its grace cycle.
INSERT INTO public.habit_activity(user_id,habit_id,period,title,difficulty,outcome,
 cycle_start_at,cycle_end_at,success_at,created_at)
 SELECT a.user_id,h.id::text,(h.cycle_start_at AT TIME ZONE h.habit_timezone)::date,
 h.title,h.difficulty_level,'legacy',h.cycle_start_at,h.cycle_end_at,h.cycle_start_at,h.cycle_start_at
 FROM public.habits h JOIN public.avatars a ON a.id=h.avatar_id
 JOIN public.habit_reward_guard g ON g.user_id=a.user_id
  AND g.habit_key=public.habit_reward_key(h.catalog_id,h.title)
 WHERE h.archived_at IS NULL AND h.cycle_start_at=now()
  AND (g.next_reward_at>now() OR g.last_period>=(h.cycle_start_at AT TIME ZONE h.habit_timezone)::date)
 ON CONFLICT DO NOTHING;
UPDATE public.habit_reward_guard g SET next_reward_at=greatest(g.next_reward_at,h.cycle_end_at)
 FROM public.habits h JOIN public.avatars a ON a.id=h.avatar_id
 WHERE g.user_id=a.user_id AND g.habit_key=public.habit_reward_key(h.catalog_id,h.title)
 AND h.archived_at IS NULL AND h.cycle_start_at=now()
 AND EXISTS(SELECT 1 FROM public.habit_activity x WHERE x.habit_id=h.id::text
  AND x.cycle_start_at=h.cycle_start_at AND x.outcome='legacy');

CREATE OR REPLACE FUNCTION public.habit_reconcile(p_id text,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE h public.habits%ROWTYPE; a public.avatars%ROWTYPE; fulfilled boolean;
 hp_loss integer; gold_loss integer;
BEGIN
 SELECT * INTO h FROM public.habits WHERE id::text=p_id FOR UPDATE;
 IF NOT FOUND OR h.archived_at IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO a FROM public.avatars WHERE id=h.avatar_id FOR UPDATE;
 -- A legacy/admin-created row receives the same grace as an upgraded row.
 IF h.cycle_start_at IS NULL THEN
  UPDATE public.habits SET cycle_start_at=p_now,
   cycle_end_at=public.habit_next_cycle(p_now,frequency,habit_timezone),missed_cycles=0
   WHERE id=h.id;
  RETURN;
 END IF;
 -- At most one fulfilled current cycle plus three misses are traversed. Long
 -- absences cannot produce unbounded penalties or an unbounded date scan.
 WHILE h.cycle_end_at<=p_now LOOP
  SELECT EXISTS(SELECT 1 FROM public.habit_activity x WHERE x.habit_id=p_id
   AND x.cycle_start_at=h.cycle_start_at AND x.outcome IN ('completed','abstained','legacy')
   AND x.lapse_count=0) AND NOT EXISTS(
    SELECT 1 FROM public.habit_reward_guard g WHERE g.user_id=a.user_id
     AND g.habit_key=public.habit_reward_key(h.catalog_id,h.title)
     AND g.last_lapse_at>=h.cycle_start_at AND g.last_lapse_at<h.cycle_end_at
   ) INTO fulfilled;
  IF fulfilled THEN h.missed_cycles:=0;
  ELSE
   h.missed_cycles:=least(3,h.missed_cycles+1);
   h.progress_count:=0; h.current_streak:=0;
   INSERT INTO public.habit_activity(user_id,habit_id,period,title,difficulty,outcome,
    cycle_start_at,cycle_end_at,created_at)
    VALUES(a.user_id,p_id,(h.cycle_start_at AT TIME ZONE h.habit_timezone)::date,
     h.title,h.difficulty_level,'missed',h.cycle_start_at,h.cycle_end_at,h.cycle_end_at)
    ON CONFLICT(habit_id,cycle_start_at) WHERE cycle_start_at IS NOT NULL
    DO UPDATE SET outcome=CASE WHEN habit_activity.lapse_count>0 THEN 'lapsed' ELSE 'missed' END;
  END IF;
  IF h.missed_cycles>=3 THEN
   hp_loss:=least(15,greatest(0,a.hp)); gold_loss:=least(15,greatest(0,a.gold));
   UPDATE public.avatars SET hp=greatest(0,hp-15),gold=greatest(0,gold-15),
    is_dead=(hp-15<=0),updated_at=p_now WHERE id=a.id;
   h.archived_at:=h.cycle_end_at;
   INSERT INTO public.habit_events(user_id,habit_id,kind,created_at,details)
    VALUES(a.user_id,p_id,'auto_archived',p_now,jsonb_build_object(
     'id',p_id,'title',h.title,'hp_lost',hp_loss,'gold_lost',gold_loss,'missed_cycles',3));
   EXIT;
  END IF;
  h.cycle_start_at:=h.cycle_end_at;
  h.cycle_end_at:=public.habit_next_cycle(h.cycle_start_at,h.frequency,h.habit_timezone);
 END LOOP;
 UPDATE public.habits SET cycle_start_at=h.cycle_start_at,cycle_end_at=h.cycle_end_at,
  missed_cycles=h.missed_cycles,progress_count=h.progress_count,current_streak=h.current_streak,
  archived_at=h.archived_at,checked_through=(h.cycle_start_at AT TIME ZONE h.habit_timezone)::date-1
  WHERE id=h.id;
END $$;

CREATE OR REPLACE FUNCTION public.habit_snapshot(p_avatar text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object(
  'period',(h.cycle_start_at AT TIME ZONE h.habit_timezone)::date,
  'recorded',coalesce(x.success_at IS NOT NULL,false) OR coalesce(
   x.outcome IN ('completed','abstained','legacy'),false) OR coalesce(g.next_reward_at>p_now,false)
   OR coalesce(g.last_period>=(h.cycle_start_at AT TIME ZONE h.habit_timezone)::date,false),
  'abstained',h.type='negative' AND x.success_at IS NOT NULL,
  'lapse_count',greatest(coalesce(x.lapse_count,0),
   CASE WHEN g.last_lapse_at>=h.cycle_start_at AND g.last_lapse_at<h.cycle_end_at THEN 1 ELSE 0 END),
  'abstinence_available_at',CASE WHEN h.type='negative' THEN h.cycle_end_at-interval '2 hours' END,
  'current_target',CASE WHEN h.progression IS NOT NULL THEN least((h.progression->>'max')::numeric,
   (h.progression->>'initial')::numeric+(h.difficulty_level-1)*(h.progression->>'step')::numeric) END,
  'rewards',CASE WHEN h.type='negative' THEN jsonb_build_object('xp',2,'gold',1)
   WHEN h.progression IS NOT NULL THEN public.habit_reward(h.difficulty_level)
   ELSE jsonb_build_object('xp',h.xp_reward,'gold',h.gold_reward) END
  ) ORDER BY h.created_at),'[]'::jsonb)
 FROM public.habits h JOIN public.avatars a ON a.id=h.avatar_id
 LEFT JOIN public.habit_activity x ON x.habit_id=h.id::text AND x.cycle_start_at=h.cycle_start_at
 LEFT JOIN public.habit_reward_guard g ON g.user_id=a.user_id
  AND g.habit_key=public.habit_reward_key(h.catalog_id,h.title)
 WHERE h.avatar_id::text=p_avatar AND h.archived_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.habit_action_at(p_action text,p_id text,p_config jsonb,
 p_value numeric,p_expected_period date,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE a public.avatars%ROWTYPE; h public.habits%ROWTYPE; g public.habit_reward_guard%ROWTYPE;
 activity public.habit_activity%ROWTYPE; prior public.habit_action_requests%ROWTYPE;
 def jsonb; cfg jsonb; period date; target numeric; top numeric; reward jsonb;
 xp integer:=0; gold integer:=0; bx integer:=0; bg integer:=0; avatar_bonus integer:=0;
 hp_loss integer:=0; gold_loss integer:=0; advanced boolean:=false; status text:='saved';
 item record; tz text; freq text; v_catalog text; existed boolean; reward_key text;
 delete_after timestamptz; request_uuid uuid; request_data jsonb; replayed boolean:=false;
 original_status text; event_cursor bigint; penalties jsonb; expected_cycle timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.avatars WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avatar not found' USING ERRCODE='42501'; END IF;
 SELECT delete_available_at INTO delete_after FROM public.habit_account_rules WHERE user_id=auth.uid();
 SELECT coalesce(max(id),0) INTO event_cursor FROM public.habit_events WHERE user_id=auth.uid();
 IF p_action IN ('complete','abstain','lapse') THEN
  IF coalesce(p_config->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR p_config->>'expected_cycle_start_at' IS NULL THEN
   RAISE EXCEPTION 'A request id and expected cycle are required' USING ERRCODE='22023';
  END IF;
  request_uuid:=(p_config->>'request_id')::uuid;
  expected_cycle:=(p_config->>'expected_cycle_start_at')::timestamptz;
  request_data:=jsonb_build_object('action',p_action,'id',p_id,'cycle',expected_cycle,
   'period',p_expected_period,'value',p_value);
  SELECT * INTO prior FROM public.habit_action_requests WHERE user_id=auth.uid() AND request_id=request_uuid;
  IF FOUND THEN
   IF prior.request_data IS DISTINCT FROM request_data THEN
    RAISE EXCEPTION 'Request id already used for another report' USING ERRCODE='22023';
   END IF;
   replayed:=true; original_status:=prior.result_status; status:='request_replayed';
  END IF;
 END IF;
 -- Reconcile the account on every call so rewards/purchases see current HP/gold.
 FOR item IN SELECT id::text AS id FROM public.habits WHERE avatar_id=a.id AND archived_at IS NULL LOOP
  PERFORM public.habit_reconcile(item.id,p_now);
 END LOOP;
 SELECT * INTO a FROM public.avatars WHERE id=a.id;
 IF replayed OR p_action='list' THEN NULL;
 ELSIF p_action='create' THEN
  v_catalog:=p_config->>'catalog_id';
  SELECT definition INTO def FROM public.habit_catalog WHERE id=v_catalog;
  IF def IS NULL THEN RAISE EXCEPTION 'Unknown catalog item' USING ERRCODE='22023'; END IF;
  reward_key:=public.habit_reward_key(v_catalog,def->>'title');
  SELECT * INTO h FROM public.habits WHERE avatar_id=a.id
   AND public.habit_reward_key(catalog_id,title)=reward_key
   ORDER BY (archived_at IS NULL) DESC,created_at LIMIT 1 FOR UPDATE;
  existed:=FOUND;
  IF existed AND h.archived_at IS NULL THEN RAISE EXCEPTION 'Habit already active' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.habits WHERE avatar_id=a.id AND archived_at IS NULL)>=20 THEN
   RAISE EXCEPTION 'Habit limit reached' USING ERRCODE='22023';
  END IF;
  tz:=coalesce(p_config->>'timezone',CASE WHEN existed THEN h.habit_timezone END,'America/Mexico_City');
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=tz) THEN
   RAISE EXCEPTION 'Invalid timezone' USING ERRCODE='22023';
  END IF;
  freq:=coalesce(p_config->>'frequency',CASE WHEN existed THEN h.frequency END,def->>'defaultFrequency','daily');
  IF freq NOT IN ('daily','workdays','3x_week','2x_week','weekly') THEN
   RAISE EXCEPTION 'Invalid frequency' USING ERRCODE='22023';
  END IF;
  cfg:=public.habit_fixed_progression(v_catalog,def->>'type');
  IF existed THEN
   status:='reactivated';
   -- Re-enrollment during an open cycle cannot reset its reward/lapse state.
   -- Manual archiving cannot erase accumulated misses; only serving the full
   -- three-miss penalty resets them on a later activation.
   IF h.cycle_start_at IS NULL OR h.cycle_end_at<=p_now THEN
    h.frequency:=freq; h.habit_timezone:=tz;
    h.cycle_start_at:=p_now;
    h.cycle_end_at:=public.habit_next_cycle(p_now,h.frequency,h.habit_timezone);
   END IF;
   UPDATE public.habits SET archived_at=NULL,catalog_id=v_catalog,
    cycle_start_at=h.cycle_start_at,cycle_end_at=h.cycle_end_at,
    frequency=h.frequency,habit_timezone=h.habit_timezone,
    missed_cycles=CASE WHEN h.missed_cycles>=3 THEN 0 ELSE h.missed_cycles END,
    checked_through=(p_now AT TIME ZONE h.habit_timezone)::date-1,
    progress_count=0,current_streak=0 WHERE id=h.id RETURNING * INTO h;
  ELSE
   h.id:=gen_random_uuid(); h.avatar_id:=a.id;
   INSERT INTO public.habits(id,avatar_id,title,type,xp_reward,hp_penalty,gold_reward,
    frequency,description,catalog_id,habit_timezone,progression,checked_through,
    created_at,cycle_start_at,cycle_end_at)
    VALUES(h.id,a.id,def->>'title',def->>'type',(def->>'xpReward')::integer,
     (def->>'hpPenalty')::integer,(def->>'goldReward')::integer,freq,
     coalesce(def->>'description',''),v_catalog,tz,cfg,(p_now AT TIME ZONE tz)::date-1,
     p_now,p_now,public.habit_next_cycle(p_now,freq,tz)) RETURNING * INTO h;
  END IF;
  INSERT INTO public.habit_events(user_id,habit_id,kind,created_at)
   VALUES(auth.uid(),h.id::text,'activated',p_now);
 ELSE
  SELECT * INTO h FROM public.habits WHERE id::text=p_id AND avatar_id=a.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Habit not found' USING ERRCODE='42501'; END IF;
  period:=(h.cycle_start_at AT TIME ZONE h.habit_timezone)::date;
  reward_key:=public.habit_reward_key(h.catalog_id,h.title);
  SELECT * INTO g FROM public.habit_reward_guard WHERE user_id=auth.uid() AND habit_key=reward_key;
  SELECT * INTO activity FROM public.habit_activity WHERE habit_id=p_id AND cycle_start_at=h.cycle_start_at;
  IF h.archived_at IS NOT NULL THEN status:='auto_archived';
  ELSIF p_action='reset' THEN
   -- Difficulty reset does not reset deadlines, miss counts or bonus eligibility.
   UPDATE public.habits SET difficulty_level=1,progress_count=0,current_streak=0 WHERE id=h.id;
   INSERT INTO public.habit_events(user_id,habit_id,kind,created_at) VALUES(auth.uid(),p_id,'reset',p_now);
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
   INSERT INTO public.habit_events(user_id,habit_id,kind,created_at) VALUES(auth.uid(),p_id,'configured',p_now);
  ELSIF p_action IN ('complete','abstain','lapse') THEN
   IF expected_cycle IS DISTINCT FROM h.cycle_start_at OR p_expected_period IS DISTINCT FROM period THEN
    status:='period_changed';
   ELSIF p_now<h.cycle_start_at OR p_now>=h.cycle_end_at THEN status:='not_due';
   ELSIF (p_action='complete' AND h.type<>'positive') OR (p_action IN ('abstain','lapse') AND h.type<>'negative') THEN
    RAISE EXCEPTION 'Action does not match habit type' USING ERRCODE='22023';
   ELSIF p_action='lapse' THEN
    status:='lapsed'; hp_loss:=least(5,greatest(0,a.hp)); gold_loss:=least(5,greatest(0,a.gold));
    UPDATE public.avatars SET hp=greatest(0,avatars.hp-5),gold=greatest(0,avatars.gold-5),
     is_dead=(avatars.hp-5<=0),updated_at=p_now WHERE id=a.id;
    UPDATE public.habits SET current_streak=0,progress_count=0 WHERE id=h.id;
    INSERT INTO public.habit_reward_guard(user_id,habit_key,last_lapse_at)
     VALUES(auth.uid(),reward_key,p_now)
     ON CONFLICT(user_id,habit_key) DO UPDATE SET
      last_lapse_at=greatest(habit_reward_guard.last_lapse_at,excluded.last_lapse_at);
    -- A later lapse is still reportable after abstaining. Its fixed penalty is
    -- applied, the cycle fails, and its earlier small reward is not clawed back.
    INSERT INTO public.habit_activity(user_id,habit_id,period,title,difficulty,outcome,
     cycle_start_at,cycle_end_at,lapse_count,hp_lost,gold_lost,created_at)
     VALUES(auth.uid(),p_id,period,h.title,h.difficulty_level,'lapsed',
      h.cycle_start_at,h.cycle_end_at,1,hp_loss,gold_loss,p_now)
     ON CONFLICT(habit_id,cycle_start_at) WHERE cycle_start_at IS NOT NULL DO UPDATE
      SET outcome='lapsed',lapse_count=habit_activity.lapse_count+1,
       hp_lost=habit_activity.hp_lost+excluded.hp_lost,gold_lost=habit_activity.gold_lost+excluded.gold_lost;
   ELSIF p_action='abstain' AND (coalesce(activity.lapse_count,0)>0 OR
    (g.last_lapse_at>=h.cycle_start_at AND g.last_lapse_at<h.cycle_end_at)) THEN status:='cycle_failed';
   ELSIF p_action='abstain' AND p_now<h.cycle_end_at-interval '2 hours' THEN status:='not_due';
   ELSIF activity.success_at IS NOT NULL OR activity.outcome IN ('completed','abstained','legacy')
    OR g.next_reward_at>p_now OR g.last_period>=period THEN status:='already_recorded';
   ELSE
    IF h.progression IS NOT NULL THEN
     target:=least((h.progression->>'max')::numeric,
      (h.progression->>'initial')::numeric+(h.difficulty_level-1)*(h.progression->>'step')::numeric);
     top:=(h.progression->>'max')::numeric;
     IF p_value IS NULL OR p_value<0 OR p_value>100000 OR p_value::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Invalid measurement' USING ERRCODE='22023';
     END IF;
    END IF;
    IF target IS NOT NULL AND p_value<target THEN
     status:='below_target';
     UPDATE public.habits SET current_streak=0,progress_count=0 WHERE id=h.id;
    ELSE
     status:=CASE WHEN p_action='abstain' THEN 'abstained' ELSE 'completed' END;
     reward:=CASE WHEN p_action='abstain' THEN jsonb_build_object('xp',2,'gold',1)
      WHEN h.progression IS NULL THEN jsonb_build_object('xp',h.xp_reward,'gold',h.gold_reward)
      ELSE public.habit_reward(h.difficulty_level) END;
     xp:=(reward->>'xp')::integer; gold:=(reward->>'gold')::integer;
     h.current_streak:=h.current_streak+1; h.best_streak:=greatest(h.best_streak,h.current_streak);
     h.rewarded_level:=greatest(h.rewarded_level,coalesce(g.rewarded_level,1));
     IF target<top THEN
      h.progress_count:=h.progress_count+1;
      IF h.progress_count>=7 THEN
       h.difficulty_level:=h.difficulty_level+1; h.progress_count:=0; advanced:=true;
       IF h.difficulty_level>h.rewarded_level THEN
        bx:=(reward->>'bonus_xp')::integer; bg:=(reward->>'bonus_gold')::integer;
       END IF;
       h.rewarded_level:=greatest(h.rewarded_level,h.difficulty_level);
      END IF;
     END IF;
     a.current_xp:=a.current_xp+xp+bx; a.gold:=a.gold+gold+bg;
     IF a.is_dead THEN a.is_dead:=false; a.hp:=least(a.max_hp,30); END IF;
     WHILE a.current_xp>=a.xp_to_level AND a.xp_to_level>0 LOOP
      a.current_xp:=a.current_xp-a.xp_to_level; a.level:=a.level+1;
      a.xp_to_level:=floor(a.xp_to_level*1.5); a.gold:=a.gold+25;
      avatar_bonus:=avatar_bonus+25; a.hp:=least(a.max_hp,a.hp+20);
     END LOOP;
     UPDATE public.habits SET completed_at=p_now,current_streak=h.current_streak,
      best_streak=h.best_streak,difficulty_level=h.difficulty_level,progress_count=h.progress_count,
      rewarded_level=h.rewarded_level,
      missed_cycles=CASE WHEN h.type='negative' THEN h.missed_cycles ELSE 0 END WHERE id=h.id;
     UPDATE public.avatars SET current_xp=a.current_xp,gold=a.gold,hp=a.hp,is_dead=a.is_dead,
      level=a.level,xp_to_level=a.xp_to_level,updated_at=p_now WHERE id=a.id;
     INSERT INTO public.habit_reward_guard(user_id,habit_key,last_period,next_reward_at,rewarded_level)
      VALUES(auth.uid(),reward_key,period,h.cycle_end_at,h.rewarded_level)
      ON CONFLICT(user_id,habit_key) DO UPDATE SET
       last_period=greatest(habit_reward_guard.last_period,excluded.last_period),
       next_reward_at=greatest(habit_reward_guard.next_reward_at,excluded.next_reward_at),
       rewarded_level=greatest(habit_reward_guard.rewarded_level,excluded.rewarded_level);
    END IF;
    INSERT INTO public.habit_activity(user_id,habit_id,period,title,measured,target,difficulty,
     outcome,xp,gold,bonus_xp,bonus_gold,avatar_bonus_gold,cycle_start_at,cycle_end_at,success_at,created_at)
     VALUES(auth.uid(),p_id,period,public.habit_goal_title(h.catalog_id,h.title,target,h.progression->>'unit'),
      p_value,target,CASE WHEN advanced THEN h.difficulty_level-1 ELSE h.difficulty_level END,
      status,xp,gold,bx,bg,avatar_bonus,h.cycle_start_at,h.cycle_end_at,
      CASE WHEN status IN ('completed','abstained') THEN p_now END,p_now)
     ON CONFLICT(habit_id,cycle_start_at) WHERE cycle_start_at IS NOT NULL DO UPDATE SET
      measured=excluded.measured,target=excluded.target,difficulty=excluded.difficulty,outcome=excluded.outcome,
      xp=excluded.xp,gold=excluded.gold,bonus_xp=excluded.bonus_xp,bonus_gold=excluded.bonus_gold,
      avatar_bonus_gold=excluded.avatar_bonus_gold,success_at=excluded.success_at,created_at=excluded.created_at;
   END IF;
  ELSE RAISE EXCEPTION 'Unknown action' USING ERRCODE='22023';
  END IF;
 END IF;
 IF request_uuid IS NOT NULL AND NOT replayed THEN
  INSERT INTO public.habit_action_requests(user_id,request_id,request_data,result_status,created_at)
   VALUES(auth.uid(),request_uuid,request_data,status,p_now);
 END IF;
 SELECT * INTO a FROM public.avatars WHERE id=a.id;
 SELECT coalesce(jsonb_agg(details ORDER BY id),'[]'::jsonb) INTO penalties FROM public.habit_events
  WHERE user_id=auth.uid() AND id>event_cursor AND kind='auto_archived';
 RETURN jsonb_build_object('status',status,'original_status',original_status,
  'avatar',to_jsonb(a),'habits',public.habit_snapshot(a.id::text,p_now),
  'xp',xp,'gold',gold,'bonus_xp',bx,'bonus_gold',bg,'avatar_bonus_gold',avatar_bonus,
  'hp_lost',hp_loss,'gold_lost',gold_loss,'penalties',penalties,'advanced',advanced,
  'habit_id',coalesce(h.id::text,p_id),'rules_version',4,'server_now',p_now,
  'delete_available_at',delete_after);
END $$;

-- Only the existing public wrapper can supply the server clock. New private
-- helpers and request records are unavailable to browsers/other accounts.
REVOKE ALL ON FUNCTION public.habit_next_cycle(timestamptz,text,text),
 public.habit_reconcile(text,timestamptz),public.habit_snapshot(text,timestamptz),
 public.habit_action_at(text,text,jsonb,numeric,date,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.habit_action(text,text,jsonb,numeric,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
