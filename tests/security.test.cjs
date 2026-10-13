const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFixture, user, other } = require('./helpers/habit-db.cjs');
const hardening = fs.readFileSync(path.join(__dirname, '../supabase_security_hardening.sql'), 'utf8');

test('server admin permission and account boundaries survive permissive legacy policies', async t => {
    const db = await createFixture();
    try {
        await db.exec(`CREATE TABLE shop_items(id text PRIMARY KEY,name text,cost integer,icon text,type text,description text);
            CREATE TABLE monsters(id serial PRIMARY KEY,name text,base_hp integer);
            CREATE TABLE inventory(avatar_id text REFERENCES avatars(id),item_id text);
            CREATE TABLE battle_log(avatar_id text REFERENCES avatars(id),opponent text);
            CREATE TABLE admin_settings(key text PRIMARY KEY,value jsonb);
            INSERT INTO shop_items VALUES ('sword','Sword',25,'X','weapon','');
            INSERT INTO monsters(name,base_hp) VALUES('Goblin',80);
            INSERT INTO inventory VALUES('a','sword'),('b','staff');
            INSERT INTO battle_log VALUES('a','Goblin'),('b','Orc');
            GRANT ALL ON avatars,shop_items,monsters,inventory,battle_log,admin_settings TO authenticated,anon;
            CREATE POLICY legacy_open ON avatars FOR ALL TO authenticated USING(true) WITH CHECK(true);
            CREATE POLICY legacy_open ON shop_items FOR ALL TO authenticated USING(true) WITH CHECK(true);
            CREATE POLICY legacy_open ON monsters FOR ALL TO authenticated USING(true) WITH CHECK(true);
            CREATE POLICY legacy_open ON inventory FOR ALL TO authenticated USING(true) WITH CHECK(true);
            CREATE POLICY legacy_open ON battle_log FOR ALL TO authenticated USING(true) WITH CHECK(true);
            CREATE POLICY "Admins can view all avatars" ON avatars FOR SELECT USING(EXISTS(SELECT 1 FROM avatars WHERE user_id=auth.uid() AND is_admin));`);
        await db.exec(hardening);
        const asUser = async uid => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid || '']); await db.exec('SET ROLE ' + (uid ? 'authenticated' : 'anon')); };
        await asUser(user);
        await t.test('email and editable metadata do not confer admin; another account is inaccessible', async () => {
            await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ email: 'admin@example.org', user_metadata: { is_admin: true } })]);
            assert.equal((await db.query('SELECT habify_is_admin() AS allowed')).rows[0].allowed, false);
            assert.deepEqual((await db.query('SELECT id FROM avatars')).rows.map(r => r.id), ['a']);
            assert.equal((await db.query("UPDATE avatars SET gold=9999 WHERE id='b' RETURNING id")).rows.length, 0);
            assert.deepEqual((await db.query('SELECT avatar_id FROM inventory')).rows.map(r => r.avatar_id), ['a']);
            assert.equal((await db.query("UPDATE inventory SET item_id='sword' WHERE avatar_id='b' RETURNING *")).rows.length, 0);
            await assert.rejects(db.query("INSERT INTO inventory VALUES('b','stolen')"), e => e.code === '42501');
        });
        await t.test('role, identity, global catalog and settings cannot be changed by ordinary players', async () => {
            for (const query of ["UPDATE avatars SET is_admin=true WHERE id='a'", "UPDATE avatars SET id='another' WHERE id='a'", `UPDATE avatars SET user_id='${other}' WHERE id='a'`, "INSERT INTO avatars(id,user_id,is_admin) VALUES('c',auth.uid(),true)", "INSERT INTO shop_items(id) VALUES('hacked')", "INSERT INTO admin_settings VALUES('hack','true')", "DELETE FROM avatars WHERE id='a'"]) {
                await assert.rejects(db.query(query), e => e.code === '42501', query);
            }
            assert.equal((await db.query("UPDATE shop_items SET cost=0 RETURNING *")).rows.length, 0);
            assert.equal((await db.query("UPDATE monsters SET base_hp=1 RETURNING *")).rows.length, 0);
            assert.equal((await db.query('SELECT * FROM shop_items')).rows.length, 1);
            // Ordinary profile and habit operations still work.
            assert.equal((await db.query("UPDATE avatars SET name='Hero' WHERE id='a' RETURNING id")).rows.length, 1);
            assert.equal((await db.query("SELECT habit_action('list',null,'{}',null,null) AS result")).rows[0].result.rules_version, 3);
        });
        await t.test('signed-out visitors cannot read private data or call the admin check', async () => {
            await asUser(null);
            for (const query of ['SELECT * FROM avatars', 'SELECT * FROM inventory', 'SELECT * FROM battle_log', 'SELECT habify_is_admin()']) await assert.rejects(db.query(query), e => e.code === '42501');
            assert.equal((await db.query('SELECT * FROM monsters')).rows.length, 1);
        });
        await t.test('only a database-assigned admin can manage other accounts and the catalog', async () => {
            await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
            await db.query("UPDATE avatars SET is_admin=true WHERE id='a'");
            await asUser(user);
            assert.equal((await db.query('SELECT habify_is_admin() AS allowed')).rows[0].allowed, true);
            assert.equal((await db.query('SELECT id FROM avatars')).rows.length, 2);
            assert.equal((await db.query("UPDATE avatars SET gold=gold+100 WHERE id='b' RETURNING gold")).rows[0].gold, 150);
            assert.equal((await db.query("UPDATE shop_items SET cost=30 RETURNING cost")).rows[0].cost, 30);
            await assert.rejects(db.query("UPDATE avatars SET is_admin=true WHERE id='b'"), e => e.code === '42501');
            const before = (await db.query('SELECT id,gold,is_admin FROM avatars ORDER BY id')).rows;
            await db.exec('RESET ROLE'); await db.exec(hardening);
            await asUser(user);
            assert.deepEqual((await db.query('SELECT id,gold,is_admin FROM avatars ORDER BY id')).rows, before);
        });
    } finally { await db.close(); }
});
