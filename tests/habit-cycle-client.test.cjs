const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const START = '2026-10-05T18:00:00Z';
const END = '2026-10-06T18:00:00Z';
const UNLOCK = '2026-10-06T16:00:00Z';
const hours = value => value * 60 * 60 * 1000;
const clone = value => JSON.parse(JSON.stringify(value));
const row = (type = 'negative', overrides = {}) => ({
  id: type === 'negative' ? 'negative' : 'positive',
  catalog_id: type === 'negative' ? 'hab_no_soda' : 'hab_teeth',
  title: type === 'negative' ? 'NO Consumir refrescos' : 'Higiene dental',
  description: 'Una meta para practicar con constancia.',
  type, frequency: 'daily', habit_timezone: 'UTC',
  period: '2026-10-05', cycle_start_at: START, cycle_end_at: END,
  abstinence_available_at: type === 'negative' ? UNLOCK : null,
  recorded: false, lapse_count: 0, missed_cycles: 0,
  current_streak: 0, best_streak: 0, difficulty_level: 1, rewarded_level: 1,
  progression: null, hp_penalty: 5,
  rewards: type === 'negative' ? { xp: 2, gold: 1 } : { xp: 15, gold: 7 },
  ...overrides
});

function setup(habits = [row()]) {
  const state = {
    localNow: Date.parse(START), calls: [], toasts: [], navigations: [], sounds: [],
    cards: [], modal: { innerHTML: '' }, response: null, uuids: []
  };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.localNow])); }
    static now() { return state.localNow; }
  }
  const ctx = vm.createContext({
    console, Promise, Intl, Date: TestDate, clearTimeout, setTimeout,
    window: { Feedback: { play: kind => state.sounds.push(kind) } },
    document: {
      hidden: false, addEventListener() {}, querySelector() { return null; },
      querySelectorAll() { return state.cards; },
      getElementById() { return state.modal; },
      body: { dataset: {} }
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    crypto: { randomUUID() { const id = randomUUID(); state.uuids.push(id); return id; } },
    confirm: () => true,
    Engine: { getCompletionRate: () => 0, stopGameLoop() {} },
    Wardrobe: { reset() {} }, BattleScreen: { leave() {} }, Atelier: { busy: false },
    CharacterArt: { render: () => '' }, PetArt: { supports: () => false },
    client: {
      async rpc(name, args) {
        state.calls.push({ name, args: clone(args) });
        return state.respond ? state.respond(args) : { data: state.response, error: null };
      },
      from() { return { select: async () => ({ data: [], error: null }) }; }
    },
    onToast: (message, type) => state.toasts.push({ message, type }),
    onNavigate: view => state.navigations.push(view),
    inputRows: habits
  });
  for (const name of ['data', 'i18n', 'views', 'habits', 'app']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${name}.js`), 'utf8'), ctx);
  }
  const run = code => vm.runInContext(code, ctx);
  run(`supabase=client;GameState.user={id:'owner'};GameState.avatarId='avatar';
    GameState.avatar.gold=100;GameState.avatar.hp=100;GameState.avatar.currentXP=0;
    GameState.habits=inputRows.map(h=>HabitProgress.fromRow(h));
    HabitProgress.ready=true;HabitProgress.installed=true;HabitProgress.rulesReady=true;
    App.showToast=onToast;App.navigate=onNavigate;`);
  const response = (status, extra = {}) => ({
    status, rules_version: 4, server_now: new TestDate().toISOString(),
    habits: clone(habits), avatar: { gold: 100, hp: 100, current_xp: 0 },
    xp: 0, gold: 0, gold_lost: 0, hp_lost: 0, penalties: [], ...extra
  });
  state.response = response('saved');
  return { state, ctx, run, response };
}

function button(html, attribute) {
  const tag = html.match(new RegExp(`<button\\b[^>]*\\b${attribute}\\b[^>]*>`));
  assert.ok(tag, `button ${attribute} is rendered`);
  return tag[0];
}

test('Habits shows detailed summaries and Home alone exposes completion controls', () => {
  const h = setup([row('positive'), row()]);
  const management = h.run('Views.renderHabits()');
  assert.doesNotMatch(management, /\bdata-habit-(?:complete|abstain|lapse)\b/);
  assert.doesNotMatch(management, /onclick="(?:App\.toggleHabit|HabitProgress\.report)\(/);
  assert.match(management, /Registra tus avances desde Inicio/);
  assert.match(management, /Opciones e historial/);
  assert.match(management, /data-cycle-countdown/);
  assert.match(management, /RETOS PERSONALES/);
  const home = h.run('Views.renderDashboard()');
  assert.equal((home.match(/\bdata-habit-complete\b/g) || []).length, 1);
  assert.equal((home.match(/\bdata-habit-abstain\b/g) || []).length, 1);
  assert.equal((home.match(/\bdata-habit-lapse\b/g) || []).length, 1);
  assert.match(home, /NO LO HICE/);
  assert.match(home, /SÍ LO HICE/);
  assert.match(button(home, 'data-habit-lapse'), /btn-danger/);
  assert.doesNotMatch(button(home, 'data-habit-lapse'), /\bdisabled\b/);
  assert.match(button(home, 'data-habit-abstain'), /\bdisabled\b/);
});

test('negative titles normalize NO once, including translated and already-prefixed catalog entries', () => {
  const h = setup();
  for (const title of ['Fumar cigarrillo', 'NO Fumar cigarrillo', 'no Fumar cigarrillo', 'DO NOT Fumar cigarrillo']) {
    h.ctx.item = row('negative', { title });
    const once = h.run('HabitProgress.title(item)');
    assert.equal(once, 'NO Fumar cigarrillo');
    h.ctx.item.title = once;
    assert.equal(h.run('HabitProgress.title(item)'), once);
    assert.equal(h.run('HabitProgress.catalogTitle(item)'), once);
  }
  h.run("I18N.current='en'");
  assert.equal(h.run('HabitProgress.title(item)'), 'DO NOT Fumar cigarrillo');
  h.ctx.item.title = h.run('HabitProgress.title(item)');
  assert.equal(h.run('HabitProgress.title(item)'), 'DO NOT Fumar cigarrillo');
  assert.equal(h.run("I18N.t('habits.filter_negative')"), 'PERSONAL CHALLENGES');
});

test('server clock offset unlocks abstinence exactly two hours before renewal and updates countdown controls', () => {
  const h = setup();
  const nodes = Object.fromEntries([
    '[data-cycle-countdown]', '[data-abstinence-countdown]', '[data-habit-abstain]', '[data-habit-lapse]'
  ].map(selector => [selector, { textContent: '', disabled: false }]));
  h.state.cards = [{ dataset: { progressHabit: 'negative' }, querySelector: selector => nodes[selector] || null }];
  h.state.localNow = Date.parse(START) + hours(21);
  h.run(`HabitProgress.syncRules({rules_version:4,server_now:'2026-10-06T15:30:00Z'});
    HabitProgress.updateCountdowns();`);
  assert.equal(h.run('HabitProgress.clockOffset'), hours(0.5));
  assert.equal(nodes['[data-cycle-countdown]'].textContent, '02:30:00');
  assert.equal(nodes['[data-abstinence-countdown]'].textContent, '00:30:00');
  assert.equal(nodes['[data-habit-abstain]'].disabled, true);
  assert.equal(nodes['[data-habit-lapse]'].disabled, false);
  h.state.localNow += hours(0.5) - 1000;
  h.run('HabitProgress.updateCountdowns()');
  assert.equal(nodes['[data-abstinence-countdown]'].textContent, '00:00:01');
  assert.equal(nodes['[data-habit-abstain]'].disabled, true);
  h.state.localNow += 1000;
  h.run('HabitProgress.updateCountdowns()');
  assert.equal(nodes['[data-cycle-countdown]'].textContent, '02:00:00');
  assert.equal(nodes['[data-habit-abstain]'].disabled, false);
  h.run('GameState.habits[0].recorded=true;HabitProgress.updateCountdowns()');
  assert.equal(nodes['[data-habit-abstain]'].disabled, true);
  assert.equal(nodes['[data-habit-lapse]'].disabled, false);
  assert.match(h.run('HabitProgress.cycleSummary(GameState.habits[0])'), /Podrás completarlo de nuevo en/);
  h.run('HabitProgress.busy=true;HabitProgress.updateCountdowns()');
  assert.equal(nodes['[data-habit-lapse]'].disabled, true);
  h.run('HabitProgress.busy=false');
  h.state.localNow += hours(2);
  h.run('HabitProgress.updateCountdowns()');
  assert.equal(nodes['[data-cycle-countdown]'].textContent, '00:00:00');
  assert.equal(nodes['[data-habit-abstain]'].disabled, true);
  assert.equal(nodes['[data-habit-lapse]'].disabled, true);
});

test('outdated service rules and logged lapses keep success actions unavailable', async () => {
  const h = setup([row('negative', { lapse_count: 1 }), row('positive')]);
  h.state.localNow = Date.parse(UNLOCK);
  assert.equal(h.run('HabitProgress.abstinenceAvailable(GameState.habits[0])'), false);
  await h.run("HabitProgress.report('negative','abstain')");
  assert.equal(h.state.calls.length, 0);
  h.run('HabitProgress.rulesReady=false');
  const home = h.run('Views.renderDashboard()');
  for (const attr of ['data-habit-abstain', 'data-habit-lapse', 'data-habit-complete']) {
    assert.match(button(home, attr), /\bdisabled\b/);
  }
  await h.run("HabitProgress.report('negative','lapse')");
  await h.run("HabitProgress.complete('positive')");
  assert.equal(h.state.calls.length, 0);
});

test('a lost lapse response retries the same UUID and an acknowledged new click creates a fresh UUID', async () => {
  const h = setup();
  let attempt = 0;
  h.state.respond = async () => {
    attempt++;
    if (attempt === 1) throw new Error('response lost after the server committed');
    return { data: h.response(attempt === 2 ? 'request_replayed' : 'lapsed', {
      habits: [row('negative', { lapse_count: attempt - 1 })],
      avatar: { gold: attempt === 2 ? 95 : 90, hp: attempt === 2 ? 95 : 90, current_xp: 0 },
      gold_lost: attempt === 2 ? 0 : 5, hp_lost: attempt === 2 ? 0 : 5
    }), error: null };
  };
  await h.run("HabitProgress.report('negative','lapse')");
  assert.equal(h.run('HabitProgress.pendingRequests.size'), 1);
  assert.equal(h.run('GameState.avatar.gold'), 100, 'a network failure must not apply an optimistic penalty');
  await h.run("HabitProgress.report('negative','lapse')");
  assert.equal(h.run('HabitProgress.pendingRequests.size'), 0);
  assert.equal(h.run('GameState.avatar.gold'), 95);
  assert.equal(h.state.calls[0].args.p_config.request_id, h.state.calls[1].args.p_config.request_id);
  assert.equal(h.state.calls[1].args.p_config.expected_cycle_start_at, START);
  assert.equal(h.state.calls[1].args.p_expected_period, '2026-10-05');
  assert.match(h.state.toasts.at(-1).message, /No se aplicó otro cobro/);
  await h.run("HabitProgress.report('negative','lapse')");
  assert.notEqual(h.state.calls[1].args.p_config.request_id, h.state.calls[2].args.p_config.request_id);
  assert.equal(h.run('GameState.avatar.gold'), 90);
  assert.equal(h.run('HabitProgress.pendingRequests.size'), 0);
  assert.equal(h.state.uuids.length, 2);
  assert.deepEqual(h.state.sounds, []);
});

test('a pending request blocks repeated clicks until its authoritative response arrives', async () => {
  const h = setup();
  let resolve;
  h.state.respond = () => new Promise(done => { resolve = done; });
  const first = h.run("HabitProgress.report('negative','lapse')");
  await Promise.resolve();
  await h.run("HabitProgress.report('negative','lapse')");
  assert.equal(h.state.calls.length, 1);
  resolve({ data: h.response('lapsed', { gold_lost: 5, hp_lost: 5 }), error: null });
  await first;
  assert.equal(h.run('HabitProgress.busy'), false);
  assert.equal(h.run('HabitProgress.pendingRequests.size'), 0);
});

test('signing out clears cycle state and a late response cannot overwrite the next account', async () => {
  const h = setup();
  let resolve;
  h.state.respond = () => new Promise(done => { resolve = done; });
  const pending = h.run("HabitProgress.report('negative','lapse')");
  await Promise.resolve();
  assert.equal(h.state.calls.length, 1);
  h.run(`HabitProgress.clockOffset=123456;HabitProgress.cyclePenalties=[{id:'old'}];
    HabitProgress.deleteAvailableAt='2026-10-07T18:00:00Z';
    App.clearAccountView();GameState.user={id:'next-account'};GameState.avatar.gold=777;`);
  assert.equal(h.run('HabitProgress.pendingRequests.size'), 0);
  assert.equal(h.run('HabitProgress.clockOffset'), 0);
  assert.equal(h.run('HabitProgress.cyclePenalties.length'), 0);
  assert.equal(h.run('HabitProgress.deleteAvailableAt'), null);
  assert.equal(h.run('HabitProgress.ready'), false);
  assert.equal(h.run('HabitProgress.rulesReady'), false);
  assert.equal(h.run('GameState.habits.length'), 0);
  resolve({ data: h.response('lapsed', { avatar: { gold: 95, hp: 95 } }), error: null });
  await pending;
  assert.equal(h.run('GameState.avatar.gold'), 777);
  assert.equal(h.run('GameState.habits.length'), 0);
  assert.equal(h.run('HabitProgress.pendingRequests.size'), 0);
  assert.equal(h.state.navigations.length, 0);
});
