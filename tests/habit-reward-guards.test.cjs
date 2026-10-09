const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {createFixture,user,other}=require('./helpers/habit-db.cjs');

test('account reward guards survive reactivation, duplicates and upgrades',async t=>{
 const db=await createFixture();
 try {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
  const call=async(action,id=null,cfg={},value=null,time='2026-10-09T18:00:00Z',period=time.slice(0,10))=>
   (await db.query('SELECT public.habit_action_at($1,$2,$3::jsonb,$4,$5,$6) r',[action,id,JSON.stringify(cfg),value,period,time])).rows[0].r;
  const config={catalog_id:'hab_read',frequency:'daily',timezone:'UTC',progression:{initial:10,max:20,step:5,required:1,unit:'pages'}};
  let id, second, paid;
  await t.test('client cannot shorten seven and completed titles use the paid target',async()=>{
   const created=await call('create',null,config);id=created.habit_id;
   assert.equal(created.habits.find(h=>h.id===id).progression.required,7);
   paid=await call('complete',id,{},10);assert.equal(paid.advanced,false);
   assert.equal((await db.query('SELECT title FROM public.habit_activity WHERE habit_id=$1',[id])).rows[0].title,'Leer 10 páginas de un libro');
  });
  await t.test('delete and reactivate retain the reward; a second deletion is blocked for the whole account',async()=>{
   const deleted=await call('archive',id);assert.equal(deleted.status,'saved');assert.equal(Date.parse(deleted.delete_available_at),Date.parse('2026-10-10T18:00:00Z'));
   const restored=await call('create',null,{...config,frequency:'weekly',timezone:'Asia/Tokyo'});assert.equal(restored.habit_id,id);
   const replay=await call('complete',id,{},10);assert.equal(replay.status,'already_recorded');assert.equal(replay.avatar.gold,paid.avatar.gold);assert.equal(replay.avatar.current_xp,paid.avatar.current_xp);
   const blocked=await call('archive',id);assert.equal(blocked.status,'delete_cooldown');assert.ok(blocked.habits.some(h=>h.id===id));
   second=(await call('create',null,{catalog_id:'hab_water',timezone:'UTC'})).habit_id;
   assert.equal((await call('archive',second)).status,'delete_cooldown');
   assert.equal((await call('archive',second,{},null,'2026-10-10T17:59:59Z')).status,'delete_cooldown');
   assert.equal((await call('archive',second,{},null,'2026-10-10T18:00:00Z')).status,'saved');
  });
  await t.test('another row for the same catalog cannot earn the reward again, even across timezones',async()=>{
   await db.query("INSERT INTO public.habits(id,avatar_id,title,type,xp_reward,gold_reward,hp_penalty,frequency,catalog_id,habit_timezone,checked_through) SELECT 'duplicate','a',title,type,xp_reward,gold_reward,hp_penalty,'daily',catalog_id,'Asia/Tokyo','2026-10-09' FROM public.habits WHERE id=$1",[id]);
   // It is already October 10 in Tokyo, but the first claim's UTC day has not ended.
   const blocked=await call('complete','duplicate',{},null,'2026-10-09T19:00:00Z','2026-10-10');
   assert.equal(blocked.status,'already_recorded');assert.equal(blocked.gold,0);assert.equal(blocked.xp,0);
   assert.equal(blocked.habits.find(h=>h.id==='duplicate').recorded,true);
   await assert.rejects(call('create',null,config),e=>e.code==='22023');
  });
  await t.test('two first requests after the next day starts pay once',async()=>{
   const responses=await Promise.all([call('complete',id,{},10,'2026-10-10T20:00:00Z'),call('complete',id,{},10,'2026-10-10T20:00:00Z')]);
   assert.deepEqual(responses.map(r=>r.status).sort(),['already_recorded','completed']);assert.equal(responses.reduce((n,r)=>n+r.gold,0),5);
  });
  await t.test('patch backfills prior paid entries and existing deletion locks without changing balances',async()=>{
   const patch=fs.readFileSync(path.join(__dirname,'../supabase_habit_reward_guards.sql'),'utf8');
   const before=(await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0];
   await db.exec('DELETE FROM public.habit_reward_guard; DELETE FROM public.habit_account_rules; ALTER TABLE public.habits DROP CONSTRAINT habit_seven_completions');
   await db.query("UPDATE public.habits SET progression=jsonb_set(progression,'{required}','2'),progress_count=1 WHERE id=$1",[id]);
   await db.exec(patch);await db.exec(patch);
   assert.deepEqual((await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0],before);
   assert.equal((await db.query('SELECT progression FROM public.habits WHERE id=$1',[id])).rows[0].progression.required,7);
   assert.equal((await call('complete',id,{},10,'2026-10-10T21:00:00Z')).status,'already_recorded');
   assert.equal((await call('archive',id,{},null,'2026-10-10T21:00:00Z')).status,'delete_cooldown');
  });
  await t.test('claims also preserve paid level bonuses if an old row is replaced',async()=>{
   await db.query("UPDATE public.habit_reward_guard SET rewarded_level=3 WHERE user_id=$1 AND habit_key='catalog:hab_read'",[user]);
   await db.query("UPDATE public.habits SET progress_count=6,difficulty_level=1,rewarded_level=1 WHERE id=$1",[id]);
   const r=await call('complete',id,{},10,'2026-10-11T20:00:00Z');assert.equal(r.advanced,true);assert.equal(r.bonus_gold,0);assert.equal(r.bonus_xp,0);
  });
  await t.test('client cannot clear account guards or affect another account',async()=>{
   await db.exec('SET ROLE authenticated');
   for(const sql of ['DELETE FROM public.habit_reward_guard','DELETE FROM public.habit_account_rules',"UPDATE public.habits SET progression=jsonb_set(progression,'{required}','1')"])
    await assert.rejects(db.exec(sql),e=>e.code==='42501');
   await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other]);
   await assert.rejects(call('archive',id),e=>e.code==='42501');
   const separate=(await call('create',null,config)).habit_id;assert.equal((await call('complete',separate,{},10)).status,'completed');
  });
 } finally { await db.close(); }
});
