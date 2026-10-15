const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8');

function setup() {
    const callbacks = new Map();
    let frame = 0;
    const state = {
        avatar: { level: 1, hp: 80, maxHp: 100, currentXP: 0, xpToLevel: 1000, gold: 0 },
        inventory: [{ id: 'spell_fire', type: 'spell' }, { id: 'spell_heal', type: 'spell' }],
        battleLog: [], currentBattle: null
    };
    const context = vm.createContext({
        GameState: state,
        document: { getElementById: () => null },
        performance: { now: () => 0 },
        requestAnimationFrame: callback => { callbacks.set(++frame, callback); return frame; },
        cancelAnimationFrame: id => callbacks.delete(id),
        setTimeout, clearTimeout,
        saveAvatarToDB: async () => {}, addBattleLogToDB: async () => {},
        console
    });
    vm.runInContext(source + '\nglobalThis.engine = Engine;', context);
    const engine = context.engine;
    engine.startPvEBattle({ hp: 400, maxHp: 400, attack: 16, xp: 20, goldRaw: 10, sprite: 'goblin', name: 'Goblin' });
    const [player, enemy] = engine._rtEntities;
    enemy.aiDisabled = true;
    function advance(seconds, fps = 120) {
        const frames = Math.round(seconds * fps);
        for (let i = 0; i < frames; i++) engine._updateRT(1 / fps);
    }
    function press(action) { engine.handleInput(action, true); engine.handleInput(action, false); }
    return { engine, state, player, enemy, advance, press, context, callbacks };
}

test('catalog and fallback rivals keep up with hero level and become harder relative to hero growth', () => {
    const { engine, state, context } = setup();
    vm.runInContext('Math.random = () => 0', context);
    for (const catalog of [false, true]) {
        for (const sprite of ['goblin', 'skeleton', 'slime', 'orc', 'ghost']) {
            state.monsters = catalog ? [{ sprite, name: sprite, base_level: 5, base_hp: 180, base_attack: 24, xp_reward: 30, gold_reward: 20 }] : undefined;
            let previous = null;
            for (const level of [1, 5, 15, 30, 60, 100]) {
                state.avatar.level = level;
                const pick = ['goblin', 'skeleton', 'slime', 'orc', 'ghost'].indexOf(sprite) / 5 + .01;
                vm.runInContext(`globalThis.randomPick = ${pick}; Math.random = () => { const pick = globalThis.randomPick; globalThis.randomPick = 0; return pick; };`, context);
                const rival = engine.generateOpponent();
                assert.equal(rival.sprite, sprite);
                assert.equal(rival.level, level);
                assert.equal(rival.maxHp, rival.hp);
                const hits = rival.hp / (5 + 2 * level);
                const danger = rival.attack / (100 + 10 * level);
                if (previous) {
                    assert.ok(hits > previous.hits, 'more levels should require more hits even with growing hero damage');
                    assert.ok(danger > previous.danger, 'each hit should remain threatening as hero HP grows');
                    assert.ok(rival.difficulty.moveSpeed > previous.speed);
                    assert.ok(rival.difficulty.attackInterval < previous.interval);
                }
                assert.ok(rival.difficulty.lightWindup >= .27, 'every strike must retain a readable warning');
                assert.ok(rival.difficulty.heavyWindup >= .4);
                assert.ok(rival.xp > 0 && rival.goldRaw > 0);
                previous = { hits, danger, speed: rival.difficulty.moveSpeed, interval: rival.difficulty.attackInterval };
            }
        }
    }
});

test('random level bonuses stay close to the hero, including the catalog path', () => {
    const { engine, state, context } = setup();
    for (const random of [0, .45, .999999]) {
        vm.runInContext(`Math.random = () => ${random}`, context);
        for (const level of [1, 5, 10, 30]) {
            state.avatar.level = level;
            const rival = engine.generateOpponent();
            assert.ok(rival.level >= level && rival.level <= level + (level >= 10 ? 2 : 1));
            assert.ok(Number.isFinite(rival.hp) && Number.isFinite(rival.attack));
        }
    }
});

test('a high-level enemy closes distance faster but still telegraphs and can be blocked', () => {
    const novice = setup(), veteran = setup();
    for (const [scene, level] of [[novice, 1], [veteran, 30]]) {
        scene.enemy.aiDisabled = false;
        scene.enemy.difficulty = scene.engine.combatDifficulty(level, 'goblin');
        scene.advance(.6);
    }
    assert.ok(veteran.enemy.x < novice.enemy.x - 12);
    for (const scene of [novice, veteran]) {
        scene.enemy.x = scene.player.x + 60;
        scene.enemy.aiTimer = 0;
        scene.engine.handleInput('guard', true);
        scene.advance(.02);
        assert.equal(scene.enemy.attack.phase, 'startup');
        scene.advance(.2);
        assert.equal(scene.state.currentBattle.playerHp, 110, 'the warning cannot damage the player');
        scene.advance(.2);
        assert.equal(scene.state.currentBattle.playerHp, 106, 'correctly held guard should still absorb most damage');
    }
    assert.ok(veteran.enemy.attack.startup < novice.enemy.attack.startup);
});

test('movement accelerates, brakes and gives the same result at 30 and 120 fps', () => {
    const slow = setup(), fast = setup();
    for (const scene of [slow, fast]) scene.engine.handleInput('right', true);
    slow.advance(0.5, 30);
    fast.advance(0.5, 120);
    assert.ok(Math.abs(slow.player.x - fast.player.x) < 0.001);
    assert.ok(fast.player.x > 235 && fast.player.x < 260);
    fast.engine.handleInput('right', false);
    fast.advance(0.2);
    assert.equal(fast.player.vx, 0);
});

test('jump follows gravity, crosses above bodies and lands exactly on the floor', () => {
    const { engine, player, enemy, advance, press } = setup();
    enemy.x = player.x + 83;
    engine.handleInput('right', true);
    press('up');
    advance(0.5);
    assert.ok(player.y < engine._combat.floor - 90);
    assert.ok(player.x > enemy.x, 'jump should pass the rival instead of hitting an invisible wall');
    advance(0.3);
    assert.equal(player.y, engine._combat.floor);
    assert.equal(player.vy, 0);
    assert.equal(player.grounded, true);
});

test('grounded bodies cannot overlap or push a fighter beyond a narrow stage', () => {
    const { engine, player, enemy, advance } = setup();
    engine._combat.width = 300;
    player.x = 225;
    enemy.x = 270;
    engine.handleInput('right', true);
    advance(1);
    assert.ok(enemy.x <= 273);
    assert.ok(player.x >= 27);
    assert.ok(enemy.x - player.x >= 44 - 0.001);
});

test('heavy hits during its active phase only once and preserves knockback during stun', () => {
    const { state, player, enemy, advance, press } = setup();
    enemy.x = player.x + 60;
    press('heavy');
    advance(0.2);
    assert.equal(state.currentBattle.oppHp, 400, 'startup must not deal damage');
    advance(0.08);
    const damagedHp = state.currentBattle.oppHp;
    assert.ok(damagedHp < 400);
    const hitX = enemy.x;
    advance(0.15);
    assert.ok(enemy.x > hitX + 15, 'hit-stop ends and knockback continues while stunned');
    assert.equal(state.currentBattle.oppHp, damagedHp, 'an active hitbox cannot damage twice');
    assert.equal(state.avatar.hp, 80, 'arena damage must remain separate from habit HP');
});

test('three fresh light presses chain distinct combo attacks', () => {
    const { player, enemy, advance, press } = setup();
    enemy.x = 570;
    press('attack');
    advance(0.05);
    assert.equal(player.combo, 1);
    press('attack');
    advance(0.34);
    assert.equal(player.combo, 2);
    press('attack');
    advance(0.37);
    assert.equal(player.combo, 3);
    assert.equal(player.attack.kind, 'light');
});

test('guard blocks only a frontal attack while grounded', () => {
    const front = setup();
    front.player.state = 'GUARDING';
    front.player.facing = 'right';
    front.engine.applyDamage('player', 'enemy', 20, { direction: -1 });
    assert.equal(front.state.currentBattle.playerHp, 105);
    const back = setup();
    back.player.state = 'GUARDING';
    back.player.facing = 'right';
    back.engine.applyDamage('player', 'enemy', 20, { direction: 1 });
    assert.equal(back.state.currentBattle.playerHp, 90);
    const air = setup();
    air.player.state = 'GUARDING';
    air.player.facing = 'right';
    air.player.grounded = false;
    air.engine.applyDamage('player', 'enemy', 20, { direction: -1 });
    assert.equal(air.state.currentBattle.playerHp, 90);
});

test('enemy telegraphs a strike before its active hitbox', () => {
    const { player, enemy, state, advance } = setup();
    enemy.aiDisabled = false;
    enemy.aiTimer = 0;
    enemy.x = player.x + 65;
    advance(0.15);
    assert.equal(enemy.state, 'ATTACKING');
    assert.equal(enemy.attack.phase, 'startup');
    assert.equal(state.currentBattle.playerHp, 110);
    advance(0.23);
    assert.ok(state.currentBattle.playerHp < 110);
});

test('unequipped and spent spells cannot be cast; equipped healing works once', () => {
    const { engine, state, player } = setup();
    engine._castSpell(player, 'fire');
    assert.equal(engine._rtProjectiles.length, 0);
    state.avatar.equippedSpell = 'spell_heal';
    state.currentBattle.playerHp = 20;
    engine._castSpell(player, 'heal');
    assert.equal(state.currentBattle.playerHp, 58);
    player.magicCooldown = 0;
    engine._castSpell(player, 'heal');
    assert.equal(state.currentBattle.playerHp, 58);
});

test('equipping and removing fire preserves mage magic without consuming the fire spell', async () => {
    const { engine, state, player, advance, context } = setup();
    state.avatar.avatarClass = 'mage';
    const saved = [];
    context.saveAvatarToDB = async () => saved.push(state.avatar.equippedSpell);
    await engine.equipItem('spell_fire');
    assert.equal(engine.combatKeyAction('KeyX'), 'fire');
    assert.equal(engine.combatKeyAction('KeyF'), 'magic');
    engine._castSpell(player, 'magic');
    assert.equal(engine._rtProjectiles[0].type, 'magic');
    assert.equal(state.currentBattle.fireUses, 0);
    advance(1.3);
    engine._castSpell(player, 'fire');
    assert.equal(state.currentBattle.fireUses, 1);
    assert.ok(engine._rtProjectiles.some(p => p.type === 'fire'));
    advance(1.3);
    await engine.equipItem('spell_fire');
    engine._rtProjectiles = [];
    engine._castSpell(player, 'fire');
    assert.equal(engine._rtProjectiles.length, 0);
    assert.equal(engine.combatKeyAction('KeyX'), 'magic');
    engine._castSpell(player, 'magic');
    assert.equal(engine._rtProjectiles[0].type, 'magic');
    assert.deepEqual(saved, ['spell_fire', null]);
});

test('non-mages cannot cast innate magic and stale unowned spells cannot be used', () => {
    const { engine, state, player } = setup();
    state.avatar.level = 20;
    state.avatar.avatarClass = 'knight';
    state.avatar.equippedSpell = 'spell_fire,spell_heal';
    state.inventory = [];
    for (const action of ['magic', 'fire', 'heal', 'unknown']) engine._castSpell(player, action);
    assert.equal(engine._rtProjectiles.length, 0);
    assert.equal(state.currentBattle.fireUses, 0);
    assert.equal(state.currentBattle.healUses, 0);
    assert.equal(engine.combatKeyAction('KeyX'), null);
});

test('failed equipment save restores the previous spell selection', async () => {
    for (const rejects of [false, true]) {
        const { engine, state, context } = setup();
        state.avatar.equippedSpell = 'spell_fire';
        context.saveAvatarToDB = async () => {
            if (rejects) throw new Error('offline');
            return { error: new Error('save rejected') };
        };
        await assert.rejects(engine.equipItem('spell_fire'));
        assert.equal(state.avatar.equippedSpell, 'spell_fire');
    }
});

test('fire and healing stay independent, cannot be reused by re-equipping, and reset next battle', async () => {
    const { engine, state, player, advance } = setup();
    state.avatar.equippedSpell = 'spell_fire,spell_heal';
    engine._castSpell(player, 'heal');
    assert.equal(state.currentBattle.healUses, 0, 'full health should not waste healing');
    state.currentBattle.playerHp = 20;
    engine._castSpell(player, 'heal');
    advance(1.3);
    engine._castSpell(player, 'fire');
    advance(1.3);
    await engine.equipItem('spell_fire');
    await engine.equipItem('spell_fire');
    engine._rtProjectiles = [];
    engine._castSpell(player, 'fire');
    assert.equal(engine._rtProjectiles.length, 0);
    state.currentBattle.isFinished = true;
    engine.startPvEBattle({ hp: 400, maxHp: 400, attack: 16 });
    engine._castSpell(engine._rtEntities[0], 'fire');
    assert.equal(engine._rtProjectiles.length, 1);
    assert.equal(state.currentBattle.healUses, 0);
});

for (const [weapon, projectile] of [['wpn_staff', 'magic'], ['wpn_bow', 'arrow']]) {
    test(`${weapon} shoots in both directions, damages at range once and supports charged shots`, () => {
        for (const direction of [-1, 1]) {
            const normal = setup(), charged = setup();
            for (const [scene, action] of [[normal, 'attack'], [charged, 'heavy']]) {
                const { engine, state, player, enemy, press, advance } = scene;
                state.avatar.equippedWeapon = weapon;
                player.x = 300; enemy.x = player.x + direction * 210;
                press(action);
                advance(.16);
                assert.equal(engine._rtProjectiles.length, 0, 'windup cannot damage');
                assert.equal(state.currentBattle.oppHp, 400);
                advance(action === 'heavy' ? .33 : .08);
                const shot = engine._rtProjectiles[0];
                assert.equal(shot.type, projectile);
                assert.equal(Math.sign(shot.vx), direction);
                assert.equal(state.currentBattle.fireUses, 0);
                assert.equal(player.magicCooldown, 0);
                advance(1);
                assert.equal(state.currentBattle.oppHp, 400 - shot.damage, 'one projectile, one hit');
                assert.equal(engine._rtProjectiles.length, 0);
            }
            assert.ok(charged.state.currentBattle.oppHp < normal.state.currentBattle.oppHp);
        }
    });

    test(`${weapon} can be interrupted during windup and removing it restores melee`, () => {
        const { engine, state, player, enemy, press, advance } = setup();
        state.avatar.equippedWeapon = weapon;
        press('attack'); advance(.1);
        engine.applyDamage('player', 'enemy', 5, { direction: -1 });
        advance(.7);
        assert.equal(engine._rtProjectiles.length, 0);
        assert.equal(state.currentBattle.oppHp, 400);
        state.avatar.equippedWeapon = null;
        player.x = 150; enemy.x = 360;
        press('attack'); advance(.4);
        assert.equal(state.currentBattle.oppHp, 400, 'melee cannot reach a distant enemy');
        enemy.x = player.x + 60;
        press('attack'); advance(.2);
        assert.ok(state.currentBattle.oppHp < 400);
        assert.equal(engine._rtProjectiles.length, 0);
    });
}

test('stopping releases held actions, cancels the frame and invalidates old callbacks', () => {
    const { engine, callbacks, player } = setup();
    engine._measureArena = () => ({});
    engine._renderRT = () => {};
    engine.startGameLoop();
    const staleFrame = [...callbacks.values()][0];
    engine.handleInput('right', true);
    engine.handleInput('attack', true);
    engine.stopGameLoop();
    assert.equal(callbacks.size, 0);
    assert.equal(engine._rtInputs.right, false);
    assert.equal(Object.keys(engine._inputBuffer).length, 0);
    const originalX = player.x;
    staleFrame(40);
    assert.equal(player.x, originalX);
    assert.equal(callbacks.size, 0);
});

test('a delayed result save cannot erase a newer match or pay twice', async () => {
    const { engine, state, context } = setup();
    let resolveSave;
    context.addBattleLogToDB = () => new Promise(resolve => { resolveSave = resolve; });
    const oldBattle = state.currentBattle;
    const pending = engine._endBattle(true, false, oldBattle);
    assert.equal(state.avatar.gold, 10);
    await engine._endBattle(true, false, oldBattle);
    assert.equal(state.avatar.gold, 10);
    engine.startPvEBattle({ hp: 100, maxHp: 100, attack: 10, xp: 10, goldRaw: 5 });
    const newBattle = state.currentBattle;
    assert.notEqual(newBattle, oldBattle);
    resolveSave();
    await pending;
    assert.equal(state.currentBattle, newBattle);
});

test('defeat and surrender retain the minimum real avatar HP', async () => {
    for (const fled of [false, true]) {
        const { engine, state } = setup();
        state.avatar.hp = 5;
        await engine._endBattle(false, fled);
        assert.equal(state.avatar.hp, 1);
        assert.equal(state.avatar.isDead, false);
    }
});

test('a conflicting reward save finishes combat without claiming saved rewards', async () => {
    const { engine, state, context } = setup();
    context.saveAvatarToDB = async () => { state.avatar.gold = 90; throw new Error('Concurrent avatar update'); };
    let logs = 0;
    context.addBattleLogToDB = async () => { logs++; };
    const result = await engine._endBattle(true);
    assert.equal(result.saved, false);
    assert.equal(result.xpGain, 0);
    assert.equal(result.goldGain, 0);
    assert.equal(state.avatar.gold, 90);
    assert.equal(logs, 0);
    assert.equal(state.currentBattle, null);
});

test('knockout resolves once and surrender cannot replace a victory during its animation', async () => {
    const { engine, state, advance, context } = setup();
    let saves = 0;
    context.addBattleLogToDB = async () => { saves++; };
    engine.applyDamage('enemy', 'player', 500);
    assert.equal(state.currentBattle.knockout.playerWon, true);
    engine.fleeBattle();
    assert.equal(state.currentBattle.isFinished, false);
    advance(1.2);
    await new Promise(setImmediate);
    assert.equal(saves, 1);
    assert.equal(state.avatar.gold, 10);
    assert.equal(state.currentBattle, null);
});

test('finishing a delayed save does not pull the player away from the wardrobe', async () => {
    const { engine, state, context } = setup();
    let release;
    context.saveAvatarToDB = () => new Promise(resolve => { release = resolve; });
    let navigated = false;
    context.App = { showToast() {}, navigate() { navigated = true; } };
    state.currentView = 'arena';
    const completion = engine._endBattle(true);
    await new Promise(setImmediate);
    state.currentView = 'character';
    release();
    await completion;
    assert.equal(navigated, false);
    assert.equal(state._lastBattleResult.won, true);
});

test('sustained light-attack pressure in either corner still permits enemy retaliation', () => {
    for (const direction of [-1, 1]) {
        const { engine, state, player, enemy, press } = setup();
        enemy.aiDisabled = false;
        enemy.aiTimer = 0;
        enemy.x = direction > 0 ? 613 : 27;
        player.x = enemy.x - direction * 53;
        player.facing = direction > 0 ? 'right' : 'left';
        enemy.facing = direction > 0 ? 'left' : 'right';
        engine.handleInput(direction > 0 ? 'right' : 'left', true);
        const completedSwings = new Set();
        for (let frame = 0; frame < 12 * 120; frame++) {
            if (frame % 12 === 0) press('attack');
            engine._updateRT(1 / 120);
            if (enemy.attack?.phase === 'active') completedSwings.add(enemy.attack);
        }
        assert.ok(completedSwings.size >= 2, `enemy completed only ${completedSwings.size} attacks in corner ${direction}`);
        assert.ok(state.currentBattle.playerHp < 110, 'remaining in range and spamming must leave an opening to be hit');
        assert.ok(state.currentBattle.oppHp < 400, 'pressure and combos must still deal damage');
    }
});

test('stagger recovery preserves damage and attack startup, then expires', () => {
    const { engine, state, player, enemy, advance } = setup();
    for (let i = 0; i < 3; i++) engine.applyDamage(enemy.id, player.id, 2);
    assert.equal(enemy.recoveryPending, true);
    const stun = enemy.hitStunTimer;
    engine.applyDamage(enemy.id, player.id, 2, { heavy: true });
    assert.ok(enemy.hitStunTimer <= stun, 'a fourth hit must not extend the stun');
    advance(0.4);
    assert.ok(enemy.recoveryTimer > 0);
    engine._startAttack(enemy, 'light');
    const attack = enemy.attack;
    const hp = state.currentBattle.oppHp;
    engine.applyDamage(enemy.id, player.id, 8);
    assert.equal(state.currentBattle.oppHp, hp - 8, 'recovery does not grant invulnerability');
    assert.equal(enemy.attack, attack, 'the telegraphed retaliation survives another hit');
    assert.equal(attack.phase, 'startup');
    advance(1.3);
    assert.equal(enemy.recoveryTimer, 0);
    engine.applyDamage(enemy.id, player.id, 2);
    assert.equal(enemy.state, 'HIT_STUN', 'normal stagger returns after recovery');
});

test('projectiles charge before hitting, deal damage once, and face either direction', () => {
    for (const direction of [-1, 1]) {
        const { engine, state, player, enemy } = setup();
        player.x = 300;
        player.facing = direction > 0 ? 'right' : 'left';
        enemy.x = player.x + direction * 70;
        engine._spawnProjectile(player, 'fire');
        const shot = engine._rtProjectiles[0];
        assert.equal(Math.sign(shot.vx), direction);
        engine._advanceProjectiles(0.05);
        assert.equal(state.currentBattle.oppHp, 400);
        engine._advanceProjectiles(0.06);
        assert.equal(state.currentBattle.oppHp, 400, 'charging is visual and cannot hit');
        engine._advanceProjectiles(0.01);
        assert.equal(state.currentBattle.oppHp, 400 - shot.damage);
        assert.equal(engine._rtProjectiles.length, 0);
        engine._advanceProjectiles(0.2);
        assert.equal(state.currentBattle.oppHp, 400 - shot.damage);
    }
});
