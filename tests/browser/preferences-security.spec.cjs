const { test, expect } = require('@playwright/test');
async function boot(page, id = 'prefs-user') {
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.goto('/');
    await expect(page.locator('#auth-form')).toBeVisible();
    await page.evaluate(id => {
        window.preferenceWrites = []; window.adminReads = 0; window.allowAdmin = false;
        supabase = { auth: { updateUser: async value => { preferenceWrites.push(value); return { data: {}, error: null }; } },
            rpc: async () => ({ data: allowAdmin }), from: () => { adminReads++; throw Error('No private data for this test'); } };
        GameState.user = { id, email: 'admin@example.org', user_metadata: { is_admin: true } };
        GameState.avatarId = 'prefs-avatar'; GameState.habits = [];
        HabitProgress.ready = true; HabitProgress.rulesReady = true;
        App.showMainApp(); App.navigate('habits');
    }, id);
}
test('habit tips can be dismissed once per account and restored sessions stay dismissed', async ({ page }, info) => {
    await boot(page);
    await expect(page.locator('.habit-quick-guide')).toContainText('Un paso pequeño cada día');
    await page.locator('.habit-quick-guide').screenshot({ path: info.outputPath('dismissable-tips.png') });
    await page.getByRole('button', { name: 'Cerrar consejos de hábitos', exact: true }).click();
    await expect(page.locator('.habit-quick-guide')).toHaveCount(0);
    expect(await page.evaluate(() => preferenceWrites)).toEqual([{ data: { habify_habit_guide_dismissed: true } }]);
    await boot(page);
    await expect(page.locator('.habit-quick-guide')).toHaveCount(0);
    await boot(page, 'other-user');
    await expect(page.locator('.habit-quick-guide')).toBeVisible();
    await page.evaluate(() => {
        localStorage.clear(); HabitProgress.dismissedGuides.clear();
        GameState.user.user_metadata = { habify_habit_guide_dismissed: true };
        App.navigate('habits');
    });
    await expect(page.locator('.habit-quick-guide')).toHaveCount(0);
});

test('administrator bypasses are gone and server denial wins over local role changes', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof App.enterAdminDevMode)).toBe('undefined');
    expect(await page.evaluate(() => typeof App.handleAdminLogin)).toBe('undefined');
    await page.evaluate(async () => { GameState.isAdmin = true; await App.openAdminPanel(); });
    await expect(page.locator('#admin-dashboard-modal')).toHaveCount(0);
    expect(await page.evaluate(() => GameState.isAdmin)).toBe(false);
    expect(await page.evaluate(() => adminReads)).toBe(0);
    await page.evaluate(() => App.showAuth('login'));
    await expect(page.locator('#admin-login-user')).toHaveCount(0);
    await expect(page.getByText('ACCESO ADMINISTRATIVO / DEV')).toHaveCount(0);
});

test('admin names are text and a failed load shows no fabricated account data', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
        GameState.isAdmin = true; GameState.adminTab = 'users';
        GameState.adminUsersList = [{ id: "x');window.injected=true;//", name: '<img src=x onerror="window.injected=true">', avatar_class: 'hero', level: 1, hp: 100, max_hp: 100, gold: 10 }];
        document.getElementById('modal-root').innerHTML = Views.renderAdminDashboard();
    });
    await expect(page.locator('#admin-dashboard-modal tbody img')).toHaveCount(0);
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
    await page.evaluate(async () => { allowAdmin = true; await App.openAdminPanel(); });
    await expect(page.locator('#admin-dashboard-modal')).toHaveCount(0);
    expect(await page.evaluate(() => GameState.adminUsersList)).toEqual([]);
});

test('sound and vibration are opt-in, work on interaction and keep device preferences', async ({ page }, info) => {
    await page.addInitScript(() => {
        window.vibrations = [];
        window.audioNotes = 0;
        const original = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () {
            const oscillator = original.call(this), start = oscillator.start.bind(oscillator);
            oscillator.start = (...args) => { audioNotes++; return start(...args); };
            return oscillator;
        };
        Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { vibrations.push(pattern); return true; } });
    });
    await boot(page);
    await page.evaluate(() => Feedback.play('success'));
    expect(await page.evaluate(() => vibrations)).toEqual([]);
    await page.getByRole('button', { name: 'Sonido y vibración / Sound and vibration', exact: true }).click();
    await expect(page.locator('#feedback-sound')).not.toBeChecked();
    await expect(page.locator('#feedback-vibration')).not.toBeChecked();
    await page.locator('#feedback-sound').check();
    await page.locator('#feedback-vibration').check();
    await page.getByRole('button', { name: 'PROBAR', exact: true }).click();
    expect(await page.evaluate(() => vibrations.some(v => v === 25))).toBe(true);
    await expect.poll(() => page.evaluate(() => audioNotes)).toBeGreaterThan(0);
    await page.getByRole('dialog').screenshot({ path: info.outputPath('sound-settings.png') });
    await page.getByRole('button', { name: 'CERRAR', exact: true }).click();
    await boot(page);
    await page.getByRole('button', { name: 'Sonido y vibración / Sound and vibration', exact: true }).click();
    await expect(page.locator('#feedback-sound')).toBeChecked();
    await expect(page.locator('#feedback-vibration')).toBeChecked();
    await page.locator('#feedback-sound').uncheck();
    await page.locator('#feedback-vibration').uncheck();
    await page.evaluate(() => { vibrations.length = 0; Feedback.play('success'); });
    expect(await page.evaluate(() => vibrations)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('unsupported vibration is explained without blocking settings or gameplay', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined }));
    await boot(page);
    await page.getByRole('button', { name: 'Sonido y vibración / Sound and vibration', exact: true }).click();
    await expect(page.locator('#feedback-vibration')).toBeDisabled();
    await expect(page.getByRole('dialog')).toContainText('Este navegador no ofrece vibración');
    await page.getByRole('button', { name: 'PROBAR', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('installable manifest icons match their declared square sizes', async ({ page }) => {
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.goto('/');
    const icons = await page.evaluate(async () => {
        const manifest = await (await fetch('manifest.json')).json();
        return Promise.all(manifest.icons.map(async icon => {
            const image = new Image(); image.src = icon.src; await image.decode();
            return { declared: icon.sizes, actual: `${image.naturalWidth}x${image.naturalHeight}` };
        }));
    });
    expect(icons).toEqual([{ declared: '192x192', actual: '192x192' }, { declared: '512x512', actual: '512x512' }]);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
