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

test('account clearing removes private state and failed profile loads never show the main view', async () => {
 const ctx=vm.createContext({window:{},console,Promise,Date,clearInterval,clearTimeout,
    setTimeout: callback=>callback(), document:{getElementById:()=>({innerHTML:''}),addEventListener(){}},
  BattleScreen:{leave(){}}, Wardrobe:{reset(){}}, Atelier:{},
  HabitProgress:{pendingRequests:new Map()}, Engine:{stopGameLoop(){},checkDailyPenalties(){throw Error('must not run');}},
  Views:{renderLoading:()=>''}});
 for(const name of ['data','app']) vm.runInContext(fs.readFileSync(path.join(__dirname,`../js/${name}.js`),'utf8'),ctx);
 vm.runInContext("GameState.user={id:'old'};GameState.avatarId='old-avatar';GameState.avatar.name='Private';GameState.inventory=[{id:'private-item'}];GameState.battleLog=[{opponent:'Private'}];App.clearAccountView();GameState.user={id:'new'};loadGameFromDB=async()=>false;App.showMainApp=()=>{window.mainShown=true;};",ctx);
 assert.equal(vm.runInContext('GameState.avatarId',ctx),null);
 assert.notEqual(vm.runInContext('GameState.avatar.name',ctx),'Private');
 assert.equal(vm.runInContext('GameState.inventory.length+GameState.battleLog.length',ctx),0);
 await assert.rejects(vm.runInContext('App.loadUserData()',ctx),/Could not load account profile/);
 assert.equal(ctx.window.mainShown,undefined);
});

test('shop purchases only change balance and inventory after an authoritative success', async () => {
 const ctx=vm.createContext({window:{},console,Promise,Date});
 for(const name of ['data','engine','habits']) vm.runInContext(fs.readFileSync(path.join(__dirname,`../js/${name}.js`),'utf8'),ctx);
 const run=code=>vm.runInContext(code,ctx);
 run("GameState.user={id:'user'};GameState.avatarId='avatar';GameState.avatar.gold=100;GameState.inventory=[];GameState.shopItems=[{id:'spell_fire',name:'Fire',cost:50,purchased:false}];");
 for(const response of [{error:{code:'42501'}},{data:{status:'insufficient_gold'}},{data:{status:'purchased',item_id:'other',avatar:{gold:50}}}]) {
  ctx.response=response;run('supabase={rpc:async()=>response}');
  assert.equal((await run("Engine.buyItem('spell_fire')")).success,false);
  assert.equal(run('GameState.avatar.gold'),100);assert.equal(run('GameState.inventory.length'),0);
 }
 run("supabase={rpc:async()=>({data:{status:'purchased',item_id:'spell_fire',avatar:{gold:50}}})}");
 assert.equal((await run("Engine.buyItem('spell_fire')")).success,true);
 assert.equal(run('GameState.avatar.gold'),50);assert.equal(run('GameState.inventory.length'),1);
 assert.equal((await run("Engine.buyItem('spell_fire')")).success,false);
 assert.equal(run('GameState.inventory.length'),1);
});

test('signing back into the same account starts a fresh identity check and ignores the old response', async () => {
 const ctx=vm.createContext({window:{},console,Promise,Date,clearInterval,clearTimeout,
  document:{getElementById:()=>({innerHTML:''}),addEventListener(){}},
  BattleScreen:{leave(){}},Wardrobe:{reset(){}},Atelier:{},PasswordRecovery:{},
  HabitProgress:{pendingRequests:new Map()},Engine:{stopGameLoop(){}}});
 for(const name of ['data','app']) vm.runInContext(fs.readFileSync(path.join(__dirname,`../js/${name}.js`),'utf8'),ctx);
 const run=code=>vm.runInContext(code,ctx);
 const user={id:'same-user',email:'test@example.invalid',email_confirmed_at:'2026-01-01',user_metadata:{}};
 let releaseOld,checks=0,loads=0;
 ctx.client={auth:{getUser:()=>++checks===1?new Promise(resolve=>{releaseOld=resolve;}):Promise.resolve({data:{user}})}};
 ctx.session={user};ctx.loaded=()=>{loads++;};
 run("supabase=client;App.showAuth=()=>{};App.showAuthError=()=>{};App.loadUserData=async()=>loaded();");
 const old=run('App.acceptAuthSession(session)');
 run('App.authSessionVersion++;App.clearAccountView();GameState.user=null;');
 const fresh=run('App.acceptAuthSession(session)');
 assert.equal(checks,2);
 assert.equal(await fresh,true);
 releaseOld({data:{user}});
 assert.equal(await old,false);
 assert.equal(loads,1);
 assert.equal(run('GameState.user.id'),user.id);
});

test('a late shop receipt cannot update a new session of the same account', async () => {
 const ctx=vm.createContext({window:{},console,Promise,Date});
 for(const name of ['data','engine','habits']) vm.runInContext(fs.readFileSync(path.join(__dirname,`../js/${name}.js`),'utf8'),ctx);
 const run=code=>vm.runInContext(code,ctx);
 let release;
 ctx.client={rpc:()=>new Promise(resolve=>{release=resolve;})};
 run("supabase=client;GameState.user={id:'user'};GameState.avatarId='avatar';GameState.shopItems=[{id:'sword'}];");
 const pending=run("Engine.buyItem('sword')");
 await new Promise(setImmediate);
 run("clearAccountState();GameState.user={id:'user'};GameState.avatarId='avatar';GameState.avatar.gold=777;");
 release({data:{status:'purchased',item_id:'sword',avatar:{gold:20}}});
 assert.equal((await pending).success,false);
 assert.equal(run('GameState.avatar.gold'),777);
 assert.equal(run('GameState.inventory.length'),0);
});
