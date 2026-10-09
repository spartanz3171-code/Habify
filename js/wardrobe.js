// Habify wardrobe: free appearance edits and server-authorized cosmetic buys.
// Local storage is scoped to the authenticated account, never used as proof of
// ownership, and clearly distinguished from a successful cloud save.
const Wardrobe = (() => {
    const catalog = Object.freeze([
        { id: 'outfit_ranger', slot: 'outfit', type: 'outfit', cost: 80, icon: '🏹', name: 'Traje de exploración', nameEn: 'Ranger outfit', description: 'Cuero, hombreras y botas para nuevas aventuras.', descriptionEn: 'Leather, shoulder guards and boots for new adventures.' },
        { id: 'outfit_knight', slot: 'outfit', type: 'outfit', cost: 140, icon: '🛡️', name: 'Armadura de guardián', nameEn: 'Guardian armor', description: 'Placas metálicas con detalles de tu color favorito.', descriptionEn: 'Metal plates with accents in your favorite color.' },
        { id: 'outfit_arcane', slot: 'outfit', type: 'outfit', cost: 160, icon: '🔮', name: 'Vestimenta arcana', nameEn: 'Arcane robes', description: 'Una túnica con bordados y detalles mágicos.', descriptionEn: 'Robes with embroidery and magical details.' },
        { id: 'headwear_guardian', slot: 'headwear', type: 'headwear', cost: 110, icon: '🪖', name: 'Casco de guardián', nameEn: 'Guardian helmet', description: 'Acero firme para acompañarte en cada aventura.', descriptionEn: 'Sturdy steel for every adventure.' },
        { id: 'headwear_winged', slot: 'headwear', type: 'headwear', cost: 150, icon: '🪽', name: 'Yelmo alado', nameEn: 'Winged helm', description: 'Un yelmo con alas y detalles dorados.', descriptionEn: 'A winged helm with golden accents.' },
        { id: 'headwear_arcane', slot: 'headwear', type: 'headwear', cost: 130, icon: '🔮', name: 'Capucha arcana', nameEn: 'Arcane hood', description: 'Una capucha de tela con un toque de magia.', descriptionEn: 'A cloth hood with a touch of magic.' },
        { id: 'acc_scarf', slot: 'accessory', type: 'accessory', cost: 35, icon: '🧣', name: 'Pañuelo aventurero', nameEn: 'Adventurer scarf', description: 'Un toque de color para acompañar tus movimientos.', descriptionEn: 'A splash of color to follow every move.' },
        { id: 'acc_circlet', slot: 'accessory', type: 'accessory', cost: 65, icon: '👑', name: 'Diadema estelar', nameEn: 'Star circlet', description: 'Metal dorado y una gema luminosa.', descriptionEn: 'Golden metal and a glowing gem.' },
        { id: 'acc_cape', slot: 'accessory', type: 'accessory', cost: 90, icon: '🦸', name: 'Capa del viajero', nameEn: 'Traveler cape', description: 'Una capa que sigue tus pasos y saltos.', descriptionEn: 'A cape that follows your steps and jumps.' }
    ].map(item => Object.freeze(item)));
    let ownerId = null;
    let owned = new Set();
    let available = new Map();
    let appearanceQueue = Promise.resolve();
    const english = () => typeof I18N !== 'undefined' && I18N.current === 'en';
    const say = (es, en) => english() ? en : es;
    const normalize = appearance => CharacterArt.normalizeAppearance(appearance || {});
    const context = () => ({ userId: GameState.user?.id, avatarId: GameState.avatarId });
    const current = ctx => !!ctx.userId && ctx.userId === GameState.user?.id && ctx.avatarId === GameState.avatarId;
    const storageKey = userId => `habify_appearance_v1_${userId}`;
    const result = (ok, status, message, code) => ({ ok, status, message, ...(code ? { code } : {}) });
    const sessionError = () => result(false, 'error', say('La sesión cambió. Vuelve a abrir el guardarropa.', 'Your session changed. Open the wardrobe again.'), 'session_changed');

    function canSaveLocally(error) {
        if (!error) return false;
        const recoverable = ['network', 'PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '08000', '08001', '08003', '08006', '57P01'];
        return recoverable.includes(error.code) || error.status >= 500 ||
            (!error.code && /fetch|network|connection|timeout|offline/i.test(error.message || ''));
    }

    function readLocal(userId) {
        if (!userId) return null;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey(userId)) || 'null');
            return saved && saved.appearance && typeof saved.appearance === 'object' ? saved : null;
        } catch (_) { return null; }
    }

    function writeLocal(userId, appearance, pending) {
        try {
            localStorage.setItem(storageKey(userId), JSON.stringify({ appearance, pending, updatedAt: Date.now() }));
            return true;
        } catch (_) { return false; }
    }

    function reset() {
        ownerId = null;
        owned = new Set();
        available = new Map();
        GameState.cosmeticInventory = [];
        GameState.cosmeticsReady = false;
        GameState.appearanceSaveStatus = null;
        GameState.avatar.appearance = normalize({});
    }

    function owns(itemId) {
        return ownerId === GameState.user?.id && owned.has(itemId);
    }

    function isEquipped(itemId) {
        const item = catalog.find(entry => entry.id === itemId);
        return !!item && GameState.avatar.appearance?.[item.slot] === itemId;
    }

    function listCosmetics() {
        return catalog.map(item => ({
            ...item,
            name: english() ? item.nameEn : item.name,
            description: english() ? item.descriptionEn : item.description,
            cost: ownerId === GameState.user?.id && available.has(item.id) ? available.get(item.id).cost : item.cost,
            purchased: owns(item.id),
            equipped: isEquipped(item.id),
            available: ownerId === GameState.user?.id && available.has(item.id)
        }));
    }

    async function hydrate(dbAvatar) {
        const ctx = context();
        if (!ctx.userId || !ctx.avatarId) { reset(); return; }
        ownerId = ctx.userId;
        owned = new Set();
        available = new Map();
        GameState.cosmeticsReady = false;
        GameState.cosmeticInventory = [];
        const local = readLocal(ctx.userId);
        const cloud = dbAvatar.appearance && typeof dbAvatar.appearance === 'object' && Object.keys(dbAvatar.appearance).length ? dbAvatar.appearance : null;
        const registered = normalize(GameState.user.user_metadata?.appearance);
        registered.outfit = 'default';
        registered.accessory = 'none';
        if (!['default', 'none'].includes(registered.headwear)) registered.headwear = 'default';
        const useLocal = local && (local.pending || !cloud);
        GameState.avatar.appearance = normalize(useLocal ? local.appearance : cloud || registered);
        GameState.appearanceSaveStatus = useLocal ? 'local' : cloud ? 'cloud' : null;

        try {
            const [items, inventory] = await Promise.all([
                supabase.from('avatar_cosmetic_catalog').select('id, cost, enabled').eq('enabled', true),
                supabase.from('avatar_cosmetics').select('item_id').eq('user_id', ctx.userId)
            ]);
            if (!current(ctx)) return;
            if (items.error || inventory.error) return;
            available = new Map((items.data || []).filter(item => catalog.some(entry => entry.id === item.id)).map(item => [item.id, item]));
            owned = new Set((inventory.data || []).map(item => item.item_id));
            GameState.cosmeticInventory = [...owned];
            GameState.cosmeticsReady = available.size > 0;
        } catch (_) {
            // The rest of the game still works before the migration or offline.
        }
    }

    async function persistAppearance(draft, ctx) {
        if (!current(ctx) || !ctx.avatarId) return sessionError();
        const appearance = normalize(draft);
        for (const slot of ['outfit', 'accessory', 'headwear']) {
            const itemId = appearance[slot];
            if (itemId !== 'default' && itemId !== 'none' && !owns(itemId)) {
                return result(false, 'error', say('Primero desbloquea esa prenda en el guardarropa.', 'Unlock that item in the wardrobe first.'), 'not_owned');
            }
        }

        let response;
        try {
            response = await supabase.rpc('save_avatar_appearance', { p_avatar_id: String(ctx.avatarId), p_appearance: appearance });
        } catch (_) {
            response = { error: { code: 'network' } };
        }
        if (!current(ctx)) return sessionError();
        if (!response.error && response.data?.status === 'saved') {
            const cloudAppearance = response.data.appearance;
            if (!cloudAppearance || typeof cloudAppearance !== 'object' || Array.isArray(cloudAppearance)) {
                return result(false, 'error', say('Tu cuenta no confirmó la apariencia. Vuelve a intentarlo.', 'Your account did not confirm the appearance. Please try again.'), 'invalid_response');
            }
            const savedAppearance = normalize(cloudAppearance);
            const hasHeadwear = Object.prototype.hasOwnProperty.call(cloudAppearance, 'headwear');
            if (!hasHeadwear || cloudAppearance.headwear !== appearance.headwear) {
                // Older validators discard unknown fields. Keep a free helmet
                // choice pending locally, while retaining all cloud-validated fields.
                if (!hasHeadwear && ['default', 'none'].includes(appearance.headwear)) {
                    const pendingAppearance = { ...savedAppearance, headwear: appearance.headwear };
                    if (!writeLocal(ctx.userId, pendingAppearance, true)) {
                        return result(false, 'error', say('No se pudo conservar el casco. Revisa el almacenamiento del navegador.', 'Could not keep your headwear choice. Check your browser storage.'), 'storage_unavailable');
                    }
                    GameState.avatar.appearance = pendingAppearance;
                    GameState.appearanceSaveStatus = 'local';
                    return result(true, 'local', say('Apariencia guardada. El casco se conserva en este dispositivo; su sincronización con tu cuenta está pendiente.', 'Appearance saved. Your headwear choice is kept on this device; account syncing is pending.'), 'headwear_sync_pending');
                }
                // A paid helmet needs explicit confirmation; never turn a
                // different or missing server value into a successful equip.
                return result(false, 'error', say('Tu cuenta no confirmó el casco. No se equipó; vuelve a intentarlo más tarde.', 'Your account did not confirm the headwear. It was not equipped; try again later.'), 'headwear_not_saved');
            }
            GameState.avatar.appearance = savedAppearance;
            GameState.appearanceSaveStatus = 'cloud';
            writeLocal(ctx.userId, GameState.avatar.appearance, false);
            return result(true, 'cloud', say('Apariencia guardada en tu cuenta.', 'Appearance saved to your account.'));
        }
        // An explicit server rejection (ownership, session, invalid data) must
        // never become a seemingly successful local save.
        if (!canSaveLocally(response.error)) {
            const code = response.data?.status || 'not_authorized';
            return result(false, 'error', say('No se pudo guardar. Revisa tu sesión y tus prendas desbloqueadas.', 'Could not save. Check your session and unlocked items.'), code);
        }
        if (!writeLocal(ctx.userId, appearance, true)) {
            return result(false, 'error', say('No se pudo guardar. Revisa la conexión o el almacenamiento del navegador.', 'Could not save. Check your connection or browser storage.'), 'storage_unavailable');
        }
        GameState.avatar.appearance = appearance;
        GameState.appearanceSaveStatus = 'local';
        const notReady = ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(response.error?.code);
        return result(true, 'local', notReady
            ? say('Guardado en este dispositivo. La sincronización con tu cuenta aún no está disponible.', 'Saved on this device. Account syncing is not available yet.')
            : say('Guardado en este dispositivo. Vuelve a guardar con conexión para sincronizar tu cuenta.', 'Saved on this device. Save again when connected to sync your account.'));
    }

    function saveAppearance(draft) {
        const ctx = context();
        const appearance = normalize(draft);
        const task = () => persistAppearance(appearance, ctx);
        const pending = appearanceQueue.then(task, task);
        appearanceQueue = pending.catch(() => undefined);
        return pending;
    }

    async function purchase(itemId) {
        const ctx = context();
        const item = catalog.find(entry => entry.id === itemId);
        if (!current(ctx) || !ctx.avatarId) return sessionError();
        if (!item) return result(false, 'error', say('Prenda desconocida.', 'Unknown item.'), 'invalid_item');
        if (owns(itemId)) return result(true, 'cloud', say('Esta prenda ya es tuya.', 'You already own this item.'), 'already_owned');
        if (!GameState.cosmeticsReady || !available.has(itemId)) {
            return result(false, 'error', say('El guardarropa todavía no está disponible para comprar. Inténtalo más tarde.', 'Wardrobe purchases are not available yet. Try again later.'), 'unavailable');
        }
        return queueAvatarWrite(async () => {
            if (!current(ctx)) return sessionError();
            const startingGold = GameState.avatar.gold;
            let response;
            try {
                response = await supabase.rpc('purchase_avatar_cosmetic', { p_avatar_id: String(ctx.avatarId), p_item_id: itemId });
            } catch (_) {
                response = { error: { code: 'network' } };
            }
            if (!current(ctx)) return sessionError();
            if (response.error || !response.data) {
                return result(false, 'error', say('No se pudo confirmar la compra. Revisa tu conexión y vuelve a intentarlo; no se cobrará dos veces.', 'Could not confirm the purchase. Check your connection and try again; you will not be charged twice.'), 'purchase_unconfirmed');
            }
            const data = response.data;
            if (data.status === 'insufficient_gold') {
                return result(false, 'error', say('Necesitas más oro. Completa hábitos para conseguirlo.', 'You need more gold. Complete habits to earn it.'), data.status);
            }
            if (!['purchased', 'owned'].includes(data.status) || data.item_id !== itemId || !Number.isFinite(data.gold) || data.gold < 0) {
                return result(false, 'error', say('No se pudo completar la compra. Vuelve a abrir el guardarropa.', 'Could not complete the purchase. Open the wardrobe again.'), data.status || 'invalid_response');
            }
            // Preserve rewards earned locally while the purchase was in flight;
            // normal avatar saves wait for this purchase before reading gold.
            GameState.avatar.gold = Math.max(0, data.gold + (GameState.avatar.gold - startingGold));
            if (GameState._avatarBalance) GameState._avatarBalance.gold = data.gold;
            owned.add(itemId);
            ownerId = ctx.userId;
            GameState.cosmeticInventory = [...owned];
            return result(true, 'cloud', say('¡Prenda desbloqueada! Ya puedes equiparla.', 'Item unlocked! You can equip it now.'), data.status);
        });
    }

    function equip(itemId) {
        const item = catalog.find(entry => entry.id === itemId);
        if (!item || !owns(itemId)) return Promise.resolve(result(false, 'error', say('Primero desbloquea esa prenda.', 'Unlock that item first.'), 'not_owned'));
        return saveAppearance({ ...normalize(GameState.avatar.appearance), [item.slot]: itemId });
    }

    function unequip(slot) {
        if (!['outfit', 'accessory', 'headwear'].includes(slot)) return Promise.resolve(result(false, 'error', say('Prenda desconocida.', 'Unknown item.'), 'invalid_slot'));
        return saveAppearance({ ...normalize(GameState.avatar.appearance), [slot]: slot === 'outfit' ? 'default' : 'none' });
    }

    return { catalog, listCosmetics, owns, isEquipped, hydrate, saveAppearance, purchase, equip, unequip, reset };
})();
window.Wardrobe = Wardrobe;
