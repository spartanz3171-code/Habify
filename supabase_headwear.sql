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
    v_field text;
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
    -- Keep beard choices when an older client omits the new free style field.
    IF TG_OP = 'UPDATE' AND NOT (v_value ? 'beardStyle')
       AND OLD.appearance ? 'beardStyle' THEN
        v_value := v_value || jsonb_build_object('beardStyle', OLD.appearance->'beardStyle');
    END IF;
    -- Older apps omit these free facial choices. Preserve the account's
    -- selected face rather than silently resetting it during another edit.
    IF TG_OP = 'UPDATE' THEN
        FOREACH v_field IN ARRAY ARRAY['eyeShape', 'mouthStyle', 'noseShape', 'browStyle', 'eyeColor'] LOOP
            IF NOT (v_value ? v_field) AND OLD.appearance ? v_field THEN
                v_value := v_value || jsonb_build_object(v_field, OLD.appearance->v_field);
            END IF;
        END LOOP;
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
        'headwear', v_headwear,
        'beardStyle', CASE WHEN v_value->>'beardStyle' IN ('default', 'none', 'short', 'goatee', 'long', 'braided') THEN v_value->>'beardStyle' ELSE 'default' END,
        'eyeShape', CASE WHEN v_value->>'eyeShape' IN ('classic', 'round', 'almond', 'focused') THEN v_value->>'eyeShape' ELSE 'classic' END,
        'mouthStyle', CASE WHEN v_value->>'mouthStyle' IN ('classic', 'smile', 'grin', 'serious') THEN v_value->>'mouthStyle' ELSE 'classic' END,
        'noseShape', CASE WHEN v_value->>'noseShape' IN ('classic', 'button', 'straight', 'broad') THEN v_value->>'noseShape' ELSE 'classic' END,
        'browStyle', CASE WHEN v_value->>'browStyle' IN ('classic', 'soft', 'arched', 'bold') THEN v_value->>'browStyle' ELSE 'classic' END,
        'eyeColor', CASE WHEN v_value->>'eyeColor' ~ '^#[0-9a-fA-F]{6}$' THEN lower(v_value->>'eyeColor') ELSE 'default' END
    );
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_avatar_appearance() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
