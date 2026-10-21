const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('facial features remain account-owned and compatible with existing appearances', async t => {
    const db = new PGlite();
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const face = { eyeShape: 'almond', mouthStyle: 'grin', noseShape: 'straight', browStyle: 'arched', eyeColor: '#28bd83' };
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
            CREATE TABLE auth.users (id uuid PRIMARY KEY);
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
            CREATE TABLE public.avatars (id text PRIMARY KEY, user_id uuid REFERENCES auth.users(id), gold integer DEFAULT 500, appearance jsonb NOT NULL DEFAULT '{}', updated_at timestamptz DEFAULT now());
            INSERT INTO auth.users VALUES ('${owner}'),('${other}');
            INSERT INTO avatars(id,user_id,appearance) VALUES ('a','${owner}','{"body":"female","beardStyle":"short","headwear":"none"}'),('b','${other}','{}');`);
        const before = (await db.query('SELECT * FROM avatars ORDER BY id')).rows;
        await db.exec(sql('supabase_customization.sql'));
        assert.deepEqual((await db.query('SELECT * FROM avatars ORDER BY id')).rows, before);
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
        await db.exec('SET ROLE authenticated');
        const save = async (appearance, id = 'a') => (await db.query('SELECT save_avatar_appearance($1,$2::jsonb) AS result', [id, JSON.stringify(appearance)])).rows[0].result;
        const read = async () => { await db.exec('RESET ROLE'); const rows = (await db.query('SELECT * FROM avatars ORDER BY id')).rows; await db.exec('SET ROLE authenticated'); return rows; };

        await t.test('the fresh installation validates every shape and both custom and default eye colors', async () => {
            const choices = [
                { eyeShape: 'round', mouthStyle: 'smile', noseShape: 'button', browStyle: 'soft', eyeColor: '#88AACC' },
                face,
                { eyeShape: 'focused', mouthStyle: 'serious', noseShape: 'broad', browStyle: 'bold', eyeColor: '#b27432' },
                { eyeShape: 'classic', mouthStyle: 'classic', noseShape: 'classic', browStyle: 'classic', eyeColor: 'default' }
            ];
            for (const choice of choices) {
                const response = await save(choice);
                assert.equal(response.status, 'saved');
                for (const [key, value] of Object.entries(choice)) assert.equal(response.appearance[key], value.toLowerCase());
                assert.equal(response.appearance.beardStyle, 'short');
                assert.equal(response.appearance.headwear, 'none');
            }
            const invalid = await save({ eyeShape: '<script>', mouthStyle: { html: 'x' }, noseShape: ['button'], browStyle: 'unknown', eyeColor: 'url(javascript:x)', injected: 'field' });
            assert.equal(invalid.appearance.eyeShape, 'classic');
            assert.equal(invalid.appearance.mouthStyle, 'classic');
            assert.equal(invalid.appearance.noseShape, 'classic');
            assert.equal(invalid.appearance.browStyle, 'classic');
            assert.equal(invalid.appearance.eyeColor, 'default');
            assert.equal(invalid.appearance.injected, undefined);
            await assert.rejects(save(['round']), e => e.code === '22023');
            assert.deepEqual((await read()).map(a => a.gold), [500, 500]);
        });

        await t.test('installing and reapplying the facial patch does not rewrite accounts or inventory', async () => {
            await db.query("SELECT purchase_avatar_cosmetic('a','headwear_guardian')");
            await save({ ...face, beardStyle: 'braided', headwear: 'headwear_guardian' });
            const before = await read();
            await db.exec('RESET ROLE');
            const owned = (await db.query('SELECT * FROM avatar_cosmetics')).rows;
            for (const file of ['supabase_facial_features.sql', 'supabase_facial_features.sql', 'supabase_beards.sql', 'supabase_headwear.sql', 'supabase_customization.sql']) {
                await db.exec(sql(file));
                assert.deepEqual((await db.query('SELECT * FROM avatars ORDER BY id')).rows, before);
                assert.deepEqual((await db.query('SELECT * FROM avatar_cosmetics')).rows, owned);
            }
            await db.exec('SET ROLE authenticated');
            const response = await save({ hairStyle: 'long', body: 'female' });
            for (const [key, value] of Object.entries(face)) assert.equal(response.appearance[key], value);
            assert.equal(response.appearance.headwear, 'headwear_guardian');
            assert.equal(response.appearance.beardStyle, 'braided');
            assert.equal((await read())[0].gold, 390);
        });

        await t.test('free facial features cannot unlock cosmetics or alter another account', async () => {
            const before = await read();
            await assert.rejects(save({ ...face, outfit: 'outfit_arcane' }), e => e.code === '42501');
            await assert.rejects(save({ ...face, accessory: 'acc_scarf' }), e => e.code === '42501');
            await assert.rejects(save({ ...face, headwear: 'headwear_winged' }), e => e.code === '42501');
            assert.equal((await save(face, 'b')).status, 'avatar_not_found');
            await db.exec('SET ROLE anon');
            await assert.rejects(save(face), e => e.code === '42501');
            await db.exec('SET ROLE authenticated');
            assert.deepEqual(await read(), before);
            await db.exec('RESET ROLE');
            assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.validate_avatar_appearance()','EXECUTE') AS allowed")).rows[0].allowed, false);
            await assert.rejects(db.query("UPDATE avatars SET appearance = $1 WHERE id = 'a'", [JSON.stringify({ ...face, headwear: 'headwear_winged' })]), e => e.code === '42501');
            await db.exec('SET ROLE authenticated');
        });
    } finally { await db.close(); }
});
