const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createMatch, verifyReplay, engineVersion } = require('../server/combat.cjs');
const { createHandler } = require('../api/combat.js');

function match() {
    return createMatch({ id: '00000000-0000-4000-8000-000000000001', engine_version: engineVersion,
        snapshot: { avatar: { level: 1, avatar_class: 'hero', hp: 100, max_hp: 100 }, inventory: [], monsters: [] } });
}

test('server generates the same opponent from its stored snapshot and match id', () => {
    assert.deepEqual(match(), match());
    assert.ok(match().opponent.hp > 0);
    assert.throws(() => createMatch({ engine_version: 'old' }), /version changed/);
    const row = { id: match().id, engine_version: engineVersion,
        snapshot: { avatar: { level: 1 }, inventory: [], opponent_sprite: 'orc' } };
    assert.equal(createMatch(row).opponent.sprite, 'orc');
    row.snapshot.avatar.level = 100;
    row.snapshot.monsters = [{ sprite: 'orc', name: 'Enemy', xp_reward: 999999, gold_reward: 999999 }];
    assert.equal(createMatch(row).opponent.xp, 5);
    assert.equal(createMatch(row).opponent.goldRaw, 3);
    row.snapshot.opponent_sprite = 'unknown';
    assert.throws(() => createMatch(row), /Unknown opponent/);
});

test('server loadouts discard equipment absent from the authoritative inventory', () => {
    const official = createMatch({ id: match().id, engine_version: engineVersion,
        snapshot: { avatar: { level: 1, equipped_weapon: 'wpn_staff', equipped_shield: 'wpn_shield',
            equipped_spell: 'spell_fire,spell_heal' }, inventory: [{ id: 'spell_heal', type: 'spell' }] } });
    assert.equal(official.avatar.equippedWeapon, null);
    assert.equal(official.avatar.equippedShield, null);
    assert.equal(official.avatar.equippedSpell, 'spell_heal');
});

test('server accepts a real victory but rejects a truncated replay and recalculates all rewards', () => {
    const official = createMatch({ id: match().id, engine_version: engineVersion,
        snapshot: { avatar: { level: 1, avatar_class: 'mage', equipped_weapon: 'wpn_staff' },
            inventory: [{ id: 'wpn_staff', type: 'weapon' }] } });
    const state = { avatar: official.avatar, inventory: official.inventory };
    const context = vm.createContext({ GameState: state, document: { getElementById: () => null }, cancelAnimationFrame() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8') + '\nglobalThis.engine=Engine;', context);
    const engine = context.engine;
    engine._effect = () => {};
    engine._advanceEffects = () => {};
    let won;
    engine._endBattle = result => { won = result; state.currentBattle.isFinished = true; };
    engine.startPvEBattle(official.opponent, official);
    engine.resizeCombatArena(640, 320);
    while (!state.currentBattle.isFinished && state.currentBattle.replay.frames < 10000) {
        if (state.currentBattle.replay.frames % 80 === 0) {
            engine.handleInput('attack', true);
            engine.handleInput('attack', false);
        }
        engine._stepCombat(1 / 120);
    }
    assert.equal(won, true);
    const replay = JSON.parse(JSON.stringify(state.currentBattle.replay));
    const result = verifyReplay(official, { ...replay, gold: 999999, xp: 999999 }, false, replay.frames / 120 + 1);
    assert.equal(result.won, true);
    assert.equal(result.gold, official.opponent.goldRaw);
    assert.equal(result.xp, official.opponent.xp);
    assert.throws(() => verifyReplay(official, { ...replay, frames: replay.frames - 1 }, false, replay.frames / 120 + 1), /not finished/);
});

test('an empty or forged victory cannot earn rewards; surrender is calculated by the server', () => {
    const replay = { version: 1, frames: 0, events: [], won: true, xp: 999999 };
    assert.throws(() => verifyReplay(match(), replay, false, 10), /not finished/);
    assert.deepEqual(verifyReplay(match(), replay, true, 10), { won: false, fled: true, xp: 0, gold: 0, hpLost: 10 });
    for (const events of [[{ frame: 0, kind: 'input', action: '__proto__', pressed: true }],
        [{ frame: 0, kind: 'resize', width: 0, height: 320 }], [{ frame: -1, kind: 'reset' }]]) {
        assert.throws(() => verifyReplay(match(), { ...replay, events }, true, 10), /Invalid/);
    }
    assert.throws(() => verifyReplay(match(), { ...replay, frames: 72001 }, true, 1000), /Invalid/);
    assert.throws(() => verifyReplay(match(), { ...replay, frames: 1200 }, true, 1), /Invalid/);
});

test('the server reproduces a real client defeat and rejects changing it to surrender', () => {
    const official = match();
    const state = { avatar: official.avatar, inventory: official.inventory };
    const context = vm.createContext({ GameState: state, document: { getElementById: () => null }, cancelAnimationFrame() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8') + '\nglobalThis.engine=Engine;', context);
    const engine = context.engine;
    engine._effect = () => {};
    engine._advanceEffects = () => {};
    engine._endBattle = () => { state.currentBattle.isFinished = true; };
    engine.startPvEBattle(official.opponent, official);
    engine.resizeCombatArena(390, 280);
    while (!state.currentBattle.isFinished && state.currentBattle.replay.frames < 72000) engine._stepCombat(1 / 120);
    const replay = JSON.parse(JSON.stringify(state.currentBattle.replay));
    const result = verifyReplay(official, replay, false, replay.frames / 120 + 1);
    assert.deepEqual(result, { won: false, fled: false, xp: 0, gold: 0, hpLost: 20 });
    assert.throws(() => verifyReplay(official, replay, true, replay.frames / 120 + 1), /after knockout/);
});

test('HTTP combat rejects unauthenticated, cross-account and forged reward requests without settling', async () => {
    const calls = [];
    const row = { id: match().id, engine_version: engineVersion, created_at: new Date().toISOString(),
        snapshot: { avatar: { level: 1 }, inventory: [], monsters: [] } };
    const handler = createHandler({ env: { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'public-test', SUPABASE_SERVICE_ROLE_KEY: 'private-test' },
        fetcher: async (url, options) => {
            if (url.endsWith('/user')) return { ok: true, json: async () => ({ id: 'authenticated-user', email_confirmed_at: '2026-01-01' }) };
            calls.push({ url, args: JSON.parse(options.body) });
            return { ok: true, json: async () => calls.at(-1).args.p_id === row.id ? row : null };
        }
    });
    const request = async (body, authorization = 'Bearer test-token') => {
        const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
        await handler({ method: 'POST', headers: { authorization }, body }, response);
        return response;
    };
    assert.equal((await request({ action: 'start' }, '')).statusCode, 401);
    assert.equal((await request({ action: 'finish', id: '00000000-0000-4000-8000-000000000002' })).statusCode, 404);
    const forged = await request({ action: 'finish', id: row.id, engineVersion, fled: false,
        replay: { version: 1, frames: 0, events: [] }, won: true, xp: 99999, user: 'victim' });
    assert.equal(forged.statusCode, 422);
    assert.equal(calls.some(call => call.url.endsWith('/combat_settle')), false);
    assert.ok(calls.every(call => call.args.p_user === 'authenticated-user'));
    assert.equal(JSON.stringify(forged).includes('private-test'), false);
});