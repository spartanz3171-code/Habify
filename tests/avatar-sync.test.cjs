const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');

test('an older avatar save cannot overwrite rewards from another device',async()=>{
 const ctx=vm.createContext({window:{},console,Promise,Date});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/data.js'),'utf8'),ctx);
 const filters={};let notice=false;
 const fresh={game_revision:5,gold:90,current_xp:25,xp_to_level:100,level:1,hp:100,max_hp:100,is_dead:false};
 ctx.client={from:()=>{let updating=false;const q={update(){updating=true;return q;},eq(k,v){if(updating)filters[k]=v;return q;},select(){return q;},single(){return Promise.resolve({data:fresh});},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return q;}};
 ctx.App={updateHeader(){},showToast(){notice=true;}};
 ctx.HabitProgress={text:es=>es,syncAvatar(row){ctx.fresh=row;}};
 vm.runInContext("supabase=client;GameState.user={id:'u'};GameState.avatarId='a';rememberAvatarBalance({game_revision:1,gold:50,current_xp:0,xp_to_level:100,level:1,hp:100,max_hp:100,is_dead:false});GameState.avatar.gold=60;",ctx);
 await assert.rejects(vm.runInContext('saveAvatarToDB()',ctx),/Concurrent avatar update/);
 assert.equal(filters.gold,50);assert.equal(filters.current_xp,0);assert.equal(filters.user_id,'u');
 assert.equal(ctx.fresh.gold,90);assert.equal(notice,true);
});
