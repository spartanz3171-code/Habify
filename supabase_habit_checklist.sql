-- Habify 3.5.1. Run AFTER supabase_habit_progression.sql (3.5.0 or later).
-- Repairs the generic water preset and replaces legacy rolling cooldowns
-- with the existing calendar-period reward lock. No accounts/history are deleted.
BEGIN;
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

-- Completed/legacy records still close their own day/week; no duplicate reward.
UPDATE public.habits SET available_after=NULL WHERE available_after IS NOT NULL;

UPDATE public.habits
 SET progression='{"initial":2,"max":3,"step":1,"required":7,"unit":"liters"}'::jsonb
 WHERE (catalog_id='hab_water' OR title='Beber 2 Litros de Agua')
 AND progression='{"initial":5,"max":20,"step":5,"required":7,"unit":"units"}'::jsonb;
COMMIT;
