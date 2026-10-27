const { test, expect } = require('@playwright/test');
const { mockCombat, verifiedCombat } = require('../helpers/browser-combat.cjs');
test.use({ hasTouch: true });

async function boot(page, viewport = { width: 390, height: 844 }, prepareCombat = mockCombat) {
    await page.setViewportSize(viewport);
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#auth-form')).toBeVisible();
    await page.evaluate(() => {
        GameState.user = { id: 'landscape-user' }; GameState.avatarId = 'landscape-avatar';
        GameState.inventory = [{ id: 'spell_fire', name: 'Bola de Fuego', icon: '🔥', type: 'spell' }, { id: 'spell_heal', name: 'Curación Menor', icon: '♥', type: 'spell' }];
        Object.assign(GameState.avatar, { name: 'Aria', avatarClass: 'knight', level: 5, hp: 90, maxHp: 100, gold: 500, isDead: false, equippedSpell: 'spell_fire,spell_heal' });
        saveAvatarToDB = async () => {}; addBattleLogToDB = async () => {};
        Engine._controlEnemy = () => {}; // Stable input assertions; no random enemy hits.
        App.initInput(); App.showMainApp(); App.navigate('arena');
    });
    await prepareCombat(page);
    await page.locator('#battle-btn').click();
    await expect(page.locator('#real-time-arena')).toBeAttached();
}

test('real combat API verifies desktop and small-phone replays and retries a lost receipt only once', async ({ page }, info) => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 568, height: 240 }]) {
        await boot(page, viewport, target => verifiedCombat(target, { dropFirstResponse: true }));
        await expect.poll(() => page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
        await page.screenshot({ path: info.outputPath(`verified-combat-${viewport.width}.png`) });
        await page.keyboard.press('ArrowRight');
        await page.locator('#btn-flee-battle').click();
        await expect(page.locator('.battle-result-title')).toHaveText('PENDIENTE');
        expect(await page.evaluate(() => GameState.avatar.hp)).toBe(90);
        await page.getByRole('button', { name: 'REINTENTAR GUARDADO', exact: true }).click();
        await expect(page.locator('.battle-result-title')).toHaveText('RETIRADA');
        expect(await page.evaluate(() => GameState.avatar.hp)).toBe(80);
        expect(await page.evaluate(() => GameState.avatar.gold)).toBe(500);
        expect(await page.evaluate(() => GameState.battleLog.length)).toBe(1);
        expect(await page.evaluate(() => GameState.pendingCombatSettlement)).toBeNull();
    }
});

test('portrait waits safely, rotation resumes only on confirmation, and returning preserves the match', async ({ page }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await boot(page);
    await expect(page.getByRole('heading', { name: 'Gira tu celular' })).toBeVisible();
    await expect(page.locator('#battle-gameplay')).toHaveAttribute('inert', '');
    await expect(page.locator('#bottom-nav')).toBeHidden();
    const state = await page.evaluate(() => ({ hp: GameState.currentBattle.playerHp, gold: GameState.avatar.gold, x: Engine._rtEntities[0].x }));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
    expect(await page.evaluate(() => ({ hp: GameState.currentBattle.playerHp, gold: GameState.avatar.gold, x: Engine._rtEntities[0].x }))).toEqual(state);
    await page.screenshot({ path: info.outputPath('turn-phone.png') });

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole('heading', { name: 'Batalla en pausa' })).toBeVisible();
    await page.locator('#battle-resume').click();
    await expect.poll(() => page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
    await expect(page.locator('#battle-gameplay')).not.toHaveAttribute('inert', '');
    await page.screenshot({ path: info.outputPath('battle-landscape.png') });
    const start = await page.evaluate(() => Engine._rtEntities[0].x);
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].x)).toBeGreaterThan(start + 10);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Gira tu celular' })).toBeVisible();
    expect(await page.evaluate(() => Object.values(Engine._rtInputs).some(Boolean))).toBe(false);
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
    await page.keyboard.up('ArrowRight');
    await page.getByRole('button', { name: 'VOLVER AL INICIO', exact: true }).click();
    await expect(page.locator('#bottom-nav')).toBeVisible();
    expect(await page.evaluate(() => document.body.classList.contains('battle-immersive'))).toBe(false);
    await page.locator('.nav-item[data-view="arena"]').click();
    await expect(page.getByRole('heading', { name: 'Gira tu celular' })).toBeVisible();
    expect(await page.evaluate(() => GameState.currentBattle.playerHp)).toBe(state.hp);
    expect(await page.evaluate(() => GameState.avatar.gold)).toBe(state.gold);
    expect(errors).toEqual([]);
});

test('landscape fits small phones, multitouch releases, pause keeps focus, and retreat restores navigation', async ({ page }, info) => {
    await boot(page, { width: 568, height: 320 });
    await expect.poll(() => page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
    for (const size of [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        await expect.poll(() => page.evaluate(() => document.getElementById('app-content').style.getPropertyValue('--battle-width'))).toBe(`${size.width}px`);
        await expect.poll(() => page.evaluate(() => document.getElementById('app-content').style.getPropertyValue('--battle-height'))).toBe(`${size.height}px`);
        await expect.poll(() => page.evaluate(() => Math.abs(Engine._combat.height - document.getElementById('real-time-arena').clientHeight))).toBeLessThan(1);
        const layout = await page.evaluate(() => {
            const rects = [...document.querySelectorAll('.rt-btn, .battle-tool:not([hidden]), .hud-bar-container')].map(el => {
                const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
            });
            return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, rects };
        });
        expect(layout.scrollWidth).toBeLessThanOrEqual(size.width);
        for (const rect of layout.rects) {
            expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(size.width);
            expect(rect.top).toBeGreaterThanOrEqual(0); expect(rect.bottom).toBeLessThanOrEqual(size.height);
        }
    }
    const left = await page.locator('[data-action="left"]').boundingBox();
    const hit = await page.locator('[data-action="attack"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
        { id: 1, x: left.x + left.width / 2, y: left.y + left.height / 2 },
        { id: 2, x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 }
    ] });
    await expect.poll(() => page.evaluate(() => Engine._rtInputs.left && Engine._rtInputs.attack)).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => Engine._rtInputs.left || Engine._rtInputs.attack)).toBe(false);
    await cdp.detach();
    await page.locator('#battle-pause-button').click();
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'VOLVER AL INICIO', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#battle-resume')).toBeFocused();
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
    await page.locator('#battle-resume').click();
    await page.screenshot({ path: info.outputPath('controls-landscape.png') });
    await page.locator('#btn-flee-battle').click();
    await expect(page.locator('.battle-result')).toBeVisible();
    await expect(page.locator('#bottom-nav')).toBeVisible();
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
});

test('fullscreen failure leaves a usable fight and English rotation text', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
        Element.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
    });
    await boot(page, { width: 844, height: 390 });
    await page.locator('#battle-fullscreen').click();
    await expect(page.locator('#battle-screen-hint')).toContainText('sin pantalla completa');
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
    await page.evaluate(() => { I18N.current = 'en'; App.navigate('arena'); });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Turn your phone' })).toBeVisible();
    await page.getByRole('button', { name: 'BACK TO HOME', exact: true }).click();
    await expect(page.locator('#bottom-nav')).toBeVisible();
});

test('fullscreen cleanup and sign-out do not keep combat UI or locks active', async ({ page }) => {
    await page.addInitScript(() => {
        let fullscreen = null;
        window.lockCalls = []; window.unlockCalls = 0;
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
        Element.prototype.requestFullscreen = async function () { fullscreen = this; document.dispatchEvent(new Event('fullscreenchange')); };
        document.exitFullscreen = async () => { fullscreen = null; document.dispatchEvent(new Event('fullscreenchange')); };
        screen.orientation.lock = async value => { lockCalls.push(value); };
        screen.orientation.unlock = () => { unlockCalls++; };
    });
    await boot(page, { width: 844, height: 390 });
    await page.locator('#battle-fullscreen').click();
    await expect.poll(() => page.evaluate(() => lockCalls)).toEqual(['landscape']);
    await page.evaluate(() => { App.clearAccountView(); GameState.user = null; App.showAuth('login'); });
    await expect(page.locator('#auth-form')).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    expect(await page.evaluate(() => unlockCalls)).toBe(1);
    expect(await page.evaluate(() => document.body.classList.contains('battle-immersive'))).toBe(false);
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
});

test('unfinished PvP cannot substitute a bot with another player name', async ({ page }) => {
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.goto('/'); await expect(page.locator('#auth-form')).toBeVisible();
    await page.evaluate(async () => { window.channels = 0; supabase.channel = () => { channels++; }; await App.startPvP(); });
    expect(await page.evaluate(() => channels)).toBe(0);
    expect(await page.evaluate(() => GameState.currentBattle)).toBeNull();
    await expect(page.locator('.toast')).toContainText('todavía están en desarrollo');
});

test('denied orientation lock and a late fullscreen response cannot trap navigation', async ({ page }) => {
    await page.addInitScript(() => {
        let fullscreen = null;
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
        Element.prototype.requestFullscreen = function () {
            const enter = () => { fullscreen = this; document.dispatchEvent(new Event('fullscreenchange')); };
            if (!window.deferFullscreen) { enter(); return Promise.resolve(); }
            return new Promise(resolve => { window.finishFullscreen = () => { enter(); resolve(); }; });
        };
        document.exitFullscreen = async () => { fullscreen = null; document.dispatchEvent(new Event('fullscreenchange')); };
        screen.orientation.lock = async () => { throw Error('Orientation unsupported'); };
    });
    await boot(page, { width: 844, height: 390 });
    await page.locator('#battle-fullscreen').click();
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
    await page.locator('.battle-toolbar button').first().click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.locator('.nav-item[data-view="arena"]').click();
    await page.evaluate(() => { window.deferFullscreen = true; });
    await page.locator('#battle-fullscreen').click();
    await page.locator('.battle-toolbar button').first().click();
    await page.evaluate(() => window.finishFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(page.locator('#bottom-nav')).toBeVisible();
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
});
