const { test, expect } = require('@playwright/test');
const { mockCombat } = require('../helpers/browser-combat.cjs');
test.setTimeout(60000);

// Isolated account: purchases and reloads only write to this browser's local fixture.
async function boot(page) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#auth-form')).toBeVisible();
    await page.evaluate(() => {
        GameState.user = { id: 'equipment-test' }; GameState.avatarId = 'equipment-test';
        Object.assign(GameState.avatar, { name: 'Diegox', avatarClass: 'mage', level: 7, hp: 100, maxHp: 100, gold: 500, isDead: false, equippedWeapon: null, equippedSpell: null, equippedBackground: 'bg_space', equippedPet: 'pet_trex' });
        GameState.inventory = [{ id: 'wpn_staff', name: 'Bastón Arcano', type: 'weapon' }, { id: 'wpn_bow', name: 'Arco Élfico', type: 'weapon' }];
        GameState.shopItems = [{ id: 'spell_fire', name: 'Bola de Fuego', type: 'spell', icon: '🔥', cost: 50, description: 'Fuego', purchased: false }];
        const saved = JSON.parse(localStorage.getItem('equipment-fixture') || 'null');
        if (saved) { Object.assign(GameState.avatar, saved.avatar); GameState.inventory = saved.inventory; GameState.shopItems = saved.shop; }
        saveAvatarToDB = async () => localStorage.setItem('equipment-fixture', JSON.stringify({ avatar: GameState.avatar, inventory: GameState.inventory, shop: GameState.shopItems }));
        addInventoryToDB = async () => {}; addBattleLogToDB = async () => {};
        supabase.rpc = async (name, args) => {
            if (name !== 'purchase_shop_item') return { error: { code: 'PGRST202' } };
            const item = GameState.shopItems.find(product => product.id === args.p_item_id);
            return { data: { status: 'purchased', item_id: item.id, avatar: { gold: GameState.avatar.gold - item.cost } } };
        };
        Engine._controlEnemy = () => {};
        // Advance simulation explicitly; WebKit focus/resize events may restart RAF.
        Engine._gameLoop = () => {};
        App.initInput(); App.showMainApp();
    });
    await mockCombat(page);
}

async function enterArena(page) {
    await page.locator('.nav-item[data-view="arena"]').click();
    if (await page.locator('#battle-btn').count()) await page.locator('#battle-btn').click();
    await expect(page.locator('.combat-player')).toBeVisible();
    await page.evaluate(() => {
        Engine.stopGameLoop();
        const [player, enemy] = Engine._rtEntities;
        player.x = Engine._combat.width * .25;
        enemy.x = Engine._combat.width * .85;
    });
}

async function step(page, frames) {
    await page.evaluate(frames => {
        for (let i = 0; i < frames; i++) Engine._updateRT(1 / 120);
        Engine._renderRT();
    }, frames);
}

test('buying and removing fire updates touch controls, keyboard and the saved equipment', async ({ page }) => {
    await boot(page);
    await page.locator('.nav-item[data-view="store"]').click();
    await page.locator('[data-item-id="spell_fire"] .store-purchase').click();
    const fireItem = page.locator('.inventory-item').filter({ hasText: 'Bola de Fuego' });
    await expect(fireItem).toHaveAttribute('aria-pressed', 'true');
    await enterArena(page);
    await expect(page.locator('[data-action="magic"]')).toBeVisible();
    await expect(page.locator('[data-action="fire"]')).toBeVisible();
    await page.keyboard.press('f');
    await step(page, 1);
    await expect(page.locator('.combat-projectile-magic')).toHaveCount(1);
    expect(await page.evaluate(() => GameState.currentBattle.fireUses)).toBe(0);
    await step(page, 160);
    await page.locator('[data-action="fire"]').click();
    await step(page, 1);
    await expect(page.locator('.combat-projectile-fire')).toHaveCount(1);
    await expect(page.locator('[data-action="fire"]')).toBeDisabled();
    await expect(page.locator('[data-action="fire"]')).toContainText('USADO');
    await step(page, 160);
    await page.locator('.battle-toolbar button').first().click();
    await page.locator('.nav-item[data-view="store"]').click();
    await fireItem.click();
    await expect(fireItem).toHaveAttribute('aria-pressed', 'false');
    await enterArena(page);
    await expect(page.locator('[data-action="fire"]')).toBeDisabled();
    await page.locator('#btn-flee-battle').click();
    await expect(page.locator('.battle-result')).toBeVisible();
    await enterArena(page);
    await expect(page.locator('[data-action="fire"]')).toHaveCount(0);
    await page.keyboard.press('x');
    await step(page, 12); // Let any remaining hit-stop finish before the buffered cast.
    await expect(page.locator('.combat-projectile-magic')).toHaveCount(1);
    await boot(page);
    await enterArena(page);
    await expect(page.locator('[data-action="fire"]')).toHaveCount(0);
    await expect(page.locator('[data-action="magic"]')).toBeVisible();
});

for (const [weapon, name, type, label] of [['wpn_bow', 'Arco Élfico', 'arrow', 'FLECHA'], ['wpn_staff', 'Bastón Arcano', 'magic', 'RAYO']]) {
    test(`${weapon} fires a visible projectile with the attack control and preserves it while paused`, async ({ page }, info) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await boot(page);
        await page.locator('.nav-item[data-view="store"]').click();
        await page.locator('.inventory-item').filter({ hasText: name }).click();
        await enterArena(page);
        await expect(page.locator('[data-action="attack"]')).toHaveAccessibleName(label);
        await page.locator('[data-action="attack"]').click();
        await step(page, 30);
        await expect(page.locator(`.combat-projectile-${type}`)).toHaveCount(1);
        await expect(page.locator('.combat-player')).toHaveAttribute('data-state', type === 'arrow' ? 'SHOOTING' : 'CASTING');
        await page.locator('#battle-pause-button').click();
        const position = await page.locator('.combat-projectile').getAttribute('style');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(await page.locator('.combat-projectile').getAttribute('style')).toBe(position);
        await page.locator('#battle-resume').click();
        await page.evaluate(() => Engine.stopGameLoop());
        await page.screenshot({ path: info.outputPath(`${weapon}.png`), fullPage: true });
        await step(page, 160);
        expect(await page.evaluate(() => GameState.currentBattle.oppHp < GameState.currentBattle.oppMaxHp)).toBe(true);
        await expect(page.locator('.combat-projectile')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
}
