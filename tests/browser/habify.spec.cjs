const { test, expect } = require('@playwright/test');

// The full UI runs with a test account and in-memory backend. Never writes to Supabase.
async function boot(page, migrated = false) {
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#auth-form')).toBeVisible();
    await page.evaluate(async migrated => {
        const purchased = new Set();
        let gold = 500;
        supabase = {
            from(table) {
                const response = table === 'avatar_cosmetic_catalog'
                    ? { data: Wardrobe.catalog.map(i => ({ id: i.id, cost: i.cost, enabled: true })), error: migrated ? null : { code: '42P01' } }
                    : table === 'avatar_cosmetics' ? { data: [...purchased].map(item_id => ({ item_id })), error: null } : { data: [], error: null };
                const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; }, single() { return query; }, update() { return query; }, upsert() { return query; }, insert() { return query; }, delete() { return query; }, then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); } };
                return query;
            },
            async rpc(name, args) {
                if (!migrated) return { error: { code: 'PGRST202' } };
                if (name === 'save_avatar_appearance') return { data: { status: 'saved', appearance: args.p_appearance } };
                const item = Wardrobe.catalog.find(i => i.id === args.p_item_id);
                const alreadyOwned = purchased.has(item.id);
                if (!alreadyOwned) { purchased.add(item.id); gold -= item.cost; }
                return { data: { status: alreadyOwned ? 'owned' : 'purchased', item_id: item.id, gold } };
            }
        };
        GameState.user = { id: 'browser-test-user', user_metadata: {} };
        GameState.avatarId = 'browser-avatar';
        Object.assign(GameState.avatar, { name: 'Aria', avatarClass: 'knight', level: 5, hp: 90, maxHp: 100, currentXP: 65, xpToLevel: 150, gold, isDead: false, equippedWeapon: 'wpn_sword', equippedShield: 'wpn_shield', equippedSpell: 'spell_fire,spell_heal', lastPenaltyCheck: new Date().toISOString() });
        GameState.inventory = [{ id: 'wpn_sword', name: 'Espada', type: 'weapon', icon: '⚔️' }, { id: 'wpn_shield', name: 'Escudo', type: 'shield', icon: '🛡️' }];
        GameState.shopItems = [{ id: 'pet_trex', name: 'Mini T-Rex', type: 'pet', icon: '🦖', description: 'Tu compañero de aventuras', cost: 50 }];
        GameState.habits = [{ id: 'water', title: 'Beber 2 litros de agua', type: 'positive', frequency: 'daily', xpReward: 20, goldReward: 10, completedAt: null }, { id: 'walk', title: 'Caminar durante 30 minutos', type: 'positive', frequency: 'daily', xpReward: 25, goldReward: 12, completedAt: null }];
        await Wardrobe.hydrate({ appearance: { body: 'female', hairStyle: 'ponytail', hairColor: '#684333', skin: '#dca078', outfitColor: '#29adff' } });
        App.initInput();
        App.showMainApp();
    }, migrated);
}

test('editor previews, saves locally and retains role across navigation', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
    await page.locator('.nav-item[data-view="character"]').click();
    await expect(page.locator('#character-role')).toHaveText('Caballera real');
    await page.getByRole('button', { name: 'Trenzas', exact: true }).click();
    await page.getByRole('button', { name: 'Violeta', exact: true }).last().click();
    await page.getByRole('button', { name: 'GUARDAR APARIENCIA', exact: true }).click();
    await expect(page.locator('#appearance-status')).toContainText('Guardado en este dispositivo');
    expect(await page.evaluate(() => GameState.avatar.avatarClass)).toBe('knight');
    await page.getByRole('button', { name: 'PROBAR', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'VOLVER', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.nav-item[data-view="dashboard"]').click();
    await page.locator('.nav-item[data-view="character"]').click();
    await expect(page.getByRole('button', { name: 'Trenzas', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: testInfo.outputPath('character.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#lang-switch').selectOption('en');
    await expect(page.locator('h1')).toHaveText('Your character');
    await expect(page.locator('.nav-item[data-view="character"]')).toContainText('Character');
    expect(errors).toEqual([]);
});

test('unlocked cosmetics buy once, equip visibly, and save to account', async ({ page }) => {
    await boot(page, true);
    await page.locator('.nav-item[data-view="character"]').click();
    const card = page.locator('.cosmetic-card').filter({ has: page.getByRole('heading', { name: 'Traje de exploración' }) });
    await card.getByRole('button', { name: 'COMPRAR', exact: true }).click();
    await expect(card.getByRole('button', { name: 'EQUIPAR', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => GameState.avatar.gold)).toBe(420);
    await card.getByRole('button', { name: 'EQUIPAR', exact: true }).click();
    await expect(card).toHaveClass(/equipped/);
    expect(await page.evaluate(() => GameState.avatar.appearance.outfit)).toBe('outfit_ranger');
    await expect(page.locator('#appearance-status')).toContainText('guardada en tu cuenta');
    await page.locator('.nav-item[data-view="arena"]').click();
    await expect(page.locator('.arena-fighter.player .character-art')).toBeVisible();
});

test('headwear can be hidden, saved locally, reloaded and restored in the editor', async ({ page }) => {
    await boot(page);
    await page.locator('.nav-item[data-view="character"]').click();
    await expect(page.locator('#character-preview .char-headwear')).toHaveCount(1);
    await page.getByRole('button', { name: 'Sin casco', exact: true }).click();
    await expect(page.locator('#character-preview .char-headwear')).toHaveCount(0);
    expect(await page.evaluate(() => GameState.avatar.appearance.headwear)).toBe('default');
    await page.getByRole('button', { name: 'GUARDAR APARIENCIA', exact: true }).click();
    await expect(page.locator('#appearance-status')).toContainText('Guardado en este dispositivo');
    // boot navigates to a fresh document with the same account and browser storage.
    await boot(page);
    await page.locator('.nav-item[data-view="character"]').click();
    await expect(page.getByRole('button', { name: 'Sin casco', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#character-preview .char-headwear')).toHaveCount(0);
    expect(await page.evaluate(() => GameState.avatar.avatarClass)).toBe('knight');
    await page.getByRole('button', { name: 'De clase', exact: true }).click();
    await expect(page.locator('#character-preview .char-headwear')).toHaveCount(1);
    await page.getByRole('button', { name: 'GUARDAR APARIENCIA', exact: true }).click();
    await expect(page.locator('#appearance-status')).toContainText('Guardado en este dispositivo');
    expect(await page.evaluate(() => GameState.avatar.appearance.headwear)).toBe('default');
});

test('headwear shop offers three styles and preview, purchase and equip have distinct effects', async ({ page }) => {
    await boot(page, true);
    await page.locator('.nav-item[data-view="store"]').click();
    await page.getByRole('button', { name: 'CASCOS', exact: true }).click();
    await expect(page.locator('.cosmetic-card')).toHaveCount(3);
    await expect(page.locator('.store-card')).toHaveCount(0);
    for (const name of ['Casco de guardián', 'Yelmo alado', 'Capucha arcana']) {
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    const card = page.locator('[data-cosmetic-id="headwear_guardian"]');
    await card.getByRole('button', { name: 'PROBAR', exact: true }).click();
    await expect(page.locator('.fitting-modal .char-headwear')).toHaveAttribute('data-headwear', 'headwear_guardian');
    expect(await page.evaluate(() => GameState.avatar.appearance.headwear)).toBe('default');
    expect(await page.evaluate(() => GameState.avatar.gold)).toBe(500);
    await page.getByRole('button', { name: 'VOLVER', exact: true }).click();
    await card.getByRole('button', { name: 'COMPRAR', exact: true }).click();
    await expect(card.getByRole('button', { name: 'EQUIPAR', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => GameState.avatar.gold)).toBe(390);
    expect(await page.evaluate(() => GameState.avatar.appearance.headwear)).toBe('default');
    await page.evaluate(() => Atelier.buy('headwear_guardian'));
    expect(await page.evaluate(() => GameState.avatar.gold)).toBe(390);
    await card.getByRole('button', { name: 'EQUIPAR', exact: true }).click();
    await expect(card.getByRole('button', { name: 'EQUIPADO', exact: true })).toBeDisabled();
    await page.locator('.nav-item[data-view="character"]').click();
    await expect(page.locator('#character-preview .char-headwear')).toHaveAttribute('data-headwear', 'headwear_guardian');
    expect(await page.evaluate(() => Atelier.draft.headwear)).toBe('headwear_guardian');
    await page.locator('.nav-item[data-view="arena"]').click();
    await expect(page.locator('.arena-fighter.player .char-headwear')).toHaveAttribute('data-headwear', 'headwear_guardian');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('battle moves, jumps, attacks and releases controls after navigation', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page, true);
    await page.locator('.nav-item[data-view="arena"]').click();
    await page.screenshot({ path: testInfo.outputPath('arena.png'), fullPage: true });
    await page.locator('#battle-btn').click();
    await expect(page.locator('.combat-player .character-art')).toBeVisible();
    // Freeze only enemy decision-making so keyboard assertions have no random interruption.
    await page.evaluate(() => { Engine._controlEnemy = () => {}; });
    const start = await page.evaluate(() => Engine._rtEntities[0].x);
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].x)).toBeGreaterThan(start + 15);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].grounded)).toBe(false);
    await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].grounded)).toBe(true);
    await page.keyboard.press('KeyV');
    await expect(page.locator('.combat-player .character-art')).toHaveAttribute('data-state', 'HEAVY_ATTACK');
    await page.screenshot({ path: testInfo.outputPath('battle.png'), fullPage: true });
    await page.locator('.nav-item[data-view="character"]').click();
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
    expect(await page.evaluate(() => Object.values(Engine._rtInputs).some(Boolean))).toBe(false);
    await page.locator('.nav-item[data-view="arena"]').click();
    await expect.poll(() => page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
    const button = page.locator('[data-action="left"]');
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => Engine._rtInputs.left)).toBe(true);
    await page.mouse.move(5, 5);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => Engine._rtInputs.left)).toBe(false);
    if (testInfo.project.name === 'mobile') {
        await page.locator('.rt-controls').scrollIntoViewIfNeeded();
        const leftBox = await button.boundingBox();
        const attackBox = await page.locator('[data-action="attack"]').boundingBox();
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
            { id: 1, x: leftBox.x + leftBox.width / 2, y: leftBox.y + leftBox.height / 2 },
            { id: 2, x: attackBox.x + attackBox.width / 2, y: attackBox.y + attackBox.height / 2 }
        ] });
        await expect.poll(() => page.evaluate(() => Engine._rtInputs.left && Engine._rtInputs.attack)).toBe(true);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => Engine._rtInputs.left || Engine._rtInputs.attack)).toBe(false);
        await cdp.detach();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const height = await page.locator('#real-time-arena').evaluate(el => el.clientHeight);
    expect(height).toBeGreaterThanOrEqual(278);
    await page.locator('#btn-flee-battle').click();
    await expect(page.locator('.battle-result')).toBeVisible();
    expect(errors).toEqual([]);
});

test('registration has women and men in every class', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => App.showAuth('register'));
    for (const role of ['hero', 'mage', 'knight', 'elf']) {
        await page.locator('#auth-avatar-class').selectOption(role);
        for (const body of ['female', 'male']) {
            await page.locator('#auth-avatar-body').selectOption(body);
            await expect(page.locator('#registration-preview .character-art')).toBeVisible();
        }
    }
});

test('habit catalog and shop remain usable on narrow screens', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page);
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 700 });
    await page.locator('.nav-item[data-view="habits"]').click();
    await expect(page.locator('.catalog-card').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('habits.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.nav-item[data-view="store"]').click();
    await expect(page.locator('.wardrobe-banner')).toBeVisible();
    await expect(page.locator('.store-card').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('store.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.wardrobe-banner').click();
    await expect(page.locator('h1')).toHaveText('Tu personaje');
    await expect(page.locator('#character-preview .character-art')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

test('store outfits can be tried on, bought once and equipped without leaving the store', async ({ page }, testInfo) => {
    await boot(page, true);
    await page.locator('.nav-item[data-view="character"]').click();
    await page.getByRole('button', { name: 'Trenzas', exact: true }).click();
    await page.locator('.nav-item[data-view="store"]').click();
    await page.getByRole('button', { name: 'ATUENDOS', exact: true }).click();
    await expect(page.locator('.cosmetic-card')).toHaveCount(3);
    await expect(page.locator('.store-card')).toHaveCount(0);
    const card = page.locator('[data-cosmetic-id="outfit_ranger"]');
    await card.getByRole('button', { name: 'PROBAR', exact: true }).click();
    expect(await page.evaluate(() => Atelier.previewAppearance().hairStyle)).toBe('ponytail');
    await page.keyboard.press('Escape');
    await card.getByRole('button', { name: 'COMPRAR', exact: true }).click();
    await expect(card.getByRole('button', { name: 'EQUIPAR', exact: true })).toBeEnabled();
    await page.evaluate(() => Atelier.buy('outfit_ranger'));
    expect(await page.evaluate(() => GameState.avatar.gold)).toBe(420);
    await card.getByRole('button', { name: 'EQUIPAR', exact: true }).click();
    await expect(card.getByRole('button', { name: 'EQUIPADO', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => GameState.currentView)).toBe('store');
    expect(await page.evaluate(() => GameState.avatar.appearance.outfit)).toBe('outfit_ranger');
    await page.screenshot({ path: testInfo.outputPath('outfit-store.png'), fullPage: true });
    await page.locator('.nav-item[data-view="arena"]').click();
    expect(await page.evaluate(() => {
        const expected = document.createElement('div');
        expected.innerHTML = CharacterArt.render(GameState.avatar);
        return expected.firstElementChild.isEqualNode(document.querySelector('.arena-fighter.player .character-art'));
    })).toBe(true);
});

test('equipment and cosmetic purchases share a lock in either order', async ({ page }) => {
    for (const first of ['cosmetic', 'equipment']) {
        await boot(page, true);
        await page.evaluate(first => {
            GameState.avatar.gold = 100;
            window.purchaseCalls = [];
            const rpc = supabase.rpc.bind(supabase);
            supabase.rpc = async (name, args) => {
                if (name !== 'purchase_avatar_cosmetic') return rpc(name, args);
                window.purchaseCalls.push('cosmetic');
                await new Promise(resolve => { window.releasePurchase = resolve; });
                return { data: { status: 'purchased', item_id: args.p_item_id, gold: 20 } };
            };
            addInventoryToDB = async () => {
                window.purchaseCalls.push('equipment');
                await new Promise(resolve => { window.releasePurchase = resolve; });
            };
            App.navigate('store');
            window.pendingPurchase = first === 'cosmetic' ? Atelier.buy('outfit_ranger') : App.buyItem('pet_trex');
        }, first);
        await expect.poll(() => page.evaluate(() => window.purchaseCalls.length)).toBe(1);
        if (first === 'cosmetic') await expect(page.locator('.store-purchase')).toBeDisabled();
        else await expect(page.locator('.inventory-item').first()).toBeDisabled();
        await expect(page.locator('[data-cosmetic-id="outfit_ranger"] .btn-gold')).toBeDisabled();
        await page.evaluate(first => first === 'cosmetic' ? App.buyItem('pet_trex') : Atelier.buy('outfit_ranger'), first);
        expect(await page.evaluate(() => window.purchaseCalls)).toEqual([first]);
        await page.evaluate(async () => { window.releasePurchase(); await window.pendingPurchase; });
        expect(await page.evaluate(() => GameState.avatar.gold)).toBe(first === 'cosmetic' ? 20 : 50);
        expect(await page.evaluate(() => Wardrobe.owns('outfit_ranger'))).toBe(first === 'cosmetic');
        expect(await page.evaluate(() => GameState.inventory.some(i => i.id === 'pet_trex'))).toBe(first === 'equipment');
        expect(await page.evaluate(() => App.shopBusy || Atelier.busy)).toBe(false);
    }
});

test('each pet has its own art and the equipped companion follows the hero', async ({ page }, testInfo) => {
    await boot(page, true);
    await page.evaluate(() => {
        GameState.shopItems = PetArt.ids.map((id, i) => ({ id, name: ['Mini T-Rex', 'Dragón', 'Gato mago', 'Fénix'][i], description: 'Compañero de aventuras', type: 'pet', cost: 50, icon: '★' }));
        App.navigate('store');
        App.filterStore('pet');
    });
    await expect(page.locator('.store-pet-art .pet-art')).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath('pets-store.png'), fullPage: true });
    await page.locator('[data-item-id="pet_phoenix"] .store-purchase').click();
    await expect(page.locator('.inventory-item .pet-phoenix')).toBeVisible();
    await page.locator('.nav-item[data-view="dashboard"]').click();
    await expect(page.locator('.companion-sprite .pet-phoenix')).toBeVisible();
    await page.locator('.nav-item[data-view="character"]').click();
    await expect(page.locator('.preview-companion .pet-phoenix')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('character-with-pet.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.preview-companion .pet-body').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('preview actions and direction keep each companion in sync without changing the saved hero', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page, true);
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 740 });
    const saved = await page.evaluate(() => JSON.stringify(GameState.avatar));
    await page.locator('.nav-item[data-view="character"]').click();
    for (const id of ['pet_trex', 'pet_dragon', 'pet_cat', 'pet_phoenix']) {
        await page.evaluate(id => {
            GameState.avatar.equippedPet = id;
            Atelier.begin();
            Atelier.refresh();
        }, id);
        const hero = page.locator('#character-preview .character-art');
        const pet = page.locator('#character-preview .pet-art');
        await page.getByRole('button', { name: 'Correr', exact: true }).click();
        await expect(hero).toHaveAttribute('data-state', 'RUNNING');
        await expect(pet).toHaveAttribute('data-state', 'RUNNING');
        expect(await pet.locator('.pet-body').evaluate(el => getComputedStyle(el).animationName)).toBe(id === 'pet_phoenix' ? 'pet-hover' : 'pet-trot');
        await page.getByRole('button', { name: 'Mirar a la izquierda', exact: true }).click();
        await expect(hero).toHaveAttribute('data-facing', 'left');
        await expect(pet).toHaveAttribute('data-facing', 'left');
        expect(await pet.locator('.pet-facing').evaluate(el => getComputedStyle(el).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)');
        await page.getByRole('button', { name: 'Trenzas', exact: true }).click();
        await expect(hero).toHaveAttribute('data-facing', 'left');
        await expect(pet).toHaveAttribute('data-state', 'RUNNING');
        for (const [label, state] of [['Salto', 'JUMPING'], ['Golpe', 'ATTACKING'], ['Magia', 'CASTING'], ['Defensa', 'GUARDING']]) {
            await page.getByRole('button', { name: label, exact: true }).click();
            await expect(hero).toHaveAttribute('data-state', state);
            await expect(pet).toHaveAttribute('data-state', state);
            await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
        }
        if (id === 'pet_cat') await expect(pet.locator('.pet-head .pet-hat')).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Salto', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('#character-preview').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    await page.locator('#lang-switch').selectOption('en');
    await expect(page.getByRole('button', { name: 'Face left', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Face right', exact: true }).click();
    await page.getByRole('button', { name: 'Idle', exact: true }).click();
    await expect(page.locator('#character-preview .pet-art')).toHaveAttribute('data-facing', 'right');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('companion-preview.png'), fullPage: true });
    expect(await page.evaluate(saved => {
        const original = JSON.parse(saved);
        return JSON.stringify({ ...GameState.avatar, equippedPet: original.equippedPet }) === saved;
    }, saved)).toBe(true);
    expect(errors).toEqual([]);
});

test('spell art follows direction, survives pause and expires after impact', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page, true);
    await page.locator('.nav-item[data-view="arena"]').click();
    await page.locator('#battle-btn').click();
    await expect(page.locator('.combat-player .character-art')).toBeVisible();
    await page.evaluate(() => {
        Engine.stopGameLoop();
        const [player, enemy] = Engine._rtEntities;
        enemy.aiDisabled = true;
        player.x = Engine._combat.width * .3;
        enemy.x = Engine._combat.width * .85;
        player.facing = 'right';
        Engine._castSpell(player, 'fire');
        Engine._renderRT();
    });
    await expect(page.locator('.combat-projectile-fire')).toHaveAttribute('data-charging', 'true');
    await page.evaluate(() => {
        for (let i = 0; i < 20; i++) Engine._updateRT(1 / 120);
        Engine._renderRT();
    });
    await expect(page.locator('.combat-projectile-fire')).toHaveAttribute('data-charging', 'false');
    expect(await page.locator('.combat-orb').evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');
    await page.screenshot({ path: testInfo.outputPath('fireball.png'), fullPage: true });
    await page.evaluate(() => { Engine.startGameLoop(); Engine.stopGameLoop(); });
    await expect(page.locator('#real-time-arena')).toHaveAttribute('data-paused', 'true');
    expect(await page.locator('.orb-core').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused');
    await page.evaluate(() => {
        const [player, enemy] = Engine._rtEntities;
        enemy.x = Engine._rtProjectiles[0].x + 18;
        window.beforeSpellHp = GameState.currentBattle.oppHp;
        Engine._updateRT(1 / 120);
        Engine._renderRT();
    });
    await expect(page.locator('.combat-burst-fire')).toHaveCount(1);
    await expect(page.locator('.combat-projectile')).toHaveCount(0);
    expect(await page.evaluate(() => GameState.currentBattle.oppHp < window.beforeSpellHp)).toBe(true);
    await page.evaluate(() => {
        for (let i = 0; i < 130; i++) Engine._updateRT(1 / 120);
        const player = Engine._rtEntities[0];
        player.facing = 'left';
        Engine._spawnProjectile(player, 'magic');
        Engine._renderRT();
    });
    await expect(page.locator('.combat-burst-fire')).toHaveCount(0);
    expect(await page.locator('.combat-orb').evaluate(el => getComputedStyle(el).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.orb-core').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.evaluate(() => {
        for (let i = 0; i < 100; i++) Engine._spellBurst('heal', 100, 100);
    });
    expect(await page.locator('.combat-effect').count()).toBeLessThanOrEqual(32);
    await page.locator('.nav-item[data-view="dashboard"]').click();
    expect(await page.evaluate(() => Engine._rtEffects.length)).toBe(0);
    expect(errors).toEqual([]);
});

test('delayed user loading cannot reopen the app after signing out', async ({ page }) => {
    await boot(page, true);
    await page.evaluate(() => {
        loadGameFromDB = () => new Promise(resolve => { window.releaseLoad = resolve; });
        window.pendingLoad = App.loadUserData();
        App.clearAccountView();
        GameState.user = null;
        App.showAuth('login');
    });
    await page.evaluate(async () => { window.releaseLoad(true); await window.pendingLoad; });
    await expect(page.locator('#auth-form')).toBeVisible();
    await expect(page.locator('#bottom-nav')).toBeHidden();
});

test.describe('installed web app files', () => {
    test.use({ serviceWorkers: 'allow' });
    test('new scripts and styles load from the service worker without a network', async ({ page, context }) => {
        await page.route('**/*.supabase.co/**', route => route.abort());
        await page.goto('/');
        await expect(page.locator('#auth-form')).toBeVisible();
        await page.evaluate(() => navigator.serviceWorker.ready);
        await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('#auth-form')).toBeVisible();
        await expect(page.locator('.auth-party .character-art')).toHaveCount(3);
        expect(await page.evaluate(() => typeof Wardrobe.saveAppearance)).toBe('function');
        expect(await page.evaluate(() => PetArt.supports('pet_phoenix'))).toBe(true);
        expect(await page.locator('.auth-container').evaluate(el => getComputedStyle(el).borderRadius)).toBe('9px');
    });
});
