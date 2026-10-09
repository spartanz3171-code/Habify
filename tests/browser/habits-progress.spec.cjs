const {test,expect}=require('@playwright/test');
const {createFixture,user}=require('../helpers/habit-db.cjs');

test('scheduled habit UI saves quantities, resets and archives without losing history across reloads',async({page},testInfo)=>{
 const db=await createFixture();
 let day='2026-10-05';
 try {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
  const action=async args=>(await db.query('SELECT public.habit_action_at($1,$2,$3::jsonb,$4,$5::date,$6::timestamptz) AS result',[
   args.p_action,args.p_id||null,JSON.stringify(args.p_config||{}),args.p_value??null,args.p_expected_period||null,`${day}T18:00:00Z`])).rows[0].result;
  await page.exposeFunction('habitRpc',async args=>{try{return {data:await action(args),error:null};}catch(e){return {data:null,error:{code:e.code}};}});
  await page.exposeFunction('habitHistory',async id=>({data:(await db.query('SELECT * FROM public.habit_activity WHERE user_id=$1 AND ($2::text IS NULL OR habit_id=$2) ORDER BY created_at DESC',[user,id])).rows,error:null}));
  await page.route('**/*.supabase.co/**',route=>route.abort());
  const boot=async()=>{
   await page.goto('/');await expect(page.locator('#auth-form')).toBeVisible();
   await page.evaluate(async uid=>{
    supabase={rpc:(_name,args)=>window.habitRpc(args),from:()=>{
     let id=null;const q={select(){return q;},eq(key,value){if(key==='habit_id')id=value;return q;},order(){return q;},limit(){return q;},then(resolve,reject){return window.habitHistory(id).then(resolve,reject);}};return q;
    }};
    GameState.user={id:uid};GameState.avatarId='a';GameState.avatar.lastPenaltyCheck=new Date().toISOString();
    await HabitProgress.load();App.showMainApp();App.navigate('habits');
   },user);
  };
  await boot();
  const catalog=page.locator('.catalog-card').filter({has:page.locator('#freq-select-hab_sleep')});
  await catalog.locator('summary').click();
  await expect(catalog.locator('[data-progress="initial"]')).toHaveValue('5');
  await catalog.getByRole('button',{name:'+ ACTIVAR MISIÓN',exact:true}).click();
  const sleep=page.locator('[data-progress-habit]').filter({has:page.getByRole('heading',{name:'Dormir 7 a 8 Horas',exact:true})});
  await expect(sleep).toContainText('5 horas');
  await sleep.getByRole('button',{name:'REGISTRAR CANTIDAD'}).click();
  await page.locator('#habit-measured').fill('4');
  await page.getByRole('button',{name:'GUARDAR REGISTRO'}).click();
  await expect(sleep).toContainText('Racha actual: 0');
  await sleep.getByRole('button',{name:'REGISTRAR CANTIDAD'}).click();
  await page.locator('#habit-measured').fill('5');
  await page.getByRole('button',{name:'GUARDAR REGISTRO'}).click();
  await expect(sleep.getByRole('button',{name:'REGISTRADO',exact:true})).toBeDisabled();
  const id=await sleep.getAttribute('data-progress-habit');
  for(let d=6;d<=11;d++){day=`2026-10-${String(d).padStart(2,'0')}`;await action({p_action:'complete',p_id:id,p_value:5,p_expected_period:day});}
  await boot();
  await expect(sleep).toContainText('NIVEL 2');await expect(sleep).toContainText('6 horas');await expect(sleep).toContainText('Mejor racha: 7');
  await page.screenshot({path:testInfo.outputPath('habit-progression.png'),fullPage:true});
  await sleep.screenshot({path:testInfo.outputPath('habit-card.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('historial');await dialog.accept();});
  await sleep.getByRole('button',{name:'Reiniciar progreso'}).click();
  await expect(sleep).toContainText('NIVEL 1');await expect(sleep).toContainText('Mejor racha: 7');
  await expect(sleep.getByRole('button',{name:'REGISTRADO',exact:true})).toBeDisabled();
  page.once('dialog',dialog=>dialog.accept());
  await sleep.getByRole('button',{name:'Eliminar hábito'}).click();
  await expect(sleep).toHaveCount(0);
  await expect(page.locator('[data-progress-habit]').filter({hasText:'Legacy'})).toHaveCount(1);
  await page.getByRole('button',{name:'HISTORIAL GENERAL'}).click();
  await expect(page.getByRole('dialog')).toContainText('Dormir 7 a 8 Horas');
  await page.getByRole('button',{name:'CERRAR',exact:true}).click();
  await boot();await expect(sleep).toHaveCount(0);
 } finally {await db.close();}
});
