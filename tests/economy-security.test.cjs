const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createFixture, user } = require('./helpers/habit-db.cjs');
const migration = fs.readFileSync(path.join(__dirname, '../supabase_economy_security.sql'), 'utf8');

async function fixture({ fullMigrations = false } = {}) {
    const db = await createFixture();
    await db.exec(`
        CREATE ROLE service_role;
        ALTER TABLE public.avatars ADD COLUMN avatar_class text DEFAULT 'hero',ADD COLUMN equipped_background text,
            ADD COLUMN equipped_pet text,ADD COLUMN equipped_weapon text,ADD COLUMN equipped_shield text,ADD COLUMN equipped_spell text,
            ADD COLUMN last_penalty_check timestamptz,ADD COLUMN last_habit_modified timestamptz;
        CREATE TABLE public.shop_items(id text PRIMARY KEY,cost integer,type text DEFAULT 'weapon');
        CREATE TABLE public.inventory(avatar_id text REFERENCES public.avatars(id),item_id text REFERENCES public.shop_items(id),UNIQUE(avatar_id,item_id));
        CREATE TABLE public.monsters(id integer PRIMARY KEY);
        CREATE TABLE public.battle_log(avatar_id text REFERENCES public.avatars(id),opponent text,won boolean,xp_gained integer,gold_gained integer,hp_lost integer);
        GRANT SELECT ON public.inventory,public.shop_items TO authenticated;
        INSERT INTO public.shop_items(id,cost) VALUES('sword',30),('expensive',100),('invalid',-1);
    `);
    if (fullMigrations) {
        await db.exec(`
            CREATE POLICY inventory_read ON public.inventory FOR SELECT TO authenticated USING(true);
            CREATE POLICY battle_read ON public.battle_log FOR SELECT TO authenticated USING(true);
        `);
        for (const name of ['supabase_customization.sql','supabase_habit_cycles.sql','supabase_habit_abstinence_activation.sql','supabase_security_hardening.sql']) {
            await db.exec(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
        }
    }
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`SET request.jwt.claim.sub='${user}'; SET ROLE authenticated;`);
    return db;
}

test('shop purchases charge the server price once and deliver to the authenticated account', async () => {
    const db = await fixture();
    try {
        const purchase = async item => (await db.query('SELECT public.purchase_shop_item($1) AS result', [item])).rows[0].result;
        const first = await purchase('sword');
        assert.equal(first.status, 'purchased');
        assert.equal(first.avatar.gold, 20);
        const retry = await purchase('sword');
        assert.equal(retry.status, 'owned');
        assert.equal(retry.avatar.gold, 20);
        assert.equal((await purchase('expensive')).status, 'insufficient_gold');
        await assert.rejects(purchase('invalid'), /Invalid shop item/);
        await assert.rejects(purchase('missing'), /Invalid shop item/);
        await db.exec('RESET ROLE');
        assert.deepEqual((await db.query('SELECT * FROM public.inventory')).rows, [{ avatar_id: 'a', item_id: 'sword' }]);
        assert.equal((await db.query("SELECT gold FROM public.avatars WHERE id='b'")).rows[0].gold, 50);
    } finally { await db.close(); }
});

test('a rejected inventory insertion cannot debit the account', async () => {
    const db = await fixture();
    try {
        await db.exec(`RESET ROLE; ALTER TABLE public.inventory ADD CONSTRAINT reject_delivery CHECK (item_id<>'sword'); SET ROLE authenticated;`);
        await assert.rejects(db.query("SELECT public.purchase_shop_item('sword')"), /reject_delivery/);
        await db.exec('RESET ROLE');
        assert.equal((await db.query("SELECT gold FROM public.avatars WHERE id='a'")).rows[0].gold, 50);
        assert.equal((await db.query('SELECT * FROM public.inventory')).rows.length, 0);
        await db.exec("SET request.jwt.claim.sub=''; SET ROLE authenticated;");
        await assert.rejects(db.query("SELECT public.purchase_shop_item('sword')"), /Authentication required/);
    } finally { await db.close(); }
});

test('direct economy writes and unowned equipment are denied while profile and RPC purchases work', async () => {
    const db = await fixture();
    try {
        await assert.rejects(db.exec("UPDATE public.avatars SET gold=9999 WHERE id='a'"), /server managed/);
        await assert.rejects(db.exec("UPDATE public.avatars SET equipped_weapon='sword' WHERE id='a'"), /not owned/);
        await assert.rejects(db.exec("INSERT INTO public.inventory VALUES('a','sword')"), /permission denied/);
        await assert.rejects(db.exec("INSERT INTO public.avatars(id,user_id) VALUES('reset','" + user + "')"), /permission denied/);
        await assert.rejects(db.query('SELECT public.combat_open($1,$2)', [user, 'version']), /permission denied/);
        await db.exec("UPDATE public.avatars SET name='New name' WHERE id='a'; SELECT public.purchase_shop_item('sword'); UPDATE public.avatars SET equipped_weapon='sword' WHERE id='a';");
        assert.equal((await db.query("SELECT gold FROM public.avatars WHERE id='a'")).rows[0].gold, 20);
    } finally { await db.close(); }
});

test('only the server settles battles; retries cannot pay twice or cross accounts', async () => {
    const db = await fixture();
    try {
        await db.exec("RESET ROLE; SET request.jwt.claim.sub=''; SET ROLE service_role;");
        const open = async () => (await db.query('SELECT public.combat_open($1,$2) AS result', [user, 'version'])).rows[0].result;
        const battle = await open();
        assert.equal((await open()).id, battle.id);
        const args = [user, battle.id, true, false, 0, 20, 10, 'Enemy'];
        const settle = () => db.query('SELECT public.combat_settle($1,$2,$3,$4,$5,$6,$7,$8) AS result', args);
        await db.exec('SET ROLE authenticated');
        await assert.rejects(settle(), /permission denied/);
        await db.exec('SET ROLE service_role');
        const first = (await settle()).rows[0].result;
        assert.equal(first.avatar.gold, 60);
        assert.equal(first.avatar.current_xp, 20);
        assert.equal((await settle()).rows[0].result.avatar.gold, 60);
        const other = '00000000-0000-0000-0000-000000000002';
        assert.equal((await db.query('SELECT public.combat_read($1,$2) AS result', [other, battle.id])).rows[0].result, null);
        args[0] = other;
        await assert.rejects(settle(), /Battle not found/);
        await db.exec('RESET ROLE');
        assert.equal((await db.query('SELECT * FROM public.battle_log')).rows.length, 1);
    } finally { await db.close(); }
});

test('the combined migration preserves authoritative habit rewards, wardrobe purchases and account boundaries', async () => {
    const db = await fixture({ fullMigrations: true });
    try {
        const call = async (action, id = null, config = {}, period = null) => (await db.query(
            'SELECT public.habit_action($1,$2,$3::jsonb,NULL,$4::date) AS result', [action,id,JSON.stringify(config),period])).rows[0].result;
        const created = await call('create', null, { catalog_id: 'hab_teeth', timezone: 'UTC', frequency: 'daily' });
        assert.equal(created.rules_version, 5);
        const habit = created.habits.find(entry => entry.id === created.habit_id);
        const completed = await call('complete', habit.id, { request_id: randomUUID(), expected_cycle_start_at: habit.cycle_start_at }, habit.period);
        assert.equal(completed.status, 'completed');
        assert.ok(completed.avatar.gold > created.avatar.gold);
        const cosmetic = (await db.query("SELECT public.purchase_avatar_cosmetic('a','acc_scarf') AS result")).rows[0].result;
        assert.equal(cosmetic.status, 'purchased');
        assert.equal(cosmetic.gold, completed.avatar.gold - 35);
        assert.equal((await db.query("UPDATE public.avatars SET name='Other' WHERE id='b' RETURNING id")).rows.length, 0);
        await assert.rejects(db.query("UPDATE public.avatars SET gold=10000 WHERE id='a'"), /server managed/);
        await assert.rejects(db.query("INSERT INTO public.inventory VALUES('a','expensive')"), /permission denied/);
        await assert.rejects(db.query('SELECT * FROM public.verified_battles'), /permission denied/);
    } finally { await db.close(); }
});