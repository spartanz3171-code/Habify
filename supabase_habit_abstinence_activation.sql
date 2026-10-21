-- Habify: enable NO LO HICE at activation, once per cycle (rules v5).
-- Run after supabase_habit_cycles.sql (v4 or later). No clocks, balances,
-- history or penalties are reset. Re-running this patch is safe.
BEGIN;

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
  'abstinence_available_at',CASE WHEN h.type='negative' THEN h.cycle_start_at END,
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
  'habit_id',coalesce(h.id::text,p_id),'rules_version',5,'server_now',p_now,
  'delete_available_at',delete_after);
END $$;

REVOKE ALL ON FUNCTION public.habit_snapshot(text,timestamptz),
 public.habit_action_at(text,text,jsonb,numeric,date,timestamptz) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
