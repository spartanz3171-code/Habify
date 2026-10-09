const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFixture } = require('./helpers/habit-db.cjs');
const migration = fs.readFileSync(path.join(__dirname, '../supabase_habit_progression.sql'), 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
test('habit transactions preserve history, schedule, ownership and reward eligibility', async t => {
 const db = await createFixture();
 try {
 await db.exec(migration);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
 const call = async (action,id=null,config={},value=null,day='2026-10-05',period=day) =>
  (await db.query('SELECT public.habit_action_at($1,$2,$3::jsonb,$4,$5::date,$6::timestamptz) AS result',
   [action,id,JSON.stringify(config),value,period,`${day}T18:00:00Z`])).rows[0].result;
 const config={catalog_id:'hab_sleep',timezone:'UTC',frequency:'daily',progression:{initial:5,max:8,step:1,required:7,unit:'hours'}};
 let id, second;
 await t.test('migration is repeatable and keeps old balances and the known completion',async()=>{
  assert.equal((await db.query("SELECT gold FROM public.avatars WHERE id='a'")).rows[0].gold,50);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.habit_activity WHERE habit_id='old' AND outcome='legacy' AND xp=0")).rows[0].n,1);
 });
 await t.test('sleep advances after seven successful daily periods, paying old-level reward on day seven',async()=>{
  id=(await call('create',null,config)).habit_id;
  for(let d=5;d<=11;d++) {
   const day=`2026-10-${d.toString().padStart(2,'0')}`;
   const r=await call('complete',id,{},5,day);
   assert.equal(r.xp,10); assert.equal(r.advanced,d===11);
   if(d===11){assert.equal(r.bonus_xp,25);assert.equal(r.bonus_gold,10);const h=r.habits.find(x=>x.id===id);assert.equal(h.difficulty_level,2);assert.equal(h.current_target,6);assert.equal(h.current_streak,7);assert.equal(h.progress_count,0);}
  }
 });
 await t.test('duplicate and concurrent retries cannot pay twice',async()=>{
  const before=(await db.query("SELECT gold FROM public.avatars WHERE id='a'")).rows[0].gold;
  const results=await Promise.all([call('complete',id,{},5,'2026-10-11'),call('complete',id,{},5,'2026-10-11')]);
  assert.ok(results.every(x=>x.status==='already_recorded'));
  assert.equal((await db.query("SELECT gold FROM public.avatars WHERE id='a'")).rows[0].gold,before);
 });
 await t.test('below-target and missed days clear progress without taking difficulty or best streak',async()=>{
  let r=await call('complete',id,{},5,'2026-10-12');assert.equal(r.status,'below_target');assert.equal(r.xp,0);
  r=await call('complete',id,{},6,'2026-10-13');
  r=await call('complete',id,{},6,'2026-10-15');
  const h=r.habits.find(x=>x.id===id);assert.equal(h.difficulty_level,2);assert.equal(h.progress_count,1);assert.equal(h.current_streak,1);assert.equal(h.best_streak,7);
 });
 await t.test('reset keeps configuration, history and same-period reward lock',async()=>{
  const count=(await db.query('SELECT count(*)::int n FROM public.habit_activity WHERE habit_id=$1',[id])).rows[0].n;
  const r=await call('reset',id,{},null,'2026-10-15');const h=r.habits.find(x=>x.id===id);
  assert.deepEqual(h.progression,config.progression);assert.equal(h.frequency,'daily');assert.equal(h.difficulty_level,1);assert.equal(h.progress_count,0);assert.equal(h.best_streak,7);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.habit_activity WHERE habit_id=$1',[id])).rows[0].n,count);
  assert.equal((await call('complete',id,{},5,'2026-10-15')).status,'already_recorded');
  for(let d=16;d<=22;d++){const r=await call('complete',id,{},5,`2026-10-${d}`);if(d===22){assert.equal(r.advanced,true);assert.equal(r.bonus_xp,0);assert.equal(r.bonus_gold,0);}}
 });
 await t.test('archiving touches one habit and reactivation retains its identity and eligibility',async()=>{
  second=(await call('create',null,{catalog_id:'hab_water',frequency:'daily',timezone:'UTC'},null,'2026-10-22')).habit_id;
  const r=await call('archive',id,{},null,'2026-10-22');assert.ok(!r.habits.some(x=>x.id===id));assert.ok(r.habits.some(x=>x.id===second));
  const restored=await call('create',null,config,null,'2026-10-22');assert.equal(restored.habit_id,id);
  assert.equal((await call('complete',id,{},6,'2026-10-22')).status,'already_recorded');
 });
 await t.test('scheduled three-times-weekly periods ignore rest days and clamp the maximum',async()=>{
  const r=await call('create',null,{...config,catalog_id:'hab_cardio',frequency:'3x_week',progression:{initial:10,max:15,step:3,required:2,unit:'minutes'}},null,'2026-10-05');
  const cid=r.habit_id;
  assert.equal((await call('complete',cid,{},10,'2026-10-06')).status,'not_due');
  await call('complete',cid,{},10,'2026-10-05');
  assert.equal((await call('complete',cid,{},10,'2026-10-07')).advanced,true);
  await call('complete',cid,{},13,'2026-10-09');
  const max=await call('complete',cid,{},13,'2026-10-12');const h=max.habits.find(x=>x.id===cid);assert.equal(h.current_target,15);assert.equal(h.difficulty_level,3);
  const final=await call('complete',cid,{},15,'2026-10-14');assert.equal(final.advanced,false);assert.equal(final.xp,20);
 });
 await t.test('weekly habits pay once per week and midnight rejects a stale period',async()=>{
  const wid=(await call('create',null,{catalog_id:'hab_teeth',frequency:'weekly',timezone:'UTC'},null,'2026-11-02')).habit_id;
  assert.equal((await call('complete',wid,{},null,'2026-11-04','2026-11-02')).status,'completed');
  assert.equal((await call('complete',wid,{},null,'2026-11-07','2026-11-02')).status,'already_recorded');
  assert.equal((await call('complete',wid,{},null,'2026-11-09','2026-11-02')).status,'period_changed');
  const next=await call('complete',wid,{},null,'2026-11-09','2026-11-09');assert.equal(next.habits.find(x=>x.id===wid).current_streak,2);
 });
 await t.test('adding progression preserves an existing completion and cannot be edited to farm rewards',async()=>{
  const cid=(await call('create',null,{catalog_id:'hab_code',frequency:'daily',timezone:'UTC'},null,'2026-11-10')).habit_id;
  await call('complete',cid,{},null,'2026-11-10');
  const r=await call('configure',cid,{progression:config.progression},null,'2026-11-10');
  assert.equal(r.habits.find(h=>h.id===cid).difficulty_level,1);
  assert.equal((await call('complete',cid,{},8,'2026-11-10')).status,'already_recorded');
  await assert.rejects(call('configure',cid,{progression:{...config.progression,required:2}},null,'2026-11-10'),e=>e.code==='22023');
 });
 await t.test('weekly quantity progression advances once and simultaneous first submissions pay once',async()=>{
  const cid=(await call('create',null,{...config,catalog_id:'hab_meditate',frequency:'weekly',progression:{...config.progression,required:2}},null,'2026-11-02')).habit_id;
  const first=await Promise.all([call('complete',cid,{},5,'2026-11-04','2026-11-02'),call('complete',cid,{},5,'2026-11-04','2026-11-02')]);
  assert.deepEqual(first.map(r=>r.status).sort(),['already_recorded','completed']);
  assert.equal(first.reduce((total,r)=>total+r.xp,0),10);
  const next=await call('complete',cid,{},5,'2026-11-11','2026-11-09');
  const h=next.habits.find(x=>x.id===cid);
  assert.equal(next.advanced,true);assert.equal(next.bonus_xp,25);assert.equal(h.difficulty_level,2);assert.equal(h.current_target,6);assert.equal(h.current_streak,2);
 });
 await t.test('seven scheduled completions advance without penalizing rest days',async()=>{
  const cid=(await call('create',null,{...config,catalog_id:'hab_read',frequency:'3x_week'},null,'2026-10-05')).habit_id;
  const dates=['05','07','09','12','14','16','19'];let r;
  for(const d of dates)r=await call('complete',cid,{},5,`2026-10-${d}`);
  const h=r.habits.find(x=>x.id===cid);assert.equal(h.difficulty_level,2);assert.equal(h.current_streak,7);assert.equal(r.advanced,true);
 });
 await t.test('a repeated hour at daylight-saving time cannot produce a second completion',async()=>{
  const cid=(await call('create',null,{catalog_id:'hab_journal',frequency:'daily',timezone:'America/New_York'},null,'2026-11-01')).habit_id;
  const at=async time=>(await db.query("SELECT public.habit_action_at('complete',$1,'{}',NULL,'2026-11-01',$2::timestamptz) r",[cid,time])).rows[0].r;
  assert.equal((await at('2026-11-01T05:30:00Z')).status,'completed');
  assert.equal((await at('2026-11-01T06:30:00Z')).status,'already_recorded');
  assert.equal((await db.query('SELECT habit_timezone FROM public.habits WHERE id=$1',[cid])).rows[0].habit_timezone,'America/New_York');
 });
 await t.test('a failed transaction rolls back progress and currency together',async()=>{
  const before=(await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0];
  await db.exec("CREATE FUNCTION reject_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated storage failure'; END $$; CREATE TRIGGER reject_activity BEFORE INSERT ON public.habit_activity FOR EACH ROW EXECUTE FUNCTION reject_activity();");
  await assert.rejects(call('complete',second,{},null,'2026-10-22'));
  assert.deepEqual((await db.query("SELECT gold,current_xp FROM public.avatars WHERE id='a'")).rows[0],before);
  await db.exec('DROP TRIGGER reject_activity ON public.habit_activity');
 });
 await t.test('server enforces ownership and denies direct edits, fake clocks and reward insertion',async()=>{
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other]);
  await assert.rejects(call('reset',id),e=>e.code==='42501');
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT count(*)::int n FROM public.habit_activity')).rows[0].n,0);
  await assert.rejects(db.query("SELECT public.save_habit_catalog('{}')"),e=>e.code==='42501');
  await assert.rejects(db.query("UPDATE public.avatars SET is_admin=true WHERE id='b'"),e=>e.code==='42501');
  for(const sql of ["UPDATE public.habits SET difficulty_level=20", "DELETE FROM public.habits", "INSERT INTO public.habit_activity(user_id,habit_id,period,title,difficulty,outcome) VALUES(auth.uid(),'old',current_date,'fake',1,'completed')", "SELECT public.habit_action_at('list',NULL,'{}',NULL,NULL,now())"]){await assert.rejects(db.exec(sql),e=>e.code==='42501');}
  await db.exec('RESET ROLE');
 });
 } finally { await db.close(); }
});
