const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8');
const engineVersion = crypto.createHash('sha256').update(source).digest('hex');
const script = new vm.Script(source + '\nglobalThis.engine = Engine;');
const actions = new Set(['left', 'right', 'up', 'attack', 'heavy', 'magic', 'heal', 'fire', 'guard']);
const maxFrames = 72000;

function avatarFromRow(row, inventory) {
    const owns = (id, type) => inventory.some(item => item.id === id && item.type === type);
    return {
        name: row.name, appearance: row.appearance, level: row.level, avatarClass: row.avatar_class || 'hero',
        equippedWeapon: owns(row.equipped_weapon, 'weapon') ? row.equipped_weapon : null,
        equippedShield: owns(row.equipped_shield, 'shield') ? row.equipped_shield : null,
        equippedSpell: (row.equipped_spell || '').split(',').filter(id => owns(id, 'spell')).join(',') || null,
        equippedBackground: owns(row.equipped_background, 'background') ? row.equipped_background : null,
        equippedPet: owns(row.equipped_pet, 'pet') ? row.equipped_pet : null,
        hp: row.hp, maxHp: row.max_hp
    };
}

function simulation(match) {
    const state = { avatar: structuredClone(match.avatar), inventory: structuredClone(match.inventory), currentBattle: null };
    const context = vm.createContext({
        GameState: state, document: { getElementById: () => null },
        cancelAnimationFrame() {}, console
    });
    script.runInContext(context, { timeout: 1000 });
    const engine = context.engine;
    engine._effect = () => {};
    engine._advanceEffects = () => {};
    engine.recordCombatEvent = () => {};
    engine._endBattle = won => { state.currentBattle.isFinished = true; context.outcome = won; };
    return { context, engine, state };
}

function createMatch(row) {
    if (row.engine_version !== engineVersion) throw new Error('Combat version changed; reload and start a new match');
    const inventory = row.snapshot.inventory || [];
    const match = {
        id: row.id, engineVersion, startedAt: row.created_at,
        avatar: avatarFromRow(row.snapshot.avatar, inventory), inventory
    };
    const { context, engine, state } = simulation(match);
    state.monsters = row.snapshot.monsters || [];
    const random = crypto.createHash('sha256').update(row.id).digest();
    context.randomValues = [random.readUInt32BE(0) / 4294967296, random.readUInt32BE(4) / 4294967296];
    vm.runInContext('Math.random = () => randomValues.shift() ?? 0;', context);
    match.opponent = JSON.parse(JSON.stringify(engine.generateOpponent(row.snapshot.opponent_sprite)));
    for (const key of ['hp', 'maxHp', 'attack', 'xp', 'goldRaw']) {
        if (!Number.isFinite(match.opponent[key]) || match.opponent[key] < 0 || match.opponent[key] > 1000000) throw new Error('Invalid combat catalog');
    }
    return match;
}

function verifyReplay(match, replay, fled, elapsedSeconds) {
    if (typeof fled !== 'boolean' || !replay || replay.invalid || replay.version !== 1 ||
        !Number.isInteger(replay.frames) || replay.frames < 0 || replay.frames > maxFrames ||
        !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 1200 ||
        replay.frames / 120 > elapsedSeconds + 1 || !Array.isArray(replay.events) || replay.events.length > 20000) {
        throw new Error('Invalid combat replay');
    }
    let lastFrame = 0;
    let resizes = 0;
    for (const event of replay.events) {
        if (!event || !Number.isInteger(event.frame) || event.frame < lastFrame || event.frame > replay.frames) throw new Error('Invalid event frame');
        lastFrame = event.frame;
        if (event.kind === 'input') {
            if (!actions.has(event.action) || typeof event.pressed !== 'boolean') throw new Error('Invalid combat input');
        } else if (event.kind === 'resize') {
            if (++resizes > 120 || !Number.isFinite(event.width) || !Number.isFinite(event.height) ||
                event.width < 240 || event.width > 4096 || event.height < 64 || event.height > 2160) throw new Error('Invalid arena size');
        } else if (event.kind !== 'reset') throw new Error('Invalid combat event');
    }
    const { context, engine, state } = simulation(match);
    engine.startPvEBattle(structuredClone(match.opponent), match);
    context.replay = structuredClone(replay);
    vm.runInContext(`
        let eventIndex = 0;
        for (let frame = 0; frame <= replay.frames; frame++) {
            while (eventIndex < replay.events.length && replay.events[eventIndex].frame === frame) {
                const event = replay.events[eventIndex++];
                if (event.kind === 'input') engine.handleInput(event.action, event.pressed);
                else if (event.kind === 'resize') engine.resizeCombatArena(event.width, event.height);
                else engine.resetInputs();
            }
            if (frame < replay.frames) {
                if (GameState.currentBattle.isFinished) throw new Error('Replay continues after combat');
                engine._stepCombat(1 / 120);
            }
        }
    `, context, { timeout: 2000 });
    const battle = state.currentBattle;
    if (fled) {
        if (battle.knockout || battle.isFinished) throw new Error('Cannot surrender after knockout');
        return { won: false, fled: true, xp: 0, gold: 0, hpLost: 10 };
    }
    if (!battle.isFinished || typeof context.outcome !== 'boolean') throw new Error('Combat is not finished');
    return {
        won: context.outcome, fled: false,
        xp: context.outcome ? match.opponent.xp : 0,
        gold: context.outcome ? match.opponent.goldRaw : 0,
        hpLost: context.outcome ? 0 : 20
    };
}

module.exports = { createMatch, verifyReplay, engineVersion };