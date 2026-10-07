-- Habify: appearance, cosmetic ownership and atomic purchases.
-- Run once in the Supabase SQL editor; rerunning is safe. No existing shop
-- item type constraints or inventory policies are changed by this migration.
-- Assumes the existing public.avatars table has id, user_id (auth.users UUID),
-- gold (integer), and updated_at, with one avatar per account. Existing avatar
-- RLS and the server-side rules for earning gold remain the app's responsibility.
-- The new endpoints authorize auth.uid(), verify the requested avatar, validate
-- ownership, and accept no client-supplied price, balance or inventory owner.

BEGIN;

ALTER TABLE public.avatars
    ADD COLUMN IF NOT EXISTS appearance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.avatar_cosmetic_catalog (
    id text PRIMARY KEY,
    slot text NOT NULL CHECK (slot IN ('outfit', 'accessory', 'headwear')),
    name text NOT NULL,
    cost integer NOT NULL CHECK (cost >= 0),
    enabled boolean NOT NULL DEFAULT true
);

-- CREATE TABLE IF NOT EXISTS does not update constraints on an older install.
ALTER TABLE public.avatar_cosmetic_catalog
    DROP CONSTRAINT IF EXISTS avatar_cosmetic_catalog_slot_check;
ALTER TABLE public.avatar_cosmetic_catalog
    ADD CONSTRAINT avatar_cosmetic_catalog_slot_check
    CHECK (slot IN ('outfit', 'accessory', 'headwear'));

CREATE TABLE IF NOT EXISTS public.avatar_cosmetics (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id text NOT NULL REFERENCES public.avatar_cosmetic_catalog(id),
    acquired_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

INSERT INTO public.avatar_cosmetic_catalog (id, slot, name, cost) VALUES
    ('outfit_ranger', 'outfit', 'Traje de exploración', 80),
    ('outfit_knight', 'outfit', 'Armadura de guardián', 140),
    ('outfit_arcane', 'outfit', 'Vestimenta arcana', 160),
    ('acc_scarf', 'accessory', 'Pañuelo aventurero', 35),
    ('acc_circlet', 'accessory', 'Diadema estelar', 65),
    ('acc_cape', 'accessory', 'Capa del viajero', 90),
    ('headwear_guardian', 'headwear', 'Casco de guardián', 110),
    ('headwear_winged', 'headwear', 'Yelmo alado', 150),
    ('headwear_arcane', 'headwear', 'Capucha arcana', 130)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.avatar_cosmetic_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_cosmetics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wardrobe catalog is readable" ON public.avatar_cosmetic_catalog;
CREATE POLICY "Wardrobe catalog is readable" ON public.avatar_cosmetic_catalog
    FOR SELECT TO authenticated USING (enabled);

DROP POLICY IF EXISTS "Read own wardrobe" ON public.avatar_cosmetics;
CREATE POLICY "Read own wardrobe" ON public.avatar_cosmetics
    FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Purchases are the only player-accessible path to write ownership.
REVOKE ALL ON public.avatar_cosmetic_catalog, public.avatar_cosmetics FROM anon, authenticated;
GRANT SELECT ON public.avatar_cosmetic_catalog, public.avatar_cosmetics TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_avatar_cosmetic(p_avatar_id text, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_avatar public.avatars%ROWTYPE;
    v_item public.avatar_cosmetic_catalog%ROWTYPE;
    v_gold integer;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_authenticated');
    END IF;

    SELECT * INTO v_item FROM public.avatar_cosmetic_catalog
        WHERE id = p_item_id AND enabled;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unavailable');
    END IF;

    -- Every purchase for this avatar locks the same row. Concurrent requests,
    -- including duplicate retries after lost responses, cannot spend twice.
    SELECT * INTO v_avatar FROM public.avatars
        WHERE user_id = v_user_id AND id::text = p_avatar_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'avatar_not_found');
    END IF;
    v_gold := coalesce(v_avatar.gold, 0);

    IF EXISTS (SELECT 1 FROM public.avatar_cosmetics
               WHERE user_id = v_user_id AND item_id = p_item_id) THEN
        RETURN jsonb_build_object('status', 'owned', 'item_id', p_item_id, 'gold', v_gold);
    END IF;
    IF v_gold < v_item.cost THEN
        RETURN jsonb_build_object('status', 'insufficient_gold', 'gold', v_gold);
    END IF;

    UPDATE public.avatars SET gold = v_gold - v_item.cost, updated_at = now()
        WHERE id = v_avatar.id;
    INSERT INTO public.avatar_cosmetics (user_id, item_id) VALUES (v_user_id, p_item_id);
    RETURN jsonb_build_object('status', 'purchased', 'item_id', p_item_id, 'gold', v_gold - v_item.cost);
END;
$$;

-- Central validation also runs on direct writes to avatars.appearance. The
-- existing game's avatar UPDATE permission cannot bypass cosmetic ownership.
CREATE OR REPLACE FUNCTION public.validate_avatar_appearance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_value jsonb := coalesce(NEW.appearance, '{}'::jsonb);
    v_outfit text;
    v_accessory text;
    v_headwear text;
BEGIN
    IF jsonb_typeof(v_value) <> 'object' THEN
        RAISE EXCEPTION 'Appearance must be an object' USING ERRCODE = '22023';
    END IF;
    -- Older clients do not know this field. Their saves must not remove an
    -- equipped helmet or undo the player's explicit choice to wear none.
    IF TG_OP = 'UPDATE' AND NOT (v_value ? 'headwear')
       AND OLD.appearance ? 'headwear' THEN
        v_value := v_value || jsonb_build_object('headwear', OLD.appearance->'headwear');
    END IF;
    -- Keep the empty initial value so first-login preferences from signup
    -- metadata can be restored by the client, including confirmation by email.
    IF v_value = '{}'::jsonb THEN
        NEW.appearance := v_value;
        RETURN NEW;
    END IF;
    v_outfit := coalesce(v_value->>'outfit', 'default');
    v_accessory := coalesce(v_value->>'accessory', 'none');
    v_headwear := coalesce(v_value->>'headwear', 'default');
    IF v_outfit NOT IN ('default', 'outfit_ranger', 'outfit_knight', 'outfit_arcane')
       OR v_accessory NOT IN ('none', 'acc_scarf', 'acc_circlet', 'acc_cape')
       OR v_headwear NOT IN ('default', 'none', 'headwear_guardian', 'headwear_winged', 'headwear_arcane') THEN
        RAISE EXCEPTION 'Invalid cosmetic item' USING ERRCODE = '22023';
    END IF;
    IF (v_outfit <> 'default' AND NOT EXISTS (
            SELECT 1 FROM public.avatar_cosmetics WHERE user_id = NEW.user_id AND item_id = v_outfit))
       OR (v_accessory <> 'none' AND NOT EXISTS (
            SELECT 1 FROM public.avatar_cosmetics WHERE user_id = NEW.user_id AND item_id = v_accessory))
       OR (v_headwear NOT IN ('default', 'none') AND NOT EXISTS (
            SELECT 1 FROM public.avatar_cosmetics WHERE user_id = NEW.user_id AND item_id = v_headwear)) THEN
        RAISE EXCEPTION 'Cosmetic item is not owned' USING ERRCODE = '42501';
    END IF;

    -- Whitelist every stored field; never retain HTML, unknown properties or
    -- oversized user-provided strings in this cosmetic data.
    NEW.appearance := jsonb_build_object(
        'body', CASE WHEN v_value->>'body' = 'female' THEN 'female' ELSE 'male' END,
        'skin', CASE WHEN v_value->>'skin' ~ '^#[0-9a-fA-F]{6}$' THEN lower(v_value->>'skin') ELSE '#efbd91' END,
        'hairStyle', CASE WHEN v_value->>'hairStyle' IN ('short', 'long', 'ponytail', 'braids') THEN v_value->>'hairStyle' ELSE 'short' END,
        'hairColor', CASE WHEN v_value->>'hairColor' ~ '^#[0-9a-fA-F]{6}$' THEN lower(v_value->>'hairColor') ELSE '#44302e' END,
        'outfitColor', CASE WHEN v_value->>'outfitColor' ~ '^#[0-9a-fA-F]{6}$' THEN lower(v_value->>'outfitColor') ELSE '#8256c6' END,
        'outfit', v_outfit,
        'accessory', v_accessory,
        'headwear', v_headwear
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_avatar_appearance ON public.avatars;
CREATE TRIGGER validate_avatar_appearance
    BEFORE INSERT OR UPDATE OF appearance ON public.avatars
    FOR EACH ROW EXECUTE FUNCTION public.validate_avatar_appearance();

CREATE OR REPLACE FUNCTION public.save_avatar_appearance(p_avatar_id text, p_appearance jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_appearance jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_authenticated');
    END IF;
    -- The trigger normalizes colors and validates paid ownership. This write
    -- never touches gold, habits, equipment, class, or progression.
    UPDATE public.avatars SET appearance = p_appearance, updated_at = now()
        WHERE user_id = v_user_id AND id::text = p_avatar_id
        RETURNING appearance INTO v_appearance;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'avatar_not_found');
    END IF;
    RETURN jsonb_build_object('status', 'saved', 'appearance', v_appearance);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_avatar_appearance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_avatar_cosmetic(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_avatar_appearance(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_avatar_cosmetic(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_avatar_appearance(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
