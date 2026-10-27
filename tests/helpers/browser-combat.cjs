const { randomUUID } = require('node:crypto');
const { createHandler } = require('../../api/combat.js');

async function mockCombat(page) {
    await page.unroute('**/api/combat');
    await page.evaluate(() => {
        window.combatMock = { won: false, failures: 0 };
        supabase.auth = { ...supabase.auth,
            getSession: async () => ({ data: { session: { user: GameState.user, access_token: 'browser-test-token' } } }) };
    });
    const receipts = new Map();
    await page.route('**/api/combat', async route => {
        const body = route.request().postDataJSON();
        if (body.action === 'start') {
            const match = await page.evaluate(() => ({ avatar: { ...GameState.avatar }, inventory: [...GameState.inventory],
                opponent: GameState._currentOpponent || Engine.generateOpponent() }));
            await route.fulfill({ json: { ...match, id: randomUUID(), engineVersion: 'browser-fixture' } });
            return;
        }
        const failed = await page.evaluate(() => combatMock.failures > 0 && !!combatMock.failures--);
        if (failed) { await route.fulfill({ status: 503, json: { error: 'Temporary test failure' } }); return; }
        if (!receipts.has(body.id)) {
            const receipt = await page.evaluate(fled => {
                const won = !fled && combatMock.won;
                const avatar = GameState.avatar;
                const opponent = GameState.currentBattle?.opponent || GameState.pendingCombatSettlement?.battle.opponent;
                const hpLost = won ? 0 : Math.min(Math.max(avatar.hp - 1, 0), fled ? 10 : 20);
                return { status: 'settled', won, fled, opponent: opponent.name,
                    xp: won ? opponent.xp : 0, gold: won ? opponent.goldRaw : 0, hp_lost: hpLost,
                    avatar: { gold: avatar.gold + (won ? opponent.goldRaw : 0), current_xp: avatar.currentXP + (won ? opponent.xp : 0),
                        hp: won ? Math.min(avatar.maxHp, avatar.hp + 5) : avatar.hp - hpLost, is_dead: false } };
            }, body.fled);
            receipts.set(body.id, { ...receipt, battle_id: body.id });
        }
        await route.fulfill({ json: receipts.get(body.id) });
    });
}

async function verifiedCombat(page, { dropFirstResponse = false } = {}) {
    await mockCombat(page);
    await page.unroute('**/api/combat');
    const account = await page.evaluate(() => ({ userId: GameState.user.id,
        avatar: { name: GameState.avatar.name, level: GameState.avatar.level, avatar_class: GameState.avatar.avatarClass,
            appearance: GameState.avatar.appearance, equipped_weapon: GameState.avatar.equippedWeapon,
            equipped_shield: GameState.avatar.equippedShield, equipped_spell: GameState.avatar.equippedSpell,
            hp: GameState.avatar.hp, max_hp: GameState.avatar.maxHp, gold: GameState.avatar.gold,
            current_xp: GameState.avatar.currentXP, is_dead: false }, inventory: GameState.inventory }));
    let battle;
    const handler = createHandler({
        env: { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'public-test', SUPABASE_SERVICE_ROLE_KEY: 'private-test' },
        fetcher: async (url, options) => {
            if (url.endsWith('/user')) return { ok: true, json: async () => ({ id: account.userId, email_confirmed_at: '2026-01-01' }) };
            const args = JSON.parse(options.body);
            let result;
            if (url.endsWith('/combat_open')) {
                battle = { id: randomUUID(), engine_version: args.p_engine_version, created_at: new Date().toISOString(),
                    snapshot: { avatar: account.avatar, inventory: account.inventory, monsters: [], opponent_sprite: args.p_opponent_sprite } };
                result = battle;
            } else if (url.endsWith('/combat_read')) result = args.p_id === battle.id ? battle : null;
            else if (url.endsWith('/combat_settle')) {
                if (!battle.result) {
                    const hpLost = args.p_won ? 0 : Math.min(account.avatar.hp - 1, args.p_fled ? 10 : 20);
                    account.avatar = { ...account.avatar, gold: account.avatar.gold + args.p_gold,
                        current_xp: account.avatar.current_xp + args.p_xp, hp: account.avatar.hp - hpLost };
                    battle.result = { status: 'settled', battle_id: battle.id, won: args.p_won, fled: args.p_fled,
                        xp: args.p_xp, gold: args.p_gold, hp_lost: hpLost, opponent: args.p_opponent };
                }
                result = { ...battle.result, avatar: account.avatar };
            } else throw new Error('Unexpected RPC');
            return { ok: true, json: async () => structuredClone(result) };
        }
    });
    await page.route('**/api/combat', async route => {
        const body = route.request().postDataJSON();
        const response = { setHeader() {}, end(value) { this.body = value; } };
        await handler({ method: 'POST', headers: route.request().headers(), body }, response);
        if (dropFirstResponse && body.action === 'finish' && response.statusCode === 200) {
            dropFirstResponse = false;
            await route.abort('failed');
        } else await route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
    });
}

module.exports = { mockCombat, verifiedCombat };