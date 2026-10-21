const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createFixture, user } = require('./helpers/habit-db.cjs');

const migration = fs.readFileSync(path.join(__dirname, '../supabase_habit_cycles.sql'), 'utf8');
const activationPatch = fs.readFileSync(path.join(__dirname, '../supabase_habit_abstinence_activation.sql'), 'utf8');
const BASE = '2026-10-05T18:00:00Z';
const timestamp = value => new Date(value).getTime();
const plusHours = (value, hours) => new Date(timestamp(value) + hours * 60 * 60 * 1000).toISOString();
const snapshotHabit = (result, id) => result.habits.find(habit => habit.id === id);

test('activation cycles, personal challenges and automatic archiving remain authoritative', async t => {
  const db = await createFixture();
  let accountNumber = 10;
  let currentAvatar;
  const account = async (options = {}) => {
    const id = `00000000-0000-0000-0000-${String(accountNumber++).padStart(12, '0')}`;
    currentAvatar = `cycle-${id}`;
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
    await db.query(
      'INSERT INTO public.avatars(id,user_id,gold,hp,current_xp,xp_to_level) VALUES($1,$2,$3,$4,$5,10000)',
      [currentAvatar, id, options.gold ?? 100, options.hp ?? 100, options.xp ?? 0]
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    return id;
  };
  const balance = async () => (await db.query(
    'SELECT gold,hp,current_xp,is_dead FROM public.avatars WHERE id=$1', [currentAvatar]
  )).rows[0];
  const call = async (action, {
    id = null, config = {}, at = BASE, cycleStart = at, value = null,
    requestId = randomUUID(), period = cycleStart.slice(0, 10)
  } = {}) => {
    if (['complete', 'abstain', 'lapse'].includes(action)) {
      config = { request_id: requestId, expected_cycle_start_at: cycleStart, ...config };
    }
    return (await db.query(
      'SELECT public.habit_action_at($1,$2,$3::jsonb,$4,$5::date,$6::timestamptz) AS result',
      [action, id, JSON.stringify(config), value, period, at]
    )).rows[0].result;
  };
  const create = async (catalog = 'hab_teeth', frequency = 'daily', at = BASE, timezone = 'UTC') =>
    call('create', { at, config: { catalog_id: catalog, frequency, timezone } });
  const history = async id => (await db.query(
    'SELECT * FROM public.habit_activity WHERE habit_id=$1 ORDER BY id', [id]
  )).rows;
  const legacyDuplicate = async (source, start) => {
    const id = `duplicate-${randomUUID()}`;
    await db.query(
      `INSERT INTO public.habits(
       id,avatar_id,title,type,xp_reward,gold_reward,hp_penalty,frequency,catalog_id,
       habit_timezone,checked_through,cycle_start_at,cycle_end_at,created_at)
       SELECT $1,avatar_id,title,type,xp_reward,gold_reward,hp_penalty,'daily',catalog_id,
       'Asia/Tokyo',($2::timestamptz AT TIME ZONE 'Asia/Tokyo')::date-1,
       $2::timestamptz,$2::timestamptz+interval '24 hours',$2::timestamptz
       FROM public.habits WHERE id=$3`,
      [id, start, source]
    );
    return id;
  };

  try {
    await t.test('migration grants existing habits a fresh grace period without changing history or balances', async () => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec("UPDATE public.habits SET created_at='2020-01-01',checked_through='2020-01-01' WHERE id='old'");
      const oldHistory = await history('old');
      const oldBalance = (await db.query("SELECT gold,hp,current_xp FROM public.avatars WHERE id='a'")).rows[0];
      const before = (await db.query('SELECT clock_timestamp() AS time')).rows[0].time;
      await db.exec(migration);
      const migrated = await call('list', { at: new Date().toISOString() });
      const old = snapshotHabit(migrated, 'old');
      assert.ok(old, 'a long inactive existing habit must survive the migration');
      assert.ok(timestamp(old.cycle_start_at) >= timestamp(before));
      assert.equal(old.missed_cycles, 0);
      const migratedHistory = await history('old');
      for (const prior of oldHistory) {
        const retained = migratedHistory.find(row => row.id === prior.id);
        assert.ok(retained);
        assert.deepEqual(Object.fromEntries(Object.keys(prior).map(key => [key, retained[key]])), prior);
      }
      for (const added of migratedHistory.filter(row => !oldHistory.some(prior => prior.id === row.id))) {
        assert.equal(added.outcome, 'legacy');
        assert.equal(added.xp + added.gold + added.bonus_xp + added.bonus_gold, 0);
      }
      assert.deepEqual((await db.query("SELECT gold,hp,current_xp FROM public.avatars WHERE id='a'")).rows[0], oldBalance);
      await db.exec(migration);
      const repeated = await call('list', { at: new Date().toISOString() });
      assert.equal(snapshotHabit(repeated, 'old').cycle_start_at, old.cycle_start_at);
      assert.equal(snapshotHabit(repeated, 'old').cycle_end_at, old.cycle_end_at);
      assert.deepEqual(await history('old'), migratedHistory);
      await db.exec(activationPatch);
      await db.exec(activationPatch);
      const patched = await call('list', { at: new Date().toISOString() });
      assert.equal(patched.rules_version, 5);
      assert.equal(snapshotHabit(patched, 'old').cycle_start_at, old.cycle_start_at);
      assert.deepEqual(await history('old'), migratedHistory);
    });

    await t.test('all frequencies start at activation and end at the next scheduled day at the same local time', async () => {
      await account();
      const cases = [
        ['hab_teeth', 'daily', BASE, '2026-10-06T18:00:00Z'],
        ['hab_fruit', 'workdays', BASE, '2026-10-06T18:00:00Z'],
        ['hab_strength', '3x_week', BASE, '2026-10-07T18:00:00Z'],
        ['hab_hobby', '2x_week', BASE, '2026-10-06T18:00:00Z'],
        ['hab_sun', 'weekly', BASE, '2026-10-12T18:00:00Z'],
        ['hab_top_task', 'workdays', '2026-10-09T18:00:00Z', '2026-10-12T18:00:00Z'],
        ['hab_cardio', '3x_week', '2026-10-09T18:00:00Z', '2026-10-12T18:00:00Z'],
        ['hab_journal', '2x_week', '2026-10-08T18:00:00Z', '2026-10-13T18:00:00Z']
      ];
      for (const [catalog, frequency, start, end] of cases) {
        const result = await create(catalog, frequency, start);
        const habit = snapshotHabit(result, result.habit_id);
        assert.equal(result.rules_version, 5);
        assert.equal(timestamp(habit.cycle_start_at), timestamp(start), frequency);
        assert.equal(timestamp(habit.cycle_end_at), timestamp(end), frequency);
        assert.equal(habit.recorded, false);
      }
    });

    await t.test('completion never moves the activation deadline and distinct concurrent requests pay once', async () => {
      await account();
      const created = await create();
      const id = created.habit_id;
      const end = snapshotHabit(created, id).cycle_end_at;
      const results = await Promise.all([
        call('complete', { id, at: plusHours(BASE, 4), cycleStart: BASE }),
        call('complete', { id, at: plusHours(BASE, 4), cycleStart: BASE })
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), ['already_recorded', 'completed']);
      assert.equal(results.reduce((sum, result) => sum + result.gold, 0), 7);
      const paid = results.find(result => result.status === 'completed');
      assert.equal(snapshotHabit(paid, id).recorded, true);
      assert.equal(snapshotHabit(paid, id).cycle_end_at, end);
      const next = await call('complete', { id, at: end, cycleStart: end });
      assert.equal(next.status, 'completed');
      assert.equal(timestamp(snapshotHabit(next, id).cycle_start_at), timestamp(end));
      assert.equal(timestamp(snapshotHabit(next, id).cycle_end_at), timestamp(plusHours(BASE, 48)));
      assert.equal((await history(id)).filter(row => row.outcome === 'completed').length, 2);
    });

    await t.test('old and future cycle submissions cannot claim the current reward', async () => {
      await account();
      const id = (await create()).habit_id;
      const before = await balance();
      assert.equal((await call('complete', {
        id, at: plusHours(BASE, 25), cycleStart: BASE
      })).status, 'period_changed');
      assert.equal((await call('complete', {
        id, at: plusHours(BASE, 25), cycleStart: plusHours(BASE, 48)
      })).status, 'period_changed');
      assert.deepEqual(await balance(), before);
      assert.equal((await call('complete', {
        id, at: plusHours(BASE, 25), cycleStart: plusHours(BASE, 24)
      })).status, 'completed');
    });

    await t.test('the third missed cycle archives once, preserves history and costs exactly 15 gold and 15 HP', async () => {
      await account();
      const id = (await create()).habit_id;
      for (const missed of [1, 2]) {
        const result = await call('list', { at: plusHours(BASE, 24 * missed) });
        assert.equal(snapshotHabit(result, id).missed_cycles, missed);
        assert.deepEqual(await balance(), { gold: 100, hp: 100, current_xp: 0, is_dead: false });
      }
      const archived = await call('list', { at: plusHours(BASE, 72) });
      assert.equal(snapshotHabit(archived, id), undefined);
      assert.deepEqual(await balance(), { gold: 85, hp: 85, current_xp: 0, is_dead: false });
      assert.equal((await history(id)).filter(row => row.outcome === 'missed').length, 3);
      const events = (await db.query('SELECT * FROM public.habit_events WHERE habit_id=$1 ORDER BY id', [id])).rows;
      await call('list', { at: plusHours(BASE, 24 * 60) });
      assert.deepEqual(await balance(), { gold: 85, hp: 85, current_xp: 0, is_dead: false });
      assert.deepEqual((await db.query('SELECT * FROM public.habit_events WHERE habit_id=$1 ORDER BY id', [id])).rows, events);
      const reactivatedAt = plusHours(BASE, 24 * 61);
      const restored = await create('hab_teeth', 'daily', reactivatedAt);
      assert.equal(restored.habit_id, id);
      assert.equal(timestamp(snapshotHabit(restored, id).cycle_start_at), timestamp(reactivatedAt));
      assert.equal(snapshotHabit(restored, id).missed_cycles, 0);
      assert.equal((await history(id)).filter(row => row.outcome === 'missed').length, 3);
    });

    await t.test('only consecutive missed cycles count, and skipped weekdays add no extra misses', async () => {
      await account();
      const start = '2026-10-09T18:00:00Z';
      const id = (await create('hab_teeth', 'workdays', start)).habit_id;
      let result = await call('list', { at: '2026-10-11T18:00:00Z' });
      assert.equal(snapshotHabit(result, id).missed_cycles, 0);
      result = await call('list', { at: '2026-10-13T18:00:00Z' });
      assert.equal(snapshotHabit(result, id).missed_cycles, 2);
      result = await call('complete', { id, at: '2026-10-13T19:00:00Z', cycleStart: '2026-10-13T18:00:00Z' });
      assert.equal(result.status, 'completed');
      assert.equal(snapshotHabit(result, id).missed_cycles, 0);
      result = await call('list', { at: '2026-10-16T18:00:00Z' });
      assert.equal(snapshotHabit(result, id).missed_cycles, 2);
      assert.equal(result.avatar.hp, 100);
    });

    await t.test('the three-miss limit follows each selected frequency rather than elapsed calendar days', async () => {
      const cases = [
        ['workdays', '2026-10-09T18:00:00Z', '2026-10-14T18:00:00Z'],
        ['3x_week', BASE, '2026-10-12T18:00:00Z'],
        ['2x_week', BASE, '2026-10-13T18:00:00Z'],
        ['weekly', BASE, '2026-10-26T18:00:00Z']
      ];
      for (const [frequency, start, thirdDeadline] of cases) {
        await account();
        const id = (await create('hab_teeth', frequency, start)).habit_id;
        const before = await call('list', { at: new Date(timestamp(thirdDeadline) - 1).toISOString() });
        assert.equal(snapshotHabit(before, id).missed_cycles, 2, frequency);
        assert.equal(before.avatar.hp, 100, frequency);
        const after = await call('list', { at: thirdDeadline });
        assert.equal(snapshotHabit(after, id), undefined, frequency);
        assert.equal(after.avatar.hp, 85, frequency);
        assert.equal(after.avatar.gold, 85, frequency);
      }
    });

    await t.test('a late completion cannot rescue three expired cycles or roll back their archive penalty', async () => {
      await account();
      const id = (await create()).habit_id;
      const result = await call('complete', {
        id, at: plusHours(BASE, 72), cycleStart: plusHours(BASE, 72)
      });
      assert.equal(result.status, 'auto_archived');
      assert.equal(result.xp, 0);
      assert.equal(snapshotHabit(result, id), undefined);
      assert.deepEqual(await balance(), { gold: 85, hp: 85, current_xp: 0, is_dead: false });
      assert.equal((await history(id)).filter(row => row.outcome === 'missed').length, 3);
    });

    await t.test('reactivation, reset and timezone changes cannot reopen a paid ongoing cycle', async () => {
      await account();
      const id = (await create()).habit_id;
      const completed = await call('complete', { id, at: plusHours(BASE, 1), cycleStart: BASE });
      const original = snapshotHabit(completed, id);
      const before = await balance();
      await call('archive', { id, at: plusHours(BASE, 2) });
      const restored = await create('hab_teeth', 'weekly', plusHours(BASE, 3), 'Asia/Tokyo');
      const habit = snapshotHabit(restored, id);
      assert.equal(restored.habit_id, id);
      assert.equal(habit.cycle_start_at, original.cycle_start_at);
      assert.equal(habit.cycle_end_at, original.cycle_end_at);
      assert.equal(habit.recorded, true);
      assert.equal((await call('complete', { id, at: plusHours(BASE, 3), cycleStart: BASE })).status, 'already_recorded');
      await call('reset', { id, at: plusHours(BASE, 4) });
      assert.equal((await call('complete', { id, at: plusHours(BASE, 4), cycleStart: BASE })).status, 'already_recorded');
      assert.deepEqual(await balance(), before);
    });

    await t.test('reactivating a closed cycle applies the selected schedule while preserving misses and request history', async () => {
      await account();
      const id = (await create()).habit_id;
      const requestId = randomUUID();
      await call('complete', { id, requestId, at: plusHours(BASE, 0.5), cycleStart: BASE });
      const archived = await call('archive', { id, at: plusHours(BASE, 73) });
      assert.equal(archived.status, 'saved');
      const before = await balance();
      const restart = plusHours(BASE, 120);
      const restored = await create('hab_teeth', 'weekly', restart, 'Asia/Tokyo');
      const habit = snapshotHabit(restored, id);
      assert.equal(habit.frequency, 'weekly');
      assert.equal(habit.habit_timezone, 'Asia/Tokyo');
      assert.equal(timestamp(habit.cycle_start_at), timestamp(restart));
      assert.equal(timestamp(habit.cycle_end_at), timestamp(plusHours(restart, 168)));
      assert.equal(habit.missed_cycles, 2);
      assert.equal((await call('complete', { id, requestId, at: restart, cycleStart: BASE })).status, 'request_replayed');
      assert.deepEqual(await balance(), before);
      assert.equal((await history(id)).filter(row => row.outcome === 'missed').length, 2);
      const completed = await call('complete', { id, at: restart, cycleStart: restart, period: '2026-10-11' });
      assert.equal(completed.status, 'completed');
      assert.equal(snapshotHabit(completed, id).missed_cycles, 0);
    });

    await t.test('an old duplicate catalog row cannot claim a second reward across different timezones', async () => {
      await account();
      const id = (await create()).habit_id;
      await call('complete', { id, at: plusHours(BASE, 0.5), cycleStart: BASE });
      const before = await balance();
      const duplicateStart = plusHours(BASE, 1);
      const duplicate = await legacyDuplicate(id, duplicateStart);
      const response = await call('complete', {
        id: duplicate, at: plusHours(BASE, 1.5), cycleStart: duplicateStart, period: '2026-10-06'
      });
      assert.equal(response.status, 'already_recorded');
      assert.equal(snapshotHabit(response, duplicate).recorded, true);
      assert.deepEqual(await balance(), before);
      await assert.rejects(create(), error => error.code === '22023');
    });

    await t.test('abstinence is available immediately after activation and pays once per cycle', async () => {
      await account();
      const created = await create('hab_no_soda');
      const id = created.habit_id;
      const initial = snapshotHabit(created, id);
      assert.equal(timestamp(initial.abstinence_available_at), timestamp(BASE));
      assert.deepEqual(await balance(), { gold: 100, hp: 100, current_xp: 0, is_dead: false });
      const results = await Promise.all([
        call('abstain', { id, at: BASE, cycleStart: BASE }),
        call('abstain', { id, at: BASE, cycleStart: BASE })
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), ['abstained', 'already_recorded']);
      assert.equal(results.reduce((sum, result) => sum + result.xp, 0), 2);
      assert.equal(results.reduce((sum, result) => sum + result.gold, 0), 1);
      assert.deepEqual(await balance(), { gold: 101, hp: 100, current_xp: 2, is_dead: false });
      const next = await call('abstain', { id, at: plusHours(BASE, 24), cycleStart: plusHours(BASE, 24) });
      assert.equal(next.status, 'abstained');
      assert.equal(snapshotHabit(next, id).recorded, true);
      assert.equal(timestamp(snapshotHabit(next, id).cycle_end_at), timestamp(plusHours(BASE, 48)));
    });

    await t.test('each intentional lapse costs 5 gold and 5 HP while retries and stale requests cannot charge again', async () => {
      await account();
      const id = (await create('hab_no_soda')).habit_id;
      const requestId = randomUUID();
      let result = await call('lapse', { id, requestId, at: BASE });
      assert.equal(result.status, 'lapsed');
      assert.equal(snapshotHabit(result, id).lapse_count, 1);
      assert.deepEqual(await balance(), { gold: 95, hp: 95, current_xp: 0, is_dead: false });
      result = await call('lapse', { id, requestId, at: plusHours(BASE, 1), cycleStart: BASE });
      assert.equal(result.status, 'request_replayed');
      assert.deepEqual(await balance(), { gold: 95, hp: 95, current_xp: 0, is_dead: false });
      await call('lapse', { id, at: plusHours(BASE, 2), cycleStart: BASE });
      assert.deepEqual(await balance(), { gold: 90, hp: 90, current_xp: 0, is_dead: false });
      assert.equal((await call('abstain', { id, at: plusHours(BASE, 22), cycleStart: BASE })).status, 'cycle_failed');
      result = await call('lapse', { id, at: plusHours(BASE, 25), cycleStart: BASE });
      assert.equal(result.status, 'period_changed');
      assert.deepEqual(await balance(), { gold: 90, hp: 90, current_xp: 0, is_dead: false });
      result = await call('lapse', { id, requestId, at: plusHours(BASE, 25), cycleStart: BASE });
      assert.equal(result.status, 'request_replayed');
      assert.deepEqual(await balance(), { gold: 90, hp: 90, current_xp: 0, is_dead: false });
      await assert.rejects(
        call('lapse', { id, requestId, at: plusHours(BASE, 25), cycleStart: plusHours(BASE, 24) }),
        error => error.code === '22023'
      );
      assert.deepEqual(await balance(), { gold: 90, hp: 90, current_xp: 0, is_dead: false });
    });

    await t.test('lapse history survives reactivation and cannot be turned into a success reward', async () => {
      await account();
      const id = (await create('hab_no_smoke')).habit_id;
      await call('lapse', { id, at: plusHours(BASE, 1), cycleStart: BASE });
      await call('archive', { id, at: plusHours(BASE, 2) });
      const restored = await create('hab_no_smoke', 'daily', plusHours(BASE, 3));
      assert.equal(restored.habit_id, id);
      assert.equal(snapshotHabit(restored, id).lapse_count, 1);
      assert.equal((await call('abstain', { id, at: plusHours(BASE, 22), cycleStart: BASE })).status, 'cycle_failed');
      assert.deepEqual(await balance(), { gold: 95, hp: 95, current_xp: 0, is_dead: false });
    });

    await t.test('an overlapping duplicate challenge cannot hide a lapse on the same catalog habit', async () => {
      await account();
      const id = (await create('hab_no_soda')).habit_id;
      const duplicateStart = plusHours(BASE, 1);
      const duplicate = await legacyDuplicate(id, duplicateStart);
      await call('lapse', { id, at: plusHours(BASE, 2), cycleStart: BASE });
      const response = await call('abstain', {
        id: duplicate, at: plusHours(BASE, 23), cycleStart: duplicateStart, period: '2026-10-06'
      });
      assert.equal(response.status, 'cycle_failed');
      assert.ok(snapshotHabit(response, duplicate).lapse_count >= 1);
      assert.deepEqual(await balance(), { gold: 95, hp: 95, current_xp: 0, is_dead: false });
    });

    await t.test('request ids cannot be reused for a different action, habit or measurement', async () => {
      await account();
      const first = (await create('hab_no_soda')).habit_id;
      const second = (await create('hab_no_junk')).habit_id;
      const requestId = randomUUID();
      await call('lapse', { id: first, requestId });
      const before = await balance();
      for (const args of [
        ['lapse', { id: second, requestId }],
        ['abstain', { id: first, requestId, at: plusHours(BASE, 22), cycleStart: BASE }],
        ['lapse', { id: first, requestId, value: 5 }]
      ]) await assert.rejects(call(...args), error => error.code === '22023');
      assert.deepEqual(await balance(), before);
      await assert.rejects(call('lapse', { id: first, config: { request_id: null } }), error => error.code === '22023');
      await assert.rejects(call('complete', { id: first }), error => error.code === '22023');
      const positive = (await create()).habit_id;
      await assert.rejects(call('lapse', { id: positive }), error => error.code === '22023');
      await assert.rejects(call('abstain', { id: positive }), error => error.code === '22023');
    });

    await t.test('abstaining and then reporting a lapse cannot erase two prior misses', async () => {
      await account();
      const id = (await create('hab_no_soda')).habit_id;
      const thirdStart = plusHours(BASE, 48);
      const abstained = await call('abstain', {
        id, at: plusHours(BASE, 70), cycleStart: thirdStart
      });
      assert.equal(abstained.status, 'abstained');
      assert.equal(snapshotHabit(abstained, id).missed_cycles, 2);
      const lapsed = await call('lapse', {
        id, at: plusHours(BASE, 71), cycleStart: thirdStart
      });
      assert.equal(lapsed.status, 'lapsed');
      const beforeArchive = await balance();
      assert.equal((await call('abstain', {
        id, at: plusHours(BASE, 71.5), cycleStart: thirdStart
      })).status, 'cycle_failed');
      assert.deepEqual(await balance(), beforeArchive);
      const archived = await call('list', { at: plusHours(BASE, 72) });
      assert.equal(snapshotHabit(archived, id), undefined);
      assert.equal(archived.avatar.gold, beforeArchive.gold - 15);
      assert.equal(archived.avatar.hp, beforeArchive.hp - 15);
    });

    await t.test('penalties clamp at zero without making currency or health negative', async () => {
      await account({ gold: 3, hp: 4 });
      const id = (await create('hab_no_junk')).habit_id;
      const result = await call('lapse', { id });
      assert.equal(result.status, 'lapsed');
      assert.deepEqual(await balance(), { gold: 0, hp: 0, current_xp: 0, is_dead: true });
      await call('lapse', { id, at: plusHours(BASE, 1), cycleStart: BASE });
      assert.deepEqual(await balance(), { gold: 0, hp: 0, current_xp: 0, is_dead: true });
    });

    await t.test('daily boundaries retain local activation time through daylight saving changes', async () => {
      await account();
      const start = '2026-10-31T18:00:00Z';
      const created = await create('hab_teeth', 'daily', start, 'America/New_York');
      const id = created.habit_id;
      const end = snapshotHabit(created, id).cycle_end_at;
      assert.equal(timestamp(end), timestamp('2026-11-01T19:00:00Z'));
      const first = await call('complete', { id, at: '2026-11-01T05:30:00Z', cycleStart: start, period: '2026-10-31' });
      assert.equal(first.status, 'completed');
      assert.equal((await call('complete', { id, at: '2026-11-01T06:30:00Z', cycleStart: start, period: '2026-10-31' })).status, 'already_recorded');
      assert.equal((await call('complete', { id, at: end, cycleStart: end, period: '2026-11-01' })).status, 'completed');
    });

    await t.test('failed storage rolls back reward, cycle completion and request deduplication together', async () => {
      await account();
      const id = (await create()).habit_id;
      const requestId = randomUUID();
      const before = await balance();
      await db.exec("CREATE FUNCTION reject_cycle_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated storage failure'; END $$; CREATE TRIGGER reject_cycle_activity BEFORE INSERT ON public.habit_activity FOR EACH ROW EXECUTE FUNCTION reject_cycle_activity()");
      try {
        await assert.rejects(call('complete', { id, requestId }));
        assert.deepEqual(await balance(), before);
      } finally {
        await db.exec('DROP TRIGGER reject_cycle_activity ON public.habit_activity');
      }
      assert.equal((await call('complete', { id, requestId })).status, 'completed');
    });

    await t.test('another account cannot mutate a habit or reuse its rewards, and clients cannot supply the clock', async () => {
      await account();
      const ownerHabit = (await create()).habit_id;
      const requestId = randomUUID();
      await call('complete', { id: ownerHabit, requestId });
      const stranger = await account();
      await assert.rejects(call('complete', { id: ownerHabit }), error => error.code === '42501');
      const ownHabit = (await create()).habit_id;
      assert.equal((await call('complete', { id: ownHabit, requestId })).status, 'completed');
      await db.exec('SET ROLE authenticated');
      try {
        for (const sql of [
          "UPDATE public.habits SET cycle_end_at='2000-01-01'",
          'DELETE FROM public.habit_activity',
          "SELECT public.habit_action_at('list',NULL,'{}',NULL,NULL,'2100-01-01')"
        ]) await assert.rejects(db.exec(sql), error => error.code === '42501');
        assert.ok((await db.query('SELECT DISTINCT user_id FROM public.habit_activity')).rows.every(row => row.user_id === stranger));
        const before = (await db.query('SELECT clock_timestamp() AS time')).rows[0].time;
        const response = (await db.query(
          "SELECT public.habit_action('create',NULL,$1::jsonb,NULL,NULL) AS result",
          [JSON.stringify({ catalog_id: 'hab_sun', frequency: 'daily', timezone: 'UTC', now: '2100-01-01', cycle_start_at: '2100-01-01' })]
        )).rows[0].result;
        const created = snapshotHabit(response, response.habit_id);
        assert.ok(timestamp(created.cycle_start_at) >= timestamp(before));
        assert.ok(timestamp(created.cycle_start_at) < timestamp('2100-01-01'));
      } finally {
        await db.exec('RESET ROLE');
      }
    });
  } finally {
    await db.close();
  }
});
