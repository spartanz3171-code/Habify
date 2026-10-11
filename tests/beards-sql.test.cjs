const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('beard migration preserves accounts, paid equipment and legacy client choices', async t => {
    const db = new PGlite();
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
            CREATE TABLE auth.users (id uuid PRIMARY KEY);
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
            CREATE TABLE public.avatars (id text PRIMARY KEY, user_id uuid REFERENCES auth.users(id), gold integer DEFAULT 250, updated_at timestamptz DEFAULT now());
            INSERT INTO auth.users VALUES ('${owner}'),('${other}');`);
        await db.exec(sql('supabase_customization.sql'));
        await db.exec(sql('supabase_beards.sql'));
        await db.query('INSERT INTO avatars(id,user_id) VALUES ($1,$2),($3,$4)', ['a', owner, 'b', other]);
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
        await db.exec('SET ROLE authenticated');
        const save = async (appearance, id = 'a') => (await db.query('SELECT save_avatar_appearance($1,$2::jsonb) AS result', [id, JSON.stringify(appearance)])).rows[0].result;
        const read = async () => { await db.exec('RESET ROLE'); const rows = (await db.query('SELECT * FROM avatars ORDER BY id')).rows; await db.exec('SET ROLE authenticated'); return rows; };

        await t.test('every free style saves, unknown fields are stripped and gold remains unchanged', async () => {
            assert.deepEqual((await read())[0].appearance, {});
            for (const beardStyle of ['none', 'short', 'goatee', 'long', 'braided', 'default']) {
                const r = await save({ beardStyle, hairColor: '#C6C4D9', headwear: 'none' });
                assert.equal(r.status, 'saved');
                assert.equal(r.appearance.beardStyle, beardStyle);
                assert.equal(r.appearance.hairColor, '#c6c4d9');
            }
            const r = await save({ beardStyle: '<script>', injected: 'field' });
            assert.equal(r.appearance.beardStyle, 'default');
            assert.equal(r.appearance.injected, undefined);
            assert.deepEqual((await read()).map(a => a.gold), [250, 250]);
        });

        await t.test('a legacy payload keeps both the beard and purchased headwear', async () => {
            await db.query("SELECT purchase_avatar_cosmetic('a','headwear_guardian')");
            await save({ beardStyle: 'braided', headwear: 'headwear_guardian' });
            const r = await save({ hairStyle: 'long', body: 'male' });
            assert.equal(r.appearance.beardStyle, 'braided');
            assert.equal(r.appearance.headwear, 'headwear_guardian');
            assert.equal((await read())[0].gold, 140);
        });

        await t.test('free beards do not grant locked cosmetics or writes to another account', async () => {
            await assert.rejects(save({ beardStyle: 'none', headwear: 'headwear_winged' }), e => e.code === '42501');
            assert.equal((await save({ beardStyle: 'none' }, 'b')).status, 'avatar_not_found');
            const rows = await read();
            assert.equal(rows[0].appearance.beardStyle, 'braided');
            assert.deepEqual(rows[1].appearance, {});
            await db.exec('SET ROLE anon');
            await assert.rejects(save({ beardStyle: 'none' }), e => e.code === '42501');
            await db.exec('SET ROLE authenticated');
        });

        await t.test('reapplying current appearance migrations retains choices, inventory and balances', async () => {
            const before = await read();
            await db.exec('RESET ROLE');
            const owned = (await db.query('SELECT * FROM avatar_cosmetics')).rows;
            for (const file of ['supabase_beards.sql', 'supabase_headwear.sql', 'supabase_customization.sql', 'supabase_beards.sql']) await db.exec(sql(file));
            assert.deepEqual((await db.query('SELECT * FROM avatar_cosmetics')).rows, owned);
            await db.exec('SET ROLE authenticated');
            assert.deepEqual(await read(), before);
            assert.equal((await save({ hairStyle: 'short' })).appearance.beardStyle, 'braided');
        });
    } finally { await db.close(); }
});
