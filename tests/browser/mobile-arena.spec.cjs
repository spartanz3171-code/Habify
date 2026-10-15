const { test, expect } = require('@playwright/test');
test.use({ hasTouch: true });

async function boot(page, viewport = { width: 390, height: 720 }, liveEnemy = false) {
    await page.setViewportSize(viewport);
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#auth-form')).toBeVisible();
    await page.evaluate(liveEnemy => {
        GameState.user = { id: 'mobile-test' }; GameState.avatarId = 'mobile-test';
        GameState.inventory = [{ id: 'spell_fire', name: 'Bola de Fuego', icon: '🔥', type: 'spell' }, { id: 'spell_heal', name: 'Curación Menor', icon: '♥', type: 'spell' }];
        Object.assign(GameState.avatar, { name: 'Diegox', avatarClass: 'mage', level: 5, hp: 90, maxHp: 100, isDead: false, equippedSpell: 'spell_fire,spell_heal', equippedBackground: 'bg_japan' });
        saveAvatarToDB = async () => {}; addBattleLogToDB = async () => {};
        if (!liveEnemy) Engine._controlEnemy = () => {};
        App.initInput(); App.showMainApp(); App.navigate('arena');
    }, liveEnemy);
}

for (const standalone of [false, true]) test(`active combat keeps HUD and controls anchored after touch drags and viewport panning (${standalone ? 'PWA' : 'browser'})`, async ({ page }, info) => {
    // Three viewport changes plus real combat frames take longer in WebKit on Windows.
    test.setTimeout(60000);
    await page.addInitScript(standalone => Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true }), standalone);
    await boot(page, { width: 390, height: 720 }, true);
    await page.locator('#battle-btn').click();
    await page.locator('#battle-rotate-fallback').click();
    for (const viewport of [{ width: 390, height: 650 }, { width: 720, height: 340 }, { width: 568, height: 240 }]) {
        await page.setViewportSize(viewport);
        await expectFits(page);
        const rects = () => page.evaluate(() => ['.battle-toolbar', '.battle-hud', '.rt-controls'].map(selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        }));
        const before = await rects();
        const gesture = await page.evaluate(() => {
            Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 48 });
            Object.defineProperty(visualViewport, 'offsetLeft', { configurable: true, value: 12 });
            visualViewport.dispatchEvent(new Event('scroll'));
            visualViewport.dispatchEvent(new Event('resize'));
            window.scrollTo(0, 90);
            const drag = new Event('touchmove', { bubbles: true, cancelable: true });
            document.querySelector('[data-action="attack"]').dispatchEvent(drag);
            const [player, enemy] = Engine._rtEntities;
            enemy.x = player.x + 60;
            // Begin at a real opening so an enemy interruption does not hide the impact.
            player.hitStunTimer = 0; player.attack = null;
            enemy.attack = null; enemy.aiTimer = 1.5; enemy.aiRetreat = 0;
            Engine.handleInput('heavy', true); Engine.handleInput('heavy', false);
            return { canceled: drag.defaultPrevented };
        });
        expect(gesture.canceled).toBe(true);
        await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].attack?.phase), { intervals: [16] }).toBe('recovery');
        expect(await rects()).toEqual(before);
        await expectFits(page);
        await expect.poll(() => page.evaluate(() => !!Engine._rtEntities[0].attack), { intervals: [16] }).toBe(false);
        await page.evaluate(() => { Engine.handleInput('up', true); Engine.handleInput('up', false); });
        await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].grounded), { intervals: [16] }).toBe(false);
        expect(await rects()).toEqual(before);
        await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].grounded)).toBe(true);
        expect(await page.evaluate(() => scrollY)).toBe(0);
    }
    await page.screenshot({ path: info.outputPath('stable-active-combat.png') });
    await page.locator('.battle-toolbar button').first().click();
    await expect(page.locator('html')).not.toHaveClass(/battle-immersive/);
    await expect(page.locator('body')).not.toHaveClass(/battle-immersive/);
    await page.evaluate(() => window.scrollTo(0, 150));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

async function expectFits(page) {
    await expect(async () => {
        const layout = await page.evaluate(() => ({
            width: visualViewport.width, height: visualViewport.height,
            rootWidth: parseFloat(document.getElementById('app-content').style.getPropertyValue('--battle-width')),
            rootHeight: parseFloat(document.getElementById('app-content').style.getPropertyValue('--battle-height')),
            boxes: [...document.querySelectorAll('.rt-btn, .battle-tool:not([hidden]), .hud-bar-container')].map(el => {
                const r = el.getBoundingClientRect();
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, button: el.tagName === 'BUTTON' };
            })
        }));
        expect(layout.rootWidth).toBeCloseTo(layout.width, 0);
        expect(layout.rootHeight).toBeCloseTo(layout.height, 0);
        for (const r of layout.boxes) {
            expect(r.left).toBeGreaterThanOrEqual(-1); expect(r.top).toBeGreaterThanOrEqual(-1);
            expect(r.right).toBeLessThanOrEqual(layout.width + 1); expect(r.bottom).toBeLessThanOrEqual(layout.height + 1);
            if (r.button) expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
        }
    }).toPass({ timeout: 3000 });
}

test('arena preview refreshes after leveling up and preserves an already started opponent', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { GameState.avatar.level = 30; App.navigate('arena'); });
    const level = await page.evaluate(() => GameState._currentOpponent.level);
    expect(level).toBeGreaterThanOrEqual(30);
    expect(level).toBeLessThanOrEqual(32);
    await expect(page.locator('.arena-fighter.enemy .character-art')).toHaveClass(/monster-rank-3/);
    await page.locator('#battle-btn').click();
    await page.locator('#battle-rotate-fallback').click();
    await expect(page.locator('#real-time-arena .character-monster')).toHaveClass(/monster-rank-3/);
    await page.locator('.battle-toolbar button').first().click();
    await page.evaluate(() => { GameState.avatar.level = 35; App.navigate('arena'); });
    expect(await page.evaluate(() => GameState.currentBattle.opponent.level)).toBe(level);
});

test('Safari fallback rotates a playable arena, handles browser resizing, and restores the page on victory', async ({ page }, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
        if (screen.orientation) screen.orientation.lock = async () => { throw Error('Not supported'); };
    });
    await boot(page);
    await page.locator('#battle-btn').click();
    await expect(page.locator('#battle-rotate-fallback')).toBeVisible();
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
    await page.locator('#battle-rotate-fallback').tap();
    await expect(page.locator('body')).toHaveClass(/battle-rotated/);
    await expect.poll(() => page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
    await expectFits(page);
    const pos = await page.evaluate(() => Engine._rtEntities[0].x);
    const right = await page.locator('[data-action="right"]').boundingBox();
    await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2);
    await page.mouse.down();
    await expect(page.locator('[data-action="right"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => Engine._rtEntities[0].x)).toBeGreaterThan(pos + 5);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => Engine._rtInputs.right)).toBe(false);
    // Address bars reduce available space without rotating the device.
    for (const size of [{ width: 390, height: 610 }, { width: 320, height: 460 }, { width: 390, height: 720 }]) {
        await page.setViewportSize(size); await expectFits(page);
    }
    await page.locator('#battle-pause-button').tap();
    await expect(page.locator('#battle-resume')).toBeVisible();
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(false);
    await page.locator('#battle-resume').tap();
    await page.screenshot({ path: info.outputPath('safari-rotated-arena.png') });
    await page.evaluate(() => {
        saveAvatarToDB = () => new Promise(resolve => { window.finishSaving = resolve; });
        void Engine._endBattle(true);
    });
    await expect(page.locator('body')).not.toHaveClass(/battle-(rotated|immersive)/);
    expect(await page.locator('#app-content').evaluate(el => getComputedStyle(el).transform)).toBe('none');
    await expect(page.locator('#bottom-nav')).toBeVisible();
    await page.evaluate(() => window.finishSaving());
    await expect(page.locator('.battle-result-title')).toHaveText('¡VICTORIA!');
    await expect(page.locator('#battle-portrait-hint')).toBeHidden();
    expect(errors).toEqual([]);
});

test('physical rotation replaces the fallback and defeat restores navigation without supported orientation APIs', async ({ page }, info) => {
    await boot(page);
    await page.locator('#battle-btn').click();
    await page.locator('#battle-rotate-fallback').click();
    await page.setViewportSize({ width: 720, height: 340 });
    await expect(page.locator('body')).not.toHaveClass(/battle-rotated/);
    await expectFits(page);
    await page.screenshot({ path: info.outputPath('battle-controls.png') });
    await page.evaluate(async () => { await Engine._endBattle(false); });
    await expect(page.locator('.battle-result-title')).toHaveText('DERROTA');
    await expect(page.locator('#bottom-nav')).toBeVisible();
    await expect(page.locator('#battle-portrait-hint')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 720 });
    await expect(page.locator('#battle-portrait-hint')).toBeHidden();
});

test('back, retreat and logout clear the rotated stage and held controls', async ({ page }) => {
    await boot(page);
    await page.locator('#battle-btn').click();
    await page.locator('#battle-rotate-fallback').click();
    await page.locator('.battle-toolbar button').first().click();
    await expect(page.locator('body')).not.toHaveClass(/battle-(rotated|immersive)/);
    await page.locator('.nav-item[data-view="arena"]').click();
    await expect(page.locator('#battle-rotate-fallback')).toBeVisible();
    await page.locator('#battle-rotate-fallback').click();
    await page.locator('#btn-flee-battle').click();
    await expect(page.locator('.battle-result-title')).toHaveText('RETIRADA');
    await expect(page.locator('body')).not.toHaveClass(/battle-(rotated|immersive)/);
    await page.locator('#battle-btn').click();
    await page.locator('#battle-rotate-fallback').click();
    await page.evaluate(() => { App.clearAccountView(); GameState.user = null; App.showAuth('login'); });
    await expect(page.locator('#auth-form')).toBeVisible();
    expect(await page.evaluate(() => Engine._gameLoopRunning || Object.values(Engine._rtInputs).some(Boolean))).toBe(false);
    await expect(page.locator('body')).not.toHaveClass(/battle-(rotated|immersive)/);
});

test('native portrait restoration is requested once and a late response does not lock the next battle', async ({ page }) => {
    await boot(page, { width: 844, height: 390 });
    await page.evaluate(() => {
        window.locks = []; window.unlocks = 0;
        screen.orientation.lock = value => { locks.push(value); return new Promise(resolve => { window.resolveLock = resolve; }); };
        screen.orientation.unlock = () => { unlocks++; };
    });
    await page.locator('#battle-btn').click();
    await page.locator('.battle-toolbar button').first().click();
    await expect.poll(() => page.evaluate(() => locks)).toEqual(['portrait']);
    await page.evaluate(() => BattleScreen.sync());
    expect(await page.evaluate(() => locks)).toEqual(['portrait']);
    await page.locator('.nav-item[data-view="arena"]').click();
    await page.evaluate(() => resolveLock());
    await expect.poll(() => page.evaluate(() => unlocks)).toBe(1);
    expect(await page.evaluate(() => BattleScreen.portraitLocked)).toBe(false);
    expect(await page.evaluate(() => Engine._gameLoopRunning)).toBe(true);
});

test('all dashboard backgrounds contain the hero and pet above a shared floor', async ({ page }, info) => {
    await boot(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 390, 700, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const background of ['', 'bg_japan', 'bg_forest', 'bg_space', 'bg_tokyo', 'bg_paris']) {
            await page.evaluate(background => {
                Object.assign(GameState.avatar, { equippedBackground: background, equippedPet: 'pet_cat' });
                App.navigate('dashboard');
            }, background);
            const bounds = await page.evaluate(() => {
                const scene = document.querySelector('.hero-profile-art');
                const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
                return { scene: rect(scene), hero: rect(scene.querySelector('.character-art')), pet: rect(scene.querySelector('.companion-sprite')), floor: rect(scene.querySelector('.hero-plinth')), info: rect(document.querySelector('.hero-profile-info')), background: getComputedStyle(scene).backgroundImage, cardBackground: getComputedStyle(document.querySelector('.avatar-section')).backgroundImage };
            });
            expect(bounds.hero.top).toBeGreaterThanOrEqual(bounds.scene.top);
            expect(bounds.hero.bottom).toBeLessThanOrEqual(bounds.scene.bottom);
            expect(bounds.hero.left).toBeGreaterThanOrEqual(bounds.scene.left);
            expect(bounds.hero.right).toBeLessThanOrEqual(bounds.scene.right);
            expect(bounds.hero.bottom).toBeGreaterThan(bounds.floor.top);
            expect(bounds.hero.bottom).toBeLessThan(bounds.floor.bottom);
            expect(bounds.pet.bottom).toBeCloseTo(bounds.hero.bottom, 0);
            expect(bounds.pet.left).toBeGreaterThanOrEqual(bounds.scene.left);
            expect(bounds.pet.right).toBeLessThanOrEqual(bounds.scene.right);
            expect(bounds.pet.top).toBeGreaterThanOrEqual(bounds.scene.top);
            if (width <= 560) expect(bounds.scene.bottom).toBeLessThanOrEqual(bounds.info.top + 1);
            if (background) {
                expect(bounds.cardBackground).toContain(background + '.png');
                expect(bounds.background).toBe('none');
                const panel = await page.locator('.hero-profile-info').evaluate(el => getComputedStyle(el).backgroundColor);
                expect(panel).toBe('rgba(17, 18, 39, 0.72)');
            } else expect(bounds.cardBackground).not.toContain('bg_');
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { GameState.avatar.equippedBackground = 'bg_japan'; App.navigate('dashboard'); });
    await page.screenshot({ path: info.outputPath('dashboard-japan.png'), fullPage: true });
});
