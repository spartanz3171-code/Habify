const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
    const state = { admin: false, reads: 0, writes: 0, error: null };
    const ctx = vm.createContext({ window: {}, console, Promise, Date });
    ctx.client = { rpc: async () => ({ data: state.admin }), from() {
        const q = { select() { state.reads++; return q; }, order() { return q; }, eq() { return q; }, single() { return q; },
            upsert() { state.writes++; return q; }, update() { state.writes++; return q; },
            then(resolve) { return Promise.resolve({ data: null, error: state.error }).then(resolve); } };
        return q;
    } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8'), ctx);
    vm.runInContext("supabase=client;GameState.user={id:'u',email:'admin@example.org',user_metadata:{is_admin:true}};GameState.avatarId='a';GameState.isAdmin=true;GameState.shopItems=[{id:'sword',cost:25}];GameState.monsters=[{id:1,name:'Goblin'}];", ctx);
    return { state, ctx, run: code => vm.runInContext(code, ctx) };
}
test('spoofed local flags, email and metadata cannot load users or write admin data', async () => {
    const h = setup();
    assert.equal(await h.run('refreshAdminAccess()'), false);
    for (const code of ['loadAllUsersForAdmin()', "adminSaveShopItem({id:'sword',cost:0})", "adminSaveMonster({id:1,name:'Fake'})", "adminUpdateUserAvatar('a',{gold:99999})"]) await assert.rejects(h.run(code), /authorization/);
    assert.equal(h.state.reads, 0); assert.equal(h.state.writes, 0);
    assert.equal(h.run('GameState.adminUsersList.length'), 0);
});
test('server errors do not generate fake users or optimistic admin changes', async () => {
    const h = setup(); h.state.admin = true; h.state.error = { code: '42501' };
    for (const code of ['loadAllUsersForAdmin()', "adminSaveShopItem({id:'sword',cost:0})", "adminSaveMonster({id:1,name:'Fake'})", "adminUpdateUserAvatar('a',{gold:99999})"]) await assert.rejects(h.run(code));
    assert.equal(h.run('GameState.adminUsersList.length'), 0);
    assert.equal(h.run('GameState.shopItems[0].cost'), 25);
    assert.equal(h.run('GameState.monsters[0].name'), 'Goblin');
});
test('a late admin response cannot grant the next account access', async () => {
    const h = setup(); let done;
    h.ctx.client.rpc = () => new Promise(resolve => { done = resolve; });
    const pending = h.run('refreshAdminAccess()');
    h.run("GameState.user={id:'other'};GameState.isAdmin=false;");
    done({ data: true });
    assert.equal(await pending, false);
    assert.equal(h.run('GameState.isAdmin'), false);
});

test('admin editor handles numeric monster IDs and never reports a missing item as saved', async () => {
    const h = setup();
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8'), h.ctx);
    h.run("adminSaveMonster=async monster=>{window.savedMonster=monster;return true;};");
    assert.equal(await h.run("Engine.adminUpdateMonsterStats('1',{base_hp:120})"), true);
    assert.equal(h.run('window.savedMonster.id'), 1);
    assert.equal(h.run('window.savedMonster.base_hp'), 120);
    await assert.rejects(h.run("Engine.adminUpdateMonsterStats('missing',{base_hp:120})"), /not found/);
    await assert.rejects(h.run("Engine.adminUpdateShopItemPrice('missing',20)"), /not found/);
    await assert.rejects(h.run("Engine.adminUpdateShopItemPrice('sword',NaN)"), /Invalid price/);
    h.run("adminSaveMonster=async()=>{throw Error('denied');};");
    await assert.rejects(h.run("Engine.adminUpdateMonsterStats('1',{name:'Changed'})"), /denied/);
    assert.equal(h.run('GameState.monsters[0].name'), 'Goblin');
});
