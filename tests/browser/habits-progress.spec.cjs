const {test,expect}=require('@playwright/test');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {createFixture,user}=require('../helpers/habit-db.cjs');

test('an outdated habit service cannot enable reward or deletion actions',async({page})=>{
 await page.route('**/*.supabase.co/**',r=>r.abort());await page.goto('/');await expect(page.locator('#auth-form')).toBeVisible();
 await page.evaluate(async()=>{
  window.habitWrites=0;
  supabase={rpc:async(_name,args)=>{if(args.p_action!=='list')habitWrites++;return {data:{rules_version:3,avatar:{gold:50},habits:[{id:'old-service',title:'Beber agua',type:'positive',frequency:'daily',habit_timezone:'UTC',period:'2026-10-09',recorded:false,current_streak:0,best_streak:0,rewards:{xp:10,gold:5}}]}};},from:()=>({select:async()=>({data:[]})})};
  GameState.user={id:'old-server-account'};await HabitProgress.load();App.showMainApp();App.navigate('habits');
 });
 await expect(page.locator('.habit-management-notice')).toContainText('mantenimiento');
 await expect(page.locator('[data-habit-complete]')).toHaveCount(0);
 await page.locator('.habit-options summary').click();
 await expect(page.getByRole('button',{name:'Eliminar hábito',exact:true})).toBeDisabled();
 await page.evaluate(()=>App.navigate('dashboard'));
 await expect(page.getByRole('button',{name:'EN MANTENIMIENTO'})).toBeDisabled();
 await page.evaluate(async()=>{await HabitProgress.act('complete','old-service');await HabitProgress.act('archive','old-service');});
 expect(await page.evaluate(()=>habitWrites)).toBe(0);
 expect(await page.evaluate(()=>GameState.avatar.gold)).toBe(50);
});

test('activation clocks, progression, personal challenges and automatic removal work through the UI',async({page},info)=>{
 test.setTimeout(90000);
 const db=await createFixture();
 let now='2026-10-05T18:00:00Z';
 try {
  await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase_habit_cycles.sql'),'utf8'));
  await db.query("DELETE FROM public.habits WHERE id='old'");
  await db.query("UPDATE public.avatars SET gold=100,hp=100,xp_to_level=10000 WHERE id='a'");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
  const action=async args=>(await db.query('SELECT public.habit_action_at($1,$2,$3::jsonb,$4,$5::date,$6::timestamptz) AS result',[
   args.p_action,args.p_id||null,JSON.stringify(args.p_config||{}),args.p_value??null,args.p_expected_period||null,now])).rows[0].result;
  const balance=async()=>(await db.query("SELECT gold,hp,current_xp FROM public.avatars WHERE id='a'")).rows[0];
  await page.exposeFunction('habitRpc',async args=>{try{return {data:await action(args),error:null};}catch(e){return {data:null,error:{code:e.code,message:e.message}};}});
  await page.exposeFunction('habitRows',async({table,id})=>{
   if(table==='habit_catalog')return {data:(await db.query('SELECT definition FROM public.habit_catalog')).rows};
   if(!['habit_activity','habit_events'].includes(table))return {data:[]};
   return {data:(await db.query(`SELECT * FROM public.${table} WHERE user_id=$1 AND ($2::text IS NULL OR habit_id=$2) ${table==='habit_events' ? "AND kind='auto_archived'" : ''} ORDER BY created_at DESC LIMIT 50`,[user,id])).rows};
  });
  await page.route('**/*.supabase.co/**',r=>r.abort());
  const boot=async(view='habits')=>{
   await page.goto('/');await expect(page.locator('#auth-form')).toBeVisible();
   await page.evaluate(async({uid,view})=>{
    supabase={rpc:(_name,args)=>window.habitRpc(args),from:table=>{
     let id=null;const q={select(){return q;},eq(key,value){if(key==='habit_id')id=value;return q;},order(){return q;},limit(){return q;},then(resolve,reject){return window.habitRows({table,id}).then(resolve,reject);}};return q;
    }};
    GameState.user={id:uid};GameState.avatarId='a';GameState.avatar.lastPenaltyCheck=new Date().toISOString();
    await HabitProgress.load();App.showMainApp();App.navigate(view);
   },{uid:user,view});
  };
  const refresh=async(view='dashboard')=>page.evaluate(async view=>{await HabitProgress.act('list');App.navigate(view);},view);
  const catalog=id=>page.locator('.catalog-card').filter({has:page.locator(`#freq-select-${id}`)});
  await boot();
  await catalog('hab_water').locator('summary').click();
  await expect(catalog('hab_water').locator('.habit-config-example')).toContainText('7 veces seguidas');
  await expect(catalog('hab_water').locator('[data-habit-reward]')).toHaveText('+10 XP · +5 monedas');
  await expect(catalog('hab_water').locator('[data-progress]')).toHaveCount(0);
  await catalog('hab_water').getByRole('button',{name:'+ ACTIVAR MISIÓN',exact:true}).click();
  const water=page.locator('[data-progress-habit]').filter({has:page.getByRole('heading',{name:/^Beber \d+ litros de agua$/})});
  await expect(water.getByRole('heading')).toHaveText('Beber 2 litros de agua');
  await expect(water.locator('[data-cycle-countdown]')).toContainText(':');
  await expect(page.locator('[data-habit-complete],[data-habit-abstain],[data-habit-lapse]')).toHaveCount(0);
  const id=await water.getAttribute('data-progress-habit');
  const deadline=await page.evaluate(id=>GameState.habits.find(h=>h.id===id).cycle_end_at,id);
  await page.evaluate(()=>App.navigate('dashboard'));
  await water.getByRole('button',{name:'MARCAR COMPLETADO',exact:true}).click();
  await expect(water.getByRole('button',{name:'COMPLETADO',exact:true})).toBeDisabled();
  await expect(water).toContainText('Podrás completarlo de nuevo en');
  expect(await page.evaluate(id=>GameState.habits.find(h=>h.id===id).cycle_end_at,id)).toBe(deadline);
  await expect(water.getByRole('progressbar')).toHaveAttribute('value','1');
  for(let day=6;day<=11;day++){
   now=`2026-10-${String(day).padStart(2,'0')}T18:00:00Z`;
   const h=(await action({p_action:'list'})).habits.find(h=>h.id===id);
   await action({p_action:'complete',p_id:id,p_value:2,p_expected_period:h.period,p_config:{request_id:randomUUID(),expected_cycle_start_at:h.cycle_start_at}});
  }
  await boot();
  await expect(water.getByRole('heading')).toHaveText('Beber 3 litros de agua');
  await water.locator('.habit-options summary').click();
  await expect(water).toContainText('Mejor racha: 7');
  page.once('dialog',dialog=>dialog.accept());
  await water.getByRole('button',{name:'Reiniciar progreso'}).click();
  await expect(water.getByRole('heading')).toHaveText('Beber 2 litros de agua');
  await water.locator('.habit-options summary').click();
  page.once('dialog',dialog=>dialog.accept());
  await water.getByRole('button',{name:'Eliminar hábito'}).click();
  await expect(water).toHaveCount(0);
  await page.getByRole('button',{name:'HISTORIAL GENERAL'}).click();
  await expect(page.getByRole('dialog')).toContainText('Beber 2 litros de agua');
  await page.getByRole('button',{name:'CERRAR',exact:true}).click();
  await catalog('hab_water').getByRole('button',{name:'+ ACTIVAR MISIÓN',exact:true}).click();
  await expect(water).toHaveCount(1);
  await page.evaluate(()=>App.navigate('dashboard'));
  await expect(water.getByRole('button',{name:'COMPLETADO',exact:true})).toBeDisabled();

  await page.evaluate(()=>App.navigate('habits'));
  await page.getByRole('button',{name:'RETOS PERSONALES',exact:true}).click();
  await expect(catalog('hab_no_soda').locator('.catalog-card-title')).toHaveText(/^NO /);
  await catalog('hab_no_soda').getByRole('button',{name:'+ ACTIVAR MISIÓN',exact:true}).click();
  const challengeId=await page.evaluate(()=>GameState.habits.find(h=>h.catalog_id==='hab_no_soda').id);
  const challenge=page.locator(`[data-progress-habit="${challengeId}"]`);
  await expect(challenge.locator('[data-habit-abstain],[data-habit-lapse]')).toHaveCount(0);
  now='2026-10-12T15:59:00Z';await refresh();
  await expect(challenge.locator('[data-habit-abstain]')).toBeDisabled();
  await expect(challenge.locator('[data-habit-lapse]')).toBeEnabled();
  await expect(challenge.locator('[data-abstinence-countdown]')).toBeVisible();
  now='2026-10-12T16:00:00Z';await refresh();
  await expect(challenge.locator('[data-habit-abstain]')).toBeEnabled();
  const before=await balance();
  await challenge.locator('[data-habit-abstain]').click();
  await expect(challenge.locator('[data-habit-abstain]')).toBeDisabled();
  expect(await balance()).toEqual({...before,gold:before.gold+1,current_xp:before.current_xp+2});
  await challenge.locator('[data-habit-lapse]').click();
  await expect(challenge).toContainText('Registraste 1 tropiezo');
  await challenge.locator('[data-habit-lapse]').click();
  await expect(challenge).toContainText('Registraste 2 tropiezos');
  expect(await balance()).toEqual({...before,gold:before.gold-9,hp:before.hp-10,current_xp:before.current_xp+2});
  await expect(challenge).not.toHaveClass(/completed/);
  await challenge.screenshot({path:info.outputPath('personal-challenge.png')});
  await page.evaluate(()=>App.navigate('habits'));
  await expect(page.locator('[data-habit-complete],[data-habit-abstain],[data-habit-lapse]')).toHaveCount(0);
  await challenge.locator('.habit-options summary').click();
  await challenge.getByRole('button',{name:'Historial',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Tropiezos registrados (2)');
  await expect(page.getByRole('dialog')).toContainText('−10 G / −10 HP');
  await page.getByRole('button',{name:'CERRAR',exact:true}).click();
  await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await challenge.screenshot({path:info.outputPath('habit-summary-small.png')});
  await page.evaluate(()=>{I18N.current='en';App.navigate('habits');});
  await expect(challenge.getByRole('heading')).toHaveText(/^DO NOT /);
  await expect(challenge.locator('[data-habit-abstain]')).toHaveCount(0);
  await page.evaluate(()=>{I18N.current='es';App.navigate('dashboard');});
  now='2026-10-14T18:00:00Z';await refresh();
  await expect(challenge).toHaveCount(0);
  await expect(page.locator('.habit-cycle-notice')).toContainText('3 periodos sin cumplir');
  await expect(page.locator('.habit-cycle-notice')).toContainText('−15 G · −15 HP');
  const archivedBalance=await balance();await refresh();
  expect(await balance()).toEqual(archivedBalance);
  await page.evaluate(()=>App.navigate('habits'));
  await page.getByRole('button',{name:'HISTORIAL GENERAL'}).click();
  await expect(page.getByRole('dialog')).toContainText('Desactivado tras 3 periodos sin cumplir');
  await page.getByRole('button',{name:'CERRAR',exact:true}).click();
  await page.getByRole('button',{name:'RETOS PERSONALES',exact:true}).click();
  await catalog('hab_no_soda').locator('select').selectOption('weekly');
  await catalog('hab_no_soda').getByRole('button',{name:'+ ACTIVAR MISIÓN',exact:true}).click();
  await expect(challenge).toContainText('Cada 7 días');
  await expect(catalog('hab_no_soda').locator('select')).toHaveValue('weekly');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 } finally {await db.close();}
});
