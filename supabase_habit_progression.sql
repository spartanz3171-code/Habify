-- Habify: additive habit history, scheduled progression and atomic rewards.
-- Run after the existing base schema. No existing habit, avatar or reward is deleted.
BEGIN;
ALTER TABLE public.habits
 ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'daily',
 ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS catalog_id text,
 ADD COLUMN IF NOT EXISTS archived_at timestamptz,
 ADD COLUMN IF NOT EXISTS habit_timezone text NOT NULL DEFAULT 'America/Mexico_City',
 ADD COLUMN IF NOT EXISTS progression jsonb,
 ADD COLUMN IF NOT EXISTS difficulty_level integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS progress_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS best_streak integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS rewarded_level integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS checked_through date,
 ADD COLUMN IF NOT EXISTS available_after timestamptz;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS game_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.habit_catalog (
 id text PRIMARY KEY, definition jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.habit_activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 habit_id text NOT NULL, period date NOT NULL,
 title text NOT NULL, measured numeric, target numeric,
 difficulty integer NOT NULL, outcome text NOT NULL CHECK(outcome IN ('completed','missed','below_target','legacy')),
 xp integer NOT NULL DEFAULT 0, gold integer NOT NULL DEFAULT 0,
 bonus_xp integer NOT NULL DEFAULT 0, bonus_gold integer NOT NULL DEFAULT 0,
 avatar_bonus_gold integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(habit_id, period)
);
CREATE TABLE IF NOT EXISTS public.habit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 habit_id text NOT NULL, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.habit_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_activity_owner ON public.habit_activity;
CREATE POLICY habit_activity_owner ON public.habit_activity FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS habit_events_owner ON public.habit_events;
CREATE POLICY habit_events_owner ON public.habit_events FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS habit_catalog_read ON public.habit_catalog;
CREATE POLICY habit_catalog_read ON public.habit_catalog FOR SELECT TO authenticated USING(true);
REVOKE ALL ON public.habit_activity, public.habit_events, public.habit_catalog FROM anon, authenticated;
GRANT SELECT ON public.habit_activity, public.habit_events, public.habit_catalog TO authenticated;
-- RLS alone cannot prevent a client from changing its own counters/prices.
REVOKE INSERT, UPDATE, DELETE ON public.habits FROM anon, authenticated;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_read_own_v2 ON public.habits;
CREATE POLICY habit_read_own_v2 ON public.habits FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.avatars a WHERE a.id=avatar_id AND a.user_id=auth.uid()));
GRANT SELECT ON public.habits TO authenticated;

CREATE OR REPLACE FUNCTION public.habit_period(p_day date, p_frequency text)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE
  WHEN p_frequency='weekly' THEN p_day-(extract(isodow FROM p_day)::int-1)
  WHEN p_frequency='workdays' AND extract(isodow FROM p_day)>5 THEN NULL
  WHEN p_frequency='3x_week' AND extract(isodow FROM p_day) NOT IN (1,3,5) THEN NULL
  WHEN p_frequency='2x_week' AND extract(isodow FROM p_day) NOT IN (2,4) THEN NULL
  ELSE p_day END
$$;

CREATE OR REPLACE FUNCTION public.habit_reward(p_level integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('xp',10+5*(p_level-1),'gold',floor((10+5*(p_level-1))/2.0)::int,
 'bonus_xp',25+15*(p_level-1),'bonus_gold',10*p_level)
$$;

-- Detect stale writes from another tab/device, including purchases and combat.
CREATE OR REPLACE FUNCTION public.bump_game_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.game_revision := OLD.game_revision+1; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS bump_game_revision ON public.avatars;
CREATE TRIGGER bump_game_revision BEFORE UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION public.bump_game_revision();

-- Only trusted database administration can grant catalog administration.
CREATE OR REPLACE FUNCTION public.protect_avatar_admin() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND ((TG_OP='INSERT' AND NEW.is_admin) OR
  (TG_OP='UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin)) THEN
  RAISE EXCEPTION 'Admin flag is managed by the server' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_avatar_admin ON public.avatars;
CREATE TRIGGER protect_avatar_admin BEFORE INSERT OR UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION public.protect_avatar_admin();
REVOKE ALL ON FUNCTION public.protect_avatar_admin() FROM PUBLIC,anon,authenticated;

-- Preserve the last known completed calendar period without inventing past rewards.
UPDATE public.habits SET checked_through=(now() AT TIME ZONE habit_timezone)::date-1,available_after=NULL
 WHERE checked_through IS NULL;
INSERT INTO public.habit_activity(user_id,habit_id,period,title,difficulty,outcome,created_at)
 SELECT a.user_id,h.id::text,coalesce(public.habit_period((h.completed_at AT TIME ZONE h.habit_timezone)::date,h.frequency),
 (h.completed_at AT TIME ZONE h.habit_timezone)::date),h.title,1,'legacy',h.completed_at
 FROM public.habits h JOIN public.avatars a ON a.id=h.avatar_id WHERE h.completed_at IS NOT NULL
 ON CONFLICT(habit_id,period) DO NOTHING;

CREATE OR REPLACE FUNCTION public.habit_reconcile(p_id text, p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE h public.habits%ROWTYPE; a public.avatars%ROWTYPE; d date; today date; period date; lost integer:=0;
BEGIN
 SELECT * INTO h FROM public.habits WHERE id::text=p_id FOR UPDATE;
 IF h.archived_at IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO a FROM public.avatars WHERE id=h.avatar_id;
 today:=(p_now AT TIME ZONE h.habit_timezone)::date;
 FOR d IN SELECT generate_series(h.checked_through+1,today-1,interval '1 day')::date LOOP
  period:=public.habit_period(d,h.frequency);
  IF period IS NULL OR (h.frequency='weekly' AND extract(isodow FROM d)<>7) THEN CONTINUE; END IF;
  IF h.available_after IS NOT NULL AND d<(h.available_after AT TIME ZONE h.habit_timezone)::date THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.habit_activity WHERE habit_id=p_id AND habit_activity.period=period AND outcome IN ('completed','legacy')) THEN CONTINUE; END IF;
  INSERT INTO public.habit_activity(user_id,habit_id,period,title,difficulty,outcome)
   VALUES(a.user_id,p_id,period,h.title,h.difficulty_level,'missed')
   ON CONFLICT ON CONSTRAINT habit_activity_habit_id_period_key DO UPDATE SET outcome='missed';
  h.progress_count:=0; h.current_streak:=0;
  IF h.type='positive' THEN lost:=lost+10; END IF;
 END LOOP;
 UPDATE public.habits SET progress_count=h.progress_count,current_streak=h.current_streak,checked_through=greatest(h.checked_through,today-1) WHERE id=h.id;
 IF lost>0 THEN
  UPDATE public.avatars SET hp=greatest(0,hp-lost),is_dead=(hp-lost<=0),
   current_xp=CASE WHEN hp>0 AND hp-lost<=0 THEN greatest(0,current_xp-20) ELSE current_xp END WHERE id=a.id;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.habit_snapshot(p_avatar text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object(
 'period',public.habit_period((p_now AT TIME ZONE h.habit_timezone)::date,h.frequency),
 'recorded',EXISTS(SELECT 1 FROM public.habit_activity x WHERE x.habit_id=h.id::text
   AND x.period=public.habit_period((p_now AT TIME ZONE h.habit_timezone)::date,h.frequency) AND outcome IN ('completed','legacy')),
 'current_target',CASE WHEN progression IS NOT NULL THEN least((progression->>'max')::numeric,(progression->>'initial')::numeric+(difficulty_level-1)*(progression->>'step')::numeric) END,
 'rewards',CASE WHEN progression IS NOT NULL THEN public.habit_reward(difficulty_level) ELSE jsonb_build_object('xp',xp_reward,'gold',gold_reward) END
 ) ORDER BY h.created_at),'[]'::jsonb) FROM public.habits h WHERE h.avatar_id::text=p_avatar AND h.archived_at IS NULL
$$;

-- Only the public wrapper supplies the clock. The testable internal function is never granted to clients.
CREATE OR REPLACE FUNCTION public.habit_validate_progression(cfg jsonb,p_type text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF cfg IS NOT NULL THEN
   IF p_type<>'positive' OR jsonb_typeof(cfg)<>'object' OR
    coalesce((cfg->>'initial')::numeric,0)<=0 OR coalesce((cfg->>'step')::numeric,0)<=0 OR
    coalesce((cfg->>'max')::numeric,0)<(cfg->>'initial')::numeric OR (cfg->>'max')::numeric>100000 OR
    ceil(((cfg->>'max')::numeric-(cfg->>'initial')::numeric)/(cfg->>'step')::numeric)>19 OR
    coalesce((cfg->>'required')::integer,0) NOT BETWEEN 2 AND 90 OR
    coalesce(cfg->>'unit','') NOT IN ('liters','hours','minutes','pages','units') THEN RAISE EXCEPTION 'Invalid progression' USING ERRCODE='22023'; END IF;
  END IF;

 RETURN cfg;
END $$;

CREATE OR REPLACE FUNCTION public.habit_action_at(p_action text,p_id text,p_config jsonb,p_value numeric,p_expected_period date,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE a public.avatars%ROWTYPE; h public.habits%ROWTYPE; def jsonb; cfg jsonb;
 today date; period date; target numeric; top numeric; reward jsonb; xp integer:=0; gold integer:=0;
 bx integer:=0; bg integer:=0; avatar_bonus integer:=0; advanced boolean:=false; status text:='saved';
 item record; tz text; freq text; v_catalog text; existed boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.avatars WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avatar not found' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
  FOR item IN SELECT id::text AS id FROM public.habits WHERE avatar_id=a.id AND archived_at IS NULL LOOP
   PERFORM public.habit_reconcile(item.id,p_now);
  END LOOP;
 ELSIF p_action='create' THEN
  v_catalog:=p_config->>'catalog_id';
  SELECT definition INTO def FROM public.habit_catalog WHERE id=v_catalog;
  IF def IS NULL THEN RAISE EXCEPTION 'Unknown catalog item' USING ERRCODE='22023'; END IF;
  -- Reuse archived identity: deleting/recreating cannot reset reward eligibility.
  SELECT * INTO h FROM public.habits WHERE avatar_id=a.id AND (catalog_id=v_catalog OR title=def->>'title') ORDER BY created_at LIMIT 1 FOR UPDATE;
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
   UPDATE public.habits SET archived_at=NULL,checked_through=(p_now AT TIME ZONE habit_timezone)::date-1,
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
  IF p_action='reset' THEN
   UPDATE public.habits SET difficulty_level=1,progress_count=0,current_streak=0 WHERE id=h.id;
   INSERT INTO public.habit_events(user_id,habit_id,kind) VALUES(auth.uid(),p_id,'reset');
  ELSIF p_action='archive' THEN
   UPDATE public.habits SET archived_at=p_now WHERE id=h.id;
   INSERT INTO public.habit_events(user_id,habit_id,kind) VALUES(auth.uid(),p_id,'archived');
  ELSIF p_action='configure' THEN
   IF h.progression IS NOT NULL THEN RAISE EXCEPTION 'Progression already configured' USING ERRCODE='22023'; END IF;
   cfg:=public.habit_validate_progression(nullif(p_config->'progression','null'::jsonb),h.type);
   IF cfg IS NULL THEN RAISE EXCEPTION 'Progression required' USING ERRCODE='22023'; END IF;
   UPDATE public.habits SET progression=cfg,difficulty_level=1,progress_count=0 WHERE id=h.id;
   INSERT INTO public.habit_events(user_id,habit_id,kind) VALUES(auth.uid(),p_id,'configured');
  ELSIF p_action='complete' THEN
   IF period IS NULL OR p_now<h.available_after THEN status:='not_due';
   ELSIF p_expected_period IS DISTINCT FROM period THEN status:='period_changed';
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
      IF target<top THEN
       h.progress_count:=h.progress_count+1;
       IF h.progress_count>=(h.progression->>'required')::integer THEN
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
    END IF;
    INSERT INTO public.habit_activity(user_id,habit_id,period,title,measured,target,difficulty,outcome,xp,gold,bonus_xp,bonus_gold,avatar_bonus_gold,created_at)
     VALUES(auth.uid(),p_id,period,h.title,p_value,target,CASE WHEN advanced THEN h.difficulty_level-1 ELSE h.difficulty_level END,status,xp,gold,bx,bg,avatar_bonus,p_now)
     ON CONFLICT ON CONSTRAINT habit_activity_habit_id_period_key DO UPDATE SET measured=excluded.measured,target=excluded.target,difficulty=excluded.difficulty,
      outcome=excluded.outcome,xp=excluded.xp,gold=excluded.gold,bonus_xp=excluded.bonus_xp,bonus_gold=excluded.bonus_gold,avatar_bonus_gold=excluded.avatar_bonus_gold,created_at=excluded.created_at;
   END IF;
  ELSE RAISE EXCEPTION 'Unknown action' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO a FROM public.avatars WHERE id=a.id;
 RETURN jsonb_build_object('status',status,'avatar',to_jsonb(a),'habits',public.habit_snapshot(a.id::text,p_now),
 'xp',xp,'gold',gold,'bonus_xp',bx,'bonus_gold',bg,'advanced',advanced,'habit_id',h.id);
END $$;

CREATE OR REPLACE FUNCTION public.habit_action(p_action text,p_id text DEFAULT NULL,p_config jsonb DEFAULT '{}',p_value numeric DEFAULT NULL,p_expected_period date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.habit_action_at(p_action,p_id,p_config,p_value,p_expected_period,clock_timestamp())
$$;
CREATE OR REPLACE FUNCTION public.save_habit_catalog(p_definition jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.avatars WHERE user_id=auth.uid() AND is_admin=true) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_definition)<>'object' OR coalesce(p_definition->>'id','') !~ '^hab_[a-zA-Z0-9_]+$'
  OR length(coalesce(p_definition->>'title','')) NOT BETWEEN 1 AND 120 OR length(coalesce(p_definition->>'description',''))>1000
  OR coalesce(p_definition->>'type','') NOT IN ('positive','negative')
  OR coalesce(p_definition->>'category','') NOT IN ('health','fitness','productivity','mind','finance','negative')
  OR length(coalesce(p_definition->>'icon','')) NOT BETWEEN 1 AND 16
  OR coalesce((p_definition->>'xpReward')::integer,-1) NOT BETWEEN 0 AND 1000
  OR coalesce((p_definition->>'goldReward')::integer,-1) NOT BETWEEN 0 AND 500
  OR coalesce((p_definition->>'hpPenalty')::integer,-1) NOT BETWEEN 0 AND 100
  OR coalesce(p_definition->>'defaultFrequency','') NOT IN ('daily','workdays','3x_week','2x_week','weekly') THEN
  RAISE EXCEPTION 'Invalid catalog definition' USING ERRCODE='22023'; END IF;
 INSERT INTO public.habit_catalog(id,definition) VALUES(p_definition->>'id',p_definition);
 RETURN jsonb_build_object('status','saved');
END $$;
REVOKE ALL ON FUNCTION public.save_habit_catalog(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_habit_catalog(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.habit_reconcile(text,timestamptz),public.habit_snapshot(text,timestamptz),
 public.habit_action_at(text,text,jsonb,numeric,date,timestamptz),public.habit_action(text,text,jsonb,numeric,date),public.bump_game_revision() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.habit_action(text,text,jsonb,numeric,date) TO authenticated;

INSERT INTO public.habit_catalog(id,definition) SELECT value->>'id',value FROM jsonb_array_elements($habify_catalog$[{"id":"hab_water","title":"Beber 2 Litros de Agua","category":"health","icon":"💧","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"Mantente hidratado durante el día para recuperar vitalidad."},{"id":"hab_fruit","title":"Comer Fruta o Verdura Fresca","category":"health","icon":"🥗","type":"positive","xpReward":15,"hpPenalty":0,"goldReward":7,"defaultFrequency":"daily","description":"Aporta vitaminas y nutrientes esenciales para tu cuerpo."},{"id":"hab_sleep","title":"Dormir 7 a 8 Horas","category":"health","icon":"😴","type":"positive","xpReward":25,"hpPenalty":0,"goldReward":12,"defaultFrequency":"daily","description":"Un descanso reparador para regenerar energía y enfoque."},{"id":"hab_teeth","title":"Higiene Dental y Cepillado","category":"health","icon":"🦷","type":"positive","xpReward":15,"hpPenalty":0,"goldReward":7,"defaultFrequency":"daily","description":"Cuidado y salud bucal después de tus comidas principales."},{"id":"hab_sun","title":"Tomar 15 Minutos de Sol","category":"health","icon":"☀️","type":"positive","xpReward":15,"hpPenalty":0,"goldReward":7,"defaultFrequency":"daily","description":"Vitamina D natural y un respiro al aire libre."},{"id":"hab_screen_off","title":"Desconectar Pantallas Antes de Dormir","category":"health","icon":"📵","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"30 minutos sin celular ni televisión antes de acostarte."},{"id":"hab_cardio","title":"30 Minutos de Ejercicio Cardio","category":"fitness","icon":"🏃‍♂️","type":"positive","xpReward":30,"hpPenalty":0,"goldReward":15,"defaultFrequency":"3x_week","description":"Correr, trotar, nadar o bicicleta para fortalecer el corazón."},{"id":"hab_strength","title":"Entrenamiento de Fuerza o Pesas","category":"fitness","icon":"🏋️","type":"positive","xpReward":35,"hpPenalty":0,"goldReward":17,"defaultFrequency":"3x_week","description":"Rutina de resistencia muscular o calistenia."},{"id":"hab_steps","title":"Caminar 8,000 Pasos","category":"fitness","icon":"🚶","type":"positive","xpReward":25,"hpPenalty":0,"goldReward":12,"defaultFrequency":"daily","description":"Movimiento activo y constante a lo largo de tu día."},{"id":"hab_stretch","title":"Estiramientos o Yoga 15 Min","category":"fitness","icon":"🧘‍♂️","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"Flexibilidad y relajación muscular para prevenir lesiones."},{"id":"hab_code","title":"Estudio o Práctica de Programación","category":"productivity","icon":"💻","type":"positive","xpReward":35,"hpPenalty":0,"goldReward":17,"defaultFrequency":"daily","description":"Escribir código, resolver ejercicios o aprender arquitectura."},{"id":"hab_read","title":"Leer 15 Páginas de un Libro","category":"productivity","icon":"📖","type":"positive","xpReward":25,"hpPenalty":0,"goldReward":12,"defaultFrequency":"daily","description":"Lectura para expandir tu conocimiento y concentración."},{"id":"hab_lang","title":"Practicar Inglés u Otro Idioma","category":"productivity","icon":"🇬🇧","type":"positive","xpReward":25,"hpPenalty":0,"goldReward":12,"defaultFrequency":"daily","description":"20 minutos de vocabulario, escucha o conversación."},{"id":"hab_top_task","title":"Completar Tarea Prioritaria","category":"productivity","icon":"🎯","type":"positive","xpReward":30,"hpPenalty":0,"goldReward":15,"defaultFrequency":"workdays","description":"Resolver el objetivo más importante del trabajo o estudio."},{"id":"hab_plan","title":"Planificar el Día Siguiente","category":"productivity","icon":"📅","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"Definir tus 3 prioridades clave antes de finalizar el día."},{"id":"hab_clean_room","title":"Ordenar Espacio de Trabajo","category":"productivity","icon":"🧹","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"Mantener ordenado tu escritorio o habitación despeja tu mente."},{"id":"hab_meditate","title":"Meditación o Respiración Consciente","category":"mind","icon":"🧘","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"10 minutos de calma, respiración y atención plena."},{"id":"hab_journal","title":"Escribir Diario o Gratitud","category":"mind","icon":"✍️","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"Anotar 3 cosas por las que estás agradecido hoy."},{"id":"hab_hobby","title":"Practicar Hobby Creativo","category":"mind","icon":"🎨","type":"positive","xpReward":25,"hpPenalty":0,"goldReward":12,"defaultFrequency":"2x_week","description":"Dibujo, música, escritura o cualquier expresión artística."},{"id":"hab_no_impulse","title":"Cero Gastos Hormiga o Impulsivos","category":"finance","icon":"💰","type":"positive","xpReward":25,"hpPenalty":0,"goldReward":12,"defaultFrequency":"daily","description":"Control financiero: no gastar en compras innecesarias."},{"id":"hab_track_expenses","title":"Registrar Gastos del Día","category":"finance","icon":"📊","type":"positive","xpReward":20,"hpPenalty":0,"goldReward":10,"defaultFrequency":"daily","description":"Anotar cada ingreso y egreso en tu presupuesto."},{"id":"hab_no_soda","title":"Consumir Refrescos o Bebidas Azucaradas","category":"negative","icon":"🥤","type":"negative","xpReward":0,"hpPenalty":15,"goldReward":0,"defaultFrequency":"daily","description":"Penalización: consumir exceso de azúcar daña tu salud."},{"id":"hab_no_junk","title":"Comer Comida Chatarra / Frituras","category":"negative","icon":"🍔","type":"negative","xpReward":0,"hpPenalty":20,"goldReward":0,"defaultFrequency":"daily","description":"Penalización: ultraprocesados afectan tu rendimiento."},{"id":"hab_no_scroll","title":"Más de 2 Horas en Redes Sociales","category":"negative","icon":"📱","type":"negative","xpReward":0,"hpPenalty":20,"goldReward":0,"defaultFrequency":"daily","description":"Penalización: el scrolling infinito drena tu concentración."},{"id":"hab_no_smoke","title":"Fumar Cigarrillo o Vapear","category":"negative","icon":"🚬","type":"negative","xpReward":0,"hpPenalty":25,"goldReward":0,"defaultFrequency":"daily","description":"Penalización severa: afecta directamente tu vitalidad."},{"id":"hab_no_procrastinate","title":"Procrastinar Deberes Urgentes","category":"negative","icon":"🛋️","type":"negative","xpReward":0,"hpPenalty":20,"goldReward":0,"defaultFrequency":"workdays","description":"Penalización: aplazar compromisos críticos genera estrés."},{"id":"hab_no_late","title":"Desvelarse Sin Motivo (> 12:00 AM)","category":"negative","icon":"🌙","type":"negative","xpReward":0,"hpPenalty":15,"goldReward":0,"defaultFrequency":"daily","description":"Penalización: trasnochar disminuye tu regeneración física."}]$habify_catalog$::jsonb) ON CONFLICT(id) DO NOTHING;
UPDATE public.habits h SET catalog_id=c.id,description=CASE WHEN h.description='' THEN coalesce(c.definition->>'description','') ELSE h.description END FROM public.habit_catalog c WHERE h.catalog_id IS NULL AND h.title=c.definition->>'title';
NOTIFY pgrst,'reload schema';
-- 3.5.1: daily habits reopen on the next local calendar day. The unique period
-- history, not a rolling legacy timer, prevents a second reward on the same day.
UPDATE public.habits SET available_after=NULL WHERE available_after IS NOT NULL;
-- Repair only the accidental generic water preset. Keep history, streaks,
-- difficulty, earned bonuses and balances intact; custom targets are untouched.
UPDATE public.habits SET progression='{"initial":2,"max":3,"step":1,"required":7,"unit":"liters"}'::jsonb
 WHERE (catalog_id='hab_water' OR title='Beber 2 Litros de Agua')
 AND progression='{"initial":5,"max":20,"step":5,"required":7,"unit":"units"}'::jsonb;
COMMIT;
