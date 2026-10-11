-- Habify: free beard choices, including no beard. Run after supabase_customization.sql.
-- No balances, inventory, rewards or existing appearances are changed.
BEGIN;
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
    -- Keep beard choices when an older client omits the new free style field.
    IF TG_OP = 'UPDATE' AND NOT (v_value ? 'beardStyle')
       AND OLD.appearance ? 'beardStyle' THEN
        v_value := v_value || jsonb_build_object('beardStyle', OLD.appearance->'beardStyle');
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
        'beardStyle', CASE WHEN v_value->>'beardStyle' IN ('default', 'none', 'short', 'goatee', 'long', 'braided') THEN v_value->>'beardStyle' ELSE 'default' END
    );
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_avatar_appearance() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
