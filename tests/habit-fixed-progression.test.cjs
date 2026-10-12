const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createFixture,user,migration}=require('./helpers/habit-db.cjs');
const patch=fs.readFileSync(path.join(__dirname,'../supabase_habit_fixed_progression.sql'),'utf8');

test('fixed stages enforce server goals and safely migrate existing habits',async()=>{
 const db=await createFixture();
 try {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
  const call=async(action,id=null,config={},value=null,day='2026-10-05')=>
   (await db.query('SELECT public.habit_action_at($1,$2,$3::jsonb,$4,$5::date,$6::timestamptz) r',
    [action,id,JSON.stringify(config),value,day,`${day}T18:00:00Z`])).rows[0].r;
  const expected={hab_water:[2,3,1,'liters'],hab_sleep:[5,8,1,'hours'],hab_read:[5,30,5,'pages'],hab_cardio:[10,40,10,'minutes'],hab_meditate:[5,20,5,'minutes'],hab_code:[15,60,15,'minutes']};
  const ids={};
  for(const [catalog_id,[initial,max,step,unit]] of Object.entries(expected)){
   const r=await call('create',null,{catalog_id,timezone:'UTC',frequency:'daily',progression:{initial:1,max:1,step:0.01,required:1,unit:'units'}});
   ids[catalog_id]=r.habit_id;
   assert.equal(r.rules_version,3);
   assert.deepEqual(r.habits.find(h=>h.id===r.habit_id).progression,{initial,max,step,required:7,unit});
  }
  const reading=ids.hab_read;
  const before=(await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0];
  assert.equal((await call('complete',reading,{},1)).status,'below_target');
  assert.deepEqual((await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0],before);
  const paid=await call('complete',reading,{},30);
  assert.equal(paid.xp,10);assert.equal(paid.gold,5);assert.equal(paid.advanced,false);
  assert.equal(paid.habits.find(h=>h.id===reading).progress_count,1);
  assert.equal((await call('complete',reading,{},30)).status,'already_recorded');
  await assert.rejects(call('configure',reading,{progression:null}),e=>e.code==='22023');
  const binary=await call('create',null,{catalog_id:'hab_teeth',timezone:'UTC',progression:{initial:1,max:100,step:1,required:1,unit:'units'}});
  assert.equal(binary.habits.find(h=>h.id===binary.habit_id).progression,null);
  await assert.rejects(call('configure',binary.habit_id,{progression:{initial:1,max:2,step:1,unit:'units'}}),e=>e.code==='22023');

  // Recreate old server state: customized reading, binary sleep, archived water.
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase_habit_reward_guards.sql'),'utf8'));
  await db.query("UPDATE public.habits SET progression=progression||'{\"initial\":1,\"max\":20,\"step\":1}',difficulty_level=19,rewarded_level=19,progress_count=6 WHERE id=$1",[reading]);
  await db.query('UPDATE public.habits SET progression=NULL WHERE id=$1',[ids.hab_sleep]);
  await call('archive',ids.hab_water);
  await db.query('UPDATE public.habits SET progression=NULL WHERE id=$1',[ids.hab_water]);
  const balance=(await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0];
  const history=(await db.query('SELECT * FROM public.habit_activity ORDER BY id')).rows;
  const guards=(await db.query('SELECT * FROM public.habit_reward_guard ORDER BY habit_key')).rows;
  await db.exec(patch);await db.exec(patch);
  assert.deepEqual((await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0],balance);
  assert.deepEqual((await db.query('SELECT * FROM public.habit_activity ORDER BY id')).rows,history);
  assert.deepEqual((await db.query('SELECT * FROM public.habit_reward_guard ORDER BY habit_key')).rows,guards);
  let snapshot=await call('list');
  const read=snapshot.habits.find(h=>h.id===reading);
  assert.equal(read.difficulty_level,6);assert.equal(read.current_target,30);assert.equal(read.rewarded_level,19);
  assert.equal(read.current_streak,1);assert.equal(read.progress_count,6);
  assert.equal(snapshot.habits.find(h=>h.id===ids.hab_sleep).current_target,5);
  assert.equal((await call('complete',reading,{},30)).status,'already_recorded');
  const restored=await call('create',null,{catalog_id:'hab_water',progression:null});
  assert.equal(restored.habit_id,ids.hab_water);
  assert.equal(restored.habits.find(h=>h.id===ids.hab_water).current_target,2);
  await call('reset',reading);
  for(let d=6;d<=12;d++)snapshot=await call('complete',reading,{},5,`2026-10-${String(d).padStart(2,'0')}`);
  assert.equal(snapshot.advanced,true);assert.equal(snapshot.bonus_xp,0);assert.equal(snapshot.bonus_gold,0);
  // Fresh migration and upgrade publish identical authoritative functions.
  const functions=async()=> (await db.query("SELECT proname,prosrc FROM pg_proc WHERE proname IN ('habit_action_at','habit_fixed_progression') ORDER BY proname")).rows;
  const upgraded=await functions();await db.exec(migration);assert.deepEqual(await functions(),upgraded);
 } finally {await db.close();}
});
