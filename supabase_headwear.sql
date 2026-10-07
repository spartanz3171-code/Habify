-- Habify: upgrade an existing wardrobe to removable and purchasable headwear.
-- Prerequisite: supabase_customization.sql has already been installed.
-- Run the entire script in the Supabase SQL editor. It is transactional and
-- safe to rerun; existing prices, ownership, balances and appearances remain.

BEGIN;

-- The original inline CHECK keeps its PostgreSQL-generated constraint name.
-- Replacing it explicitly also upgrades tables created before headwear existed.
ALTER TABLE public.avatar_cosmetic_catalog
    DROP CONSTRAINT IF EXISTS avatar_cosmetic_catalog_slot_check;
ALTER TABLE public.avatar_cosmetic_catalog
    ADD CONSTRAINT avatar_cosmetic_catalog_slot_check
    CHECK (slot IN ('outfit', 'accessory', 'headwear'));

INSERT INTO public.avatar_cosmetic_catalog (id, slot, name, cost) VALUES
    ('headwear_guardian', 'headwear', 'Casco de guardián', 110),
    ('headwear_winged', 'headwear', 'Yelmo alado', 150),
    ('headwear_arcane', 'headwear', 'Capucha arcana', 130)
ON CONFLICT (id) DO NOTHING;

-- Keep this definition identical to the base wardrobe migration. The existing
-- trigger and save RPC use it for both direct writes and ordinary account saves.
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

REVOKE ALL ON FUNCTION public.validate_avatar_appearance() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
