const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

function harness({ migration = true, inventory = [], storageBlocked = false, catalog = [
    { id: 'acc_scarf', cost: 35, enabled: true },
    { id: 'outfit_ranger', cost: 80, enabled: true },
    { id: 'headwear_guardian', cost: 110, enabled: true },
    { id: 'headwear_winged', cost: 150, enabled: true },
    { id: 'headwear_arcane', cost: 130, enabled: true }
] } = {}) {
    const storage = new Map();
    const calls = [];
    const state = { migration, inventory, catalog, rpc: null, update: null };
    const client = {
        from(table) {
            const query = {
                payload: null,
                select() { return query; },
                eq() { return query; },
                update(payload) { query.payload = payload; return query; },
                then(resolve, reject) {
                    let answer;
                    if (query.payload) {
                        calls.push({ table, payload: query.payload });
                        answer = state.update ? state.update(query.payload) : { data: null, error: null };
                    } else if (!state.migration) {
                        answer = { error: { code: '42P01' } };
                    } else if (table === 'avatar_cosmetic_catalog') {
                        answer = { data: state.catalog };
                    } else {
                        answer = { data: state.inventory.map(item_id => ({ item_id })) };
                    }
                    return Promise.resolve(answer).then(resolve, reject);
                }
            };
            return query;
        },
        rpc(name, args) {
            calls.push({ name, args });
            if (state.rpc) return state.rpc(name, args);
            if (!state.migration) return Promise.resolve({ error: { code: 'PGRST202' } });
            return Promise.resolve({ data: { status: 'saved', appearance: args.p_appearance } });
        }
    };
    const context = vm.createContext({
        console, Promise, Date, Set, Map,
        window: {},
        I18N: { current: 'es' },
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); }
        }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/characters.js'), 'utf8'), context);
    context.CharacterArt = context.window.CharacterArt;
    vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/wardrobe.js'), 'utf8'), context);
    context.client = client;
    vm.runInContext("supabase = client; GameState.user = { id: 'user-a' }; GameState.avatarId = 'avatar-a'; GameState.avatar.gold = 100;", context);
    const game = vm.runInContext('GameState', context);
    return { context, game, state, storage, calls, wardrobe: context.window.Wardrobe };
}

test('free edits fall back locally before migration, preserve class, and reload only for their account', async () => {
    const h = harness({ migration: false });
    h.game.avatar.avatarClass = 'mage';
    await h.wardrobe.hydrate({});
    const saved = await h.wardrobe.saveAppearance({ body: 'female', hairStyle: 'braids', headwear: 'none' });
    assert.equal(saved.status, 'local');
    assert.equal(saved.ok, true);
    assert.equal(h.game.avatar.avatarClass, 'mage');
    assert.equal(h.game.avatar.appearance.body, 'female');
    assert.equal(h.game.avatar.appearance.headwear, 'none');
    assert.equal(h.game.cosmeticsReady, false);
    const beforeGold = h.game.avatar.gold;
    assert.equal((await h.wardrobe.purchase('acc_scarf')).code, 'unavailable');
    assert.equal(h.game.avatar.gold, beforeGold);
    assert.equal(h.wardrobe.owns('acc_scarf'), false);
    h.wardrobe.reset();
    h.game.user = { id: 'user-b' };
    h.game.avatarId = 'avatar-b';
    await h.wardrobe.hydrate({});
    assert.equal(h.game.avatar.appearance.body, 'male');
    assert.equal(h.game.avatar.appearance.headwear, 'default');
    h.game.user = { id: 'user-a' };
    h.game.avatarId = 'avatar-a';
    await h.wardrobe.hydrate({});
    assert.equal(h.game.avatar.appearance.body, 'female');
    assert.equal(h.game.avatar.appearance.headwear, 'none');
    assert.equal(h.game.appearanceSaveStatus, 'local');
});

test('signup appearance works after email confirmation without granting metadata cosmetics', async () => {
    const h = harness();
    h.game.user.user_metadata = { appearance: { body: 'female', hairStyle: 'long', outfit: 'outfit_ranger', headwear: 'headwear_winged' } };
    await h.wardrobe.hydrate({ appearance: {} });
    assert.equal(h.game.avatar.appearance.body, 'female');
    assert.equal(h.game.avatar.appearance.outfit, 'default');
    assert.equal(h.game.avatar.appearance.headwear, 'default');
    assert.equal(h.wardrobe.owns('headwear_winged'), false);
    h.game.user.user_metadata.appearance.headwear = 'none';
    await h.wardrobe.hydrate({ appearance: {} });
    assert.equal(h.game.avatar.appearance.headwear, 'none');
    assert.equal(h.game.avatar.appearance.body, 'female');
});

test('class headwear can be removed, saved to the account, reloaded and restored without changing class', async () => {
    const h = harness();
    h.game.avatar.avatarClass = 'mage';
    await h.wardrobe.hydrate({ appearance: { body: 'female', hairStyle: 'ponytail' } });
    assert.equal(h.game.avatar.appearance.headwear, 'default');
    assert.equal((await h.wardrobe.unequip('headwear')).status, 'cloud');
    const cloud = JSON.parse(JSON.stringify(h.calls.at(-1).args.p_appearance));
    assert.equal(cloud.headwear, 'none');
    assert.equal(JSON.parse(h.storage.get('habify_appearance_v1_user-a')).pending, false);
    h.wardrobe.reset();
    await h.wardrobe.hydrate({ appearance: cloud });
    assert.equal(h.game.avatar.appearance.headwear, 'none');
    assert.equal(h.game.avatar.appearance.hairStyle, 'ponytail');
    assert.equal((await h.wardrobe.saveAppearance({ ...h.game.avatar.appearance, headwear: 'default' })).status, 'cloud');
    assert.equal(h.game.avatar.appearance.headwear, 'default');
    assert.equal(h.game.avatar.avatarClass, 'mage');
});

test('each paid headwear item requires ownership, buys once and equips independently of accessories', async () => {
    for (const [id, cost] of [['headwear_guardian', 110], ['headwear_winged', 150], ['headwear_arcane', 130]]) {
        const h = harness({ inventory: ['acc_scarf'] });
        h.game.avatar.gold = 500;
        await h.wardrobe.hydrate({ appearance: { headwear: 'none', accessory: 'acc_scarf', body: 'female' } });
        assert.equal((await h.wardrobe.equip(id)).code, 'not_owned');
        assert.equal((await h.wardrobe.saveAppearance({ headwear: id })).code, 'not_owned');
        assert.equal(h.calls.length, 0);
        let cloud;
        h.state.rpc = (name, args) => {
            if (name === 'purchase_avatar_cosmetic') {
                h.state.inventory.push(id);
                return Promise.resolve({ data: { status: 'purchased', item_id: args.p_item_id, gold: 500 - cost } });
            }
            cloud = JSON.parse(JSON.stringify(args.p_appearance));
            return Promise.resolve({ data: { status: 'saved', appearance: cloud } });
        };
        assert.equal((await h.wardrobe.purchase(id)).ok, true);
        assert.equal(h.game.avatar.gold, 500 - cost);
        assert.equal(h.game.avatar.appearance.headwear, 'none');
        assert.equal((await h.wardrobe.purchase(id)).code, 'already_owned');
        assert.equal(h.calls.filter(call => call.name === 'purchase_avatar_cosmetic').length, 1);
        assert.equal((await h.wardrobe.equip(id)).status, 'cloud');
        assert.equal(h.game.avatar.appearance.headwear, id);
        assert.equal(h.game.avatar.appearance.accessory, 'acc_scarf');
        assert.equal(h.game.avatar.appearance.body, 'female');
        h.wardrobe.reset();
        await h.wardrobe.hydrate({ appearance: cloud });
        assert.equal(h.wardrobe.owns(id), true);
        assert.equal(h.game.avatar.appearance.headwear, id);
    }
});

test('a legacy validator keeps free headwear pending locally with cloud-validated fields until syncing succeeds', async () => {
    for (const headwear of ['default', 'none']) {
        const h = harness({ catalog: [{ id: 'acc_scarf', cost: 35, enabled: true }] });
        await h.wardrobe.hydrate({ appearance: { body: 'male' } });
        let cloud;
        h.state.rpc = (_name, args) => {
            const { headwear: omitted, ...validated } = args.p_appearance;
            cloud = { ...validated, skin: '#abcdef', hairStyle: 'short' };
            return Promise.resolve({ data: { status: 'saved', appearance: cloud } });
        };
        const saved = await h.wardrobe.saveAppearance({ body: 'female', hairStyle: 'braids', skin: '#f3c6a0', headwear });
        assert.equal(saved.ok, true);
        assert.equal(saved.status, 'local');
        assert.equal(h.game.appearanceSaveStatus, 'local');
        assert.equal(h.game.avatar.appearance.headwear, headwear);
        assert.equal(h.game.avatar.appearance.skin, '#abcdef');
        assert.equal(h.game.avatar.appearance.hairStyle, 'short');
        assert.equal(JSON.parse(h.storage.get('habify_appearance_v1_user-a')).pending, true);
        assert.equal((await h.wardrobe.purchase('headwear_guardian')).code, 'unavailable');
        h.wardrobe.reset();
        await h.wardrobe.hydrate({ appearance: cloud });
        assert.equal(h.game.avatar.appearance.headwear, headwear);
        assert.equal(h.game.avatar.appearance.skin, '#abcdef');
        assert.equal(h.game.appearanceSaveStatus, 'local');
        h.state.rpc = null;
        assert.equal((await h.wardrobe.saveAppearance(h.game.avatar.appearance)).status, 'cloud');
        assert.equal(JSON.parse(h.storage.get('habify_appearance_v1_user-a')).pending, false);
    }
});

test('missing or different headwear confirmation cannot report a successful paid equip', async () => {
    for (const returnedHeadwear of [undefined, 'default']) {
        const h = harness({ inventory: ['headwear_guardian'] });
        await h.wardrobe.hydrate({ appearance: { headwear: 'none', body: 'female' } });
        h.state.rpc = (_name, args) => {
            const { headwear: omitted, ...appearance } = args.p_appearance;
            if (returnedHeadwear !== undefined) appearance.headwear = returnedHeadwear;
            return Promise.resolve({ data: { status: 'saved', appearance } });
        };
        const saved = await h.wardrobe.equip('headwear_guardian');
        assert.equal(saved.ok, false);
        assert.equal(saved.code, 'headwear_not_saved');
        assert.equal(h.game.avatar.appearance.headwear, 'none');
        assert.equal(h.wardrobe.owns('headwear_guardian'), true);
        assert.equal(h.game.avatar.gold, 100);
        assert.equal(h.storage.size, 0);
    }
});

test('legacy headwear fallback fails honestly when browser storage is blocked', async () => {
    const h = harness({ storageBlocked: true });
    await h.wardrobe.hydrate({ appearance: { headwear: 'default' } });
    h.state.rpc = (_name, args) => {
        const { headwear: omitted, ...appearance } = args.p_appearance;
        return Promise.resolve({ data: { status: 'saved', appearance } });
    };
    const saved = await h.wardrobe.unequip('headwear');
    assert.equal(saved.ok, false);
    assert.equal(saved.code, 'storage_unavailable');
    assert.equal(h.game.avatar.appearance.headwear, 'default');
    assert.equal(h.storage.size, 0);
});

test('a saved response without a valid appearance object cannot claim cloud or local success', async () => {
    for (const appearance of [undefined, null, 'none', []]) {
        const h = harness();
        await h.wardrobe.hydrate({ appearance: { headwear: 'default' } });
        h.state.rpc = () => Promise.resolve({ data: { status: 'saved', appearance } });
        const saved = await h.wardrobe.unequip('headwear');
        assert.equal(saved.ok, false);
        assert.equal(saved.code, 'invalid_response');
        assert.equal(h.game.avatar.appearance.headwear, 'default');
        assert.equal(h.storage.size, 0);
    }
});

test('cloud saves clear pending local edits; ordinary avatar saves never write appearance', async () => {
    const h = harness({ migration: false });
    await h.wardrobe.hydrate({});
    await h.wardrobe.saveAppearance({ body: 'female' });
    h.state.migration = true;
    await h.wardrobe.hydrate({ appearance: { body: 'male' } });
    assert.equal(h.game.avatar.appearance.body, 'female');
    const saved = await h.wardrobe.saveAppearance(h.game.avatar.appearance);
    assert.equal(saved.status, 'cloud');
    assert.equal(JSON.parse(h.storage.get('habify_appearance_v1_user-a')).pending, false);
    await vm.runInContext('saveAvatarToDB()', h.context);
    assert.equal(Object.hasOwn(h.calls.find(call => call.table === 'avatars').payload, 'appearance'), false);
});

test('locked ownership and explicit server rejections cannot become local successes', async () => {
    const h = harness();
    await h.wardrobe.hydrate({});
    assert.equal((await h.wardrobe.saveAppearance({ outfit: 'outfit_ranger' })).code, 'not_owned');
    assert.equal(h.calls.length, 0);
    h.state.rpc = () => Promise.resolve({ error: { code: '42501' } });
    assert.equal((await h.wardrobe.saveAppearance({ body: 'female' })).ok, false);
    h.state.rpc = () => Promise.resolve({ error: { code: '22023' } });
    assert.equal((await h.wardrobe.saveAppearance({ body: 'female' })).ok, false);
    assert.equal(h.storage.size, 0);
});

test('failed purchase never spends gold or grants ownership', async () => {
    const h = harness();
    await h.wardrobe.hydrate({});
    h.state.rpc = () => Promise.resolve({ error: { code: 'network' } });
    assert.equal((await h.wardrobe.purchase('acc_scarf')).ok, false);
    assert.equal(h.game.avatar.gold, 100);
    assert.equal(h.wardrobe.owns('acc_scarf'), false);
    h.state.rpc = () => Promise.resolve({ data: { status: 'insufficient_gold', gold: 10 } });
    assert.equal((await h.wardrobe.purchase('outfit_ranger')).code, 'insufficient_gold');
    assert.equal(h.game.avatar.gold, 100);
});

test('confirmed purchase equips only on request, and duplicate requests do not spend twice', async () => {
    const h = harness();
    await h.wardrobe.hydrate({});
    h.state.rpc = (name, args) => Promise.resolve({ data: name === 'purchase_avatar_cosmetic'
        ? { status: 'purchased', item_id: 'acc_scarf', gold: 65 }
        : { status: 'saved', appearance: args.p_appearance } });
    assert.equal((await h.wardrobe.purchase('acc_scarf')).ok, true);
    assert.equal(h.game.avatar.gold, 65);
    assert.equal(h.game.avatar.appearance.accessory, 'none');
    assert.equal((await h.wardrobe.purchase('acc_scarf')).code, 'already_owned');
    assert.equal(h.calls.length, 1);
    assert.equal((await h.wardrobe.equip('acc_scarf')).status, 'cloud');
    assert.equal(h.game.avatar.appearance.accessory, 'acc_scarf');
    assert.equal((await h.wardrobe.unequip('accessory')).ok, true);
    assert.equal(h.game.avatar.appearance.accessory, 'none');
});

test('in-flight purchase preserves new habit gold and serializes a pending avatar save', async () => {
    const h = harness();
    const pending = deferred();
    await h.wardrobe.hydrate({});
    h.state.rpc = () => pending.promise;
    const purchase = h.wardrobe.purchase('acc_scarf');
    await Promise.resolve();
    h.game.avatar.gold += 10;
    const save = vm.runInContext('saveAvatarToDB()', h.context);
    assert.equal(h.calls.filter(call => call.table === 'avatars').length, 0);
    pending.resolve({ data: { status: 'purchased', item_id: 'acc_scarf', gold: 65 } });
    await purchase;
    await save;
    assert.equal(h.game.avatar.gold, 75);
    assert.equal(h.calls.find(call => call.table === 'avatars').payload.gold, 75);
});

test('a late response cannot update the next signed-in account', async () => {
    const h = harness();
    const pending = deferred();
    await h.wardrobe.hydrate({});
    h.state.rpc = () => pending.promise;
    const purchase = h.wardrobe.purchase('acc_scarf');
    await Promise.resolve();
    h.wardrobe.reset();
    h.game.user = { id: 'user-b' };
    h.game.avatarId = 'avatar-b';
    pending.resolve({ data: { status: 'purchased', item_id: 'acc_scarf', gold: 65 } });
    assert.equal((await purchase).code, 'session_changed');
    assert.equal(h.game.avatar.gold, 100);
    assert.equal(h.wardrobe.owns('acc_scarf'), false);
    assert.equal(h.calls[0].args.p_avatar_id, 'avatar-a');
});

test('a delayed avatar load cannot overwrite an account loaded after a session switch', async () => {
    const h = harness();
    const oldAvatar = deferred();
    const avatar = (id, body) => ({
        id: `avatar-${id}`, user_id: `user-${id}`, name: `Account ${id}`,
        level: 1, current_xp: 0, xp_to_level: 100, gold: id === 'a' ? 100 : 250,
        hp: 100, max_hp: 100, is_dead: false, avatar_class: 'hero', appearance: { body }
    });
    h.context.client.from = table => {
        const filters = {};
        const query = {
            select() { return query; },
            eq(field, value) { filters[field] = value; return query; },
            order() { return query; },
            limit() { return query; },
            single() {
                return filters.user_id === 'user-a' ? oldAvatar.promise : Promise.resolve({ data: avatar('b', 'female') });
            },
            then(resolve, reject) {
                const data = table === 'habits' ? [{ id: `habit-${filters.avatar_id}`, title: 'Read', type: 'positive' }] : [];
                return Promise.resolve({ data }).then(resolve, reject);
            }
        };
        return query;
    };
    const loadA = vm.runInContext('loadGameFromDB()', h.context);
    h.game.user = { id: 'user-b' };
    h.game.avatarId = 'avatar-b';
    assert.equal(await vm.runInContext('loadGameFromDB()', h.context), true);
    assert.equal(h.game.avatar.name, 'Account b');
    oldAvatar.resolve({ data: avatar('a', 'male') });
    assert.equal(await loadA, false);
    assert.equal(h.game.user.id, 'user-b');
    assert.equal(h.game.avatarId, 'avatar-b');
    assert.equal(h.game.avatar.name, 'Account b');
    assert.equal(h.game.avatar.gold, 250);
    assert.equal(h.game.avatar.appearance.body, 'female');
    assert.equal(h.game.habits[0].id, 'habit-avatar-b');
});

test('blocked browser storage cannot report a successful offline save', async () => {
    const h = harness({ migration: false, storageBlocked: true });
    await h.wardrobe.hydrate({});
    const saved = await h.wardrobe.saveAppearance({ body: 'female' });
    assert.equal(saved.ok, false);
    assert.equal(saved.code, 'storage_unavailable');
    assert.equal(h.game.avatar.appearance.body, 'male');
});
