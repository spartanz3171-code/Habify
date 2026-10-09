const {test,expect}=require('@playwright/test');
const {createFixture,user}=require('../helpers/habit-db.cjs');

test('water completes with one click, advances from two to three liters and retains history after reset and archive',async({page},testInfo)=>{
 test.setTimeout(45000); // The local PostgreSQL runtime also starts inside this UI test.
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
  const catalog=page.locator('.catalog-card').filter({has:page.locator('#freq-select-hab_water')});
  await catalog.locator('summary').click();
  await expect(catalog.locator('[data-progress="initial"]')).toHaveValue('2');
  await expect(catalog.locator('select[data-progress="unit"]')).toHaveCount(0);
  await expect(catalog).not.toContainText('unidades');
  await expect(catalog).not.toContainText('páginas');
  await catalog.getByRole('button',{name:'+ ACTIVAR MISIÓN',exact:true}).click();
  const sleep=page.locator('[data-progress-habit]').filter({has:page.getByRole('heading',{name:'Beber agua',exact:true})});
  await expect(sleep).toContainText('2 litros');
  await expect(sleep).not.toContainText('America/');
  await sleep.getByRole('button',{name:'MARCAR COMPLETADO',exact:true}).click();
  await expect(page.locator('#habit-measured')).toHaveCount(0);
  await expect(sleep.getByRole('button',{name:'COMPLETADO',exact:true})).toBeDisabled();
  await expect(sleep).toContainText('Ya completaste este hábito hoy.');
  const id=await sleep.getAttribute('data-progress-habit');
  for(let d=6;d<=11;d++){day=`2026-10-${String(d).padStart(2,'0')}`;await action({p_action:'complete',p_id:id,p_value:2,p_expected_period:day});}
  await boot();
  await expect(sleep).toContainText('NIVEL 2');await expect(sleep).toContainText('3 litros');await expect(sleep).toContainText('Mejor racha: 7');
  await page.screenshot({path:testInfo.outputPath('habit-progression.png'),fullPage:true});
  await sleep.screenshot({path:testInfo.outputPath('habit-card.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('historial');await dialog.accept();});
  await sleep.getByRole('button',{name:'Reiniciar progreso'}).click();
  await expect(sleep).toContainText('NIVEL 1');await expect(sleep).toContainText('Mejor racha: 7');
  await expect(sleep.getByRole('button',{name:'COMPLETADO',exact:true})).toBeDisabled();
  page.once('dialog',dialog=>dialog.accept());
  await sleep.getByRole('button',{name:'Eliminar hábito'}).click();
  await expect(sleep).toHaveCount(0);
  await expect(page.locator('[data-progress-habit]').filter({hasText:'Legacy'})).toHaveCount(1);
  await page.getByRole('button',{name:'HISTORIAL GENERAL'}).click();
  await expect(page.getByRole('dialog')).toContainText('Beber 2 Litros de Agua');
  await page.getByRole('button',{name:'CERRAR',exact:true}).click();
  await boot();await expect(sleep).toHaveCount(0);
  day='2026-10-12';
  const cardio=(await action({p_action:'create',p_config:{catalog_id:'hab_cardio',frequency:'3x_week',timezone:'UTC'}})).habit_id;
  day='2026-10-13';await boot();
  const rest=page.locator(`[data-progress-habit="${cardio}"]`);
  await expect(rest.getByRole('button',{name:'DÍA DE DESCANSO'})).toBeDisabled();
  await expect(rest).toContainText('Lunes, miércoles y viernes');
  const sleeping=(await action({p_action:'create',p_config:{catalog_id:'hab_sleep',frequency:'daily',timezone:'UTC'}})).habit_id;
  await boot();
  const fixed=page.locator(`[data-progress-habit="${sleeping}"]`);
  await fixed.getByRole('button',{name:'Añadir niveles'}).click();
  await expect(page.getByRole('dialog')).toContainText('horas');
  await expect(page.getByRole('dialog').locator('select[data-progress="unit"]')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button',{name:'GUARDAR',exact:true}).click();
  await expect(fixed).toContainText('5 horas');
  await fixed.getByRole('button',{name:'MARCAR COMPLETADO'}).click();
  await expect(fixed.getByRole('button',{name:'COMPLETADO',exact:true})).toBeDisabled();
 } finally {await db.close();}
});
