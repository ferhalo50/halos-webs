import test from 'node:test';
import assert from 'node:assert/strict';
import {testables} from '../worker/index.js';
import {TENANTS} from '../worker/tenants.js';
import {schema,fixture,invoke,action} from './reward-choice-fixture.mjs';
import {server} from './reward-choice-fixture.mjs';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

test('Vainilla daily: first visit adds one flower; repeat and quantity five never add extra flowers',async()=>{
 const db=schema();try{const f=await fixture(db,'vainillacoffee');assert.equal(f.card.stampPolicy,'daily');assert.equal(f.card.goal,9);
  assert.equal((await action(db,f,'stamp',{quantity:5})).status,400);assert.equal(f.card.stamps,0);
  assert.equal((await action(db,f,'stamp',{quantity:1})).status,200);assert.equal(f.card.stamps,1);
  assert.equal((await action(db,f,'stamp',{quantity:1})).data.error.code,'already_stamped_today');
  assert.equal((await action(db,f,'stamp',{quantity:5})).status,400);
  const card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;assert.equal(card.stamps,1);assert.equal(card.canStampToday,false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loyalty_events').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM per_item_reward_operations').get().n,0);
 }finally{db.close();}
});

test('Vainilla next local calendar day permits one new flower; Tijuana midnight is not a rolling 24-hour window',async()=>{
 assert.equal(testables.businessDay('America/Tijuana',new Date('2026-10-03T06:59:59Z')),'2026-10-02');
 assert.equal(testables.businessDay('America/Tijuana',new Date('2026-10-03T07:00:00Z')),'2026-10-03');
 const db=schema();try{const f=await fixture(db,'vainillacoffee');await action(db,f,'stamp',{quantity:1});
  // Move only fictitious local history to yesterday; the actual handler supplies today's day.
  const yesterday=new Date(Date.now()-86400000),day=testables.businessDay('America/Tijuana',yesterday);
  db.prepare('UPDATE loyalty_events SET created_at=?,business_day=? WHERE card_id=?').run(yesterday.toISOString(),day,f.card.id);
  const card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;assert.equal(card.canStampToday,true);
  assert.equal((await action(db,f,'stamp',{quantity:1})).status,200);assert.equal(f.card.stamps,2);
  assert.equal((await action(db,f,'stamp',{quantity:1})).status,409);
 }finally{db.close();}
});

test('Vainilla 8/9 plus a daily visit stays 9/9 until redeem; free drink resets to zero without a flower or decision',async()=>{
 const db=schema();try{const f=await fixture(db,'vainillacoffee');db.prepare('UPDATE loyalty_cards SET stamps=8 WHERE id=?').run(f.card.id);
  assert.equal((await action(db,f,'stamp',{quantity:4})).status,400);assert.equal(db.prepare('SELECT stamps FROM loyalty_cards WHERE id=?').get(f.card.id).stamps,8);
  assert.equal((await action(db,f,'stamp',{quantity:1})).status,200);assert.equal(f.card.stamps,9);
  for(const field of ['rewardChoicesPending','rewardsPending','rewardVersion'])assert.equal(Object.hasOwn(f.card,field),false);
  assert.equal((await action(db,f,'stamp',{quantity:1})).data.error.code,'reward_ready');
  assert.equal((await action(db,f,'reward-choice',{decision:'save'})).status,409);
  assert.equal((await action(db,f,'redeem')).status,200);assert.equal(f.card.stamps,0);assert.equal(f.card.redeemed,1);
  assert.equal((await action(db,f,'stamp',{quantity:1})).data.error.code,'already_stamped_today');
  const row=db.prepare('SELECT rewards_pending,reward_choices_pending FROM loyalty_cards WHERE id=?').get(f.card.id);assert.deepEqual({...row},{rewards_pending:0,reward_choices_pending:0});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reward_choice_operations').get().n,0);
 }finally{db.close();}
});

test('Vainilla daily unique index prevents races; per-item trigger cannot create a Vainilla purchase or decision',async()=>{
 const db=schema();try{const f=await fixture(db,'vainillacoffee');await action(db,f,'stamp',{quantity:1});
  const e=db.prepare('SELECT * FROM loyalty_events WHERE card_id=?').get(f.card.id),card=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);
  assert.throws(()=>db.prepare("INSERT INTO loyalty_events(id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,quantity,daily_limited) VALUES(?,?,?,?,?,'stamp',?,?,1,1)").run(crypto.randomUUID(),e.business_id,e.card_id,e.customer_id,e.employee_id,e.business_day,e.created_at),/UNIQUE/);
  assert.throws(()=>db.prepare("INSERT INTO per_item_reward_operations(id,business_id,card_id,customer_id,employee_id,kind,paid_items,before_stamps,before_rewards,before_version,business_day,created_at,before_choices) VALUES(?,?,?,?,?,'purchase',1,1,0,0,?,?,0)").run(crypto.randomUUID(),e.business_id,e.card_id,e.customer_id,e.employee_id,e.business_day,e.created_at),/reward_conflict/);
  assert.deepEqual(db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id),card);
 }finally{db.close();}
});

test('Daily configuration preserves Renace/MOON while Santofe remains per-item with multiple coffees and mandatory decisions',async()=>{
 assert.deepEqual(['renace','mooncoffee','vainillacoffee'].map(s=>[TENANTS[s].stampPolicy,TENANTS[s].rewardGoal,TENANTS[s].maxStampsPerTransaction]),[['daily',9,1],['daily',8,1],['daily',9,1]]);
 assert.equal(TENANTS.santofe.stampPolicy,'per_item');assert.equal(TENANTS.santofe.rewardGoal,10);
 const db=schema();try{const f=await fixture(db,'santofe');assert.equal((await action(db,f,'stamp',{quantity:8})).status,200);assert.equal((await action(db,f,'stamp',{quantity:5})).status,200);assert.equal(f.card.stamps,3);assert.equal(f.card.rewardChoicesPending,1);
  assert.equal((await action(db,f,'stamp',{quantity:1})).data.error.code,'reward_decision_required');assert.equal((await action(db,f,'reward-choice',{decision:'save'})).status,200);assert.equal(f.card.stamps,3);assert.equal(f.card.rewardsPending,1);
 }finally{db.close();}
});

test('Vainilla daily UI: bilingual guides, full vertical bouquet, no quantity/choice controls, responsive roles and PNG QR',async t=>{
 const db=schema(),f=await fixture(db,'vainillacoffee'),host=await server(db,f.slug),browser=await chromium.launch({channel:'msedge',headless:true});
 t.after(()=>browser.close());t.after(()=>new Promise(r=>host.app.close(r)));t.after(()=>db.close());
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const evidence=process.env.VAINILLA_DAILY_EVIDENCE;if(evidence)mkdirSync(evidence,{recursive:true});
 const sizes=[[360,800],[390,844],[393,852],[412,915]];
 async function fit(){for(const [width,height]of sizes){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}await page.setViewportSize({width:390,height:844});}
 async function shot(name){if(evidence)await page.screenshot({path:evidence+'/'+name+'.png',fullPage:true});}
 async function view(cookie,route){await context.clearCookies();if(cookie){const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:host.base}]);}await page.goto(host.base+'/?daily='+crypto.randomUUID()+'#'+route);await page.waitForSelector('#app-loader',{state:'detached'});await page.evaluate(()=>window.LoyaltyI18n.set('es'));await fit();}
 async function guide(role){for(const locale of ['es','en']){await page.evaluate(l=>window.LoyaltyI18n.set(l),locale);await page.click('#role-guide');const text=await page.locator('#renace-guide').innerText();assert.match(text,locale==='es'?/Máximo 1 flor por día calendario de Tijuana/:/Up to 1 flower per Tijuana calendar day/);assert.doesNotMatch(text,/1 café = 1 flor|1 coffee = 1 flower|No hay límite diario|There is no daily limit|Selecciona de 1 a 99|Select 1 to 99/);if(role==='customer')assert.match(text,locale==='es'?/nuevo ramo en 0\/9/:/starts at 0\/9/);await page.click('.guide-close');}}
 await view(null,'inicio');assert.match(await page.locator('.vainilla-card-rule').innerText(),/Máximo 1 flor/);await shot('01-vainilla-inicio-diario');
 await view(f.customer.cookie,'tarjeta');await shot('02-vainilla-cliente-0');await guide('customer');
 db.prepare('UPDATE loyalty_cards SET stamps=9 WHERE id=?').run(f.card.id);await view(f.customer.cookie,'tarjeta');assert.equal(await page.locator('.vainilla-flower-slot.is-earned').count(),9);assert.match(await page.locator('.vainilla-card h2').innerText(),/Tu bebida gratis está lista/);assert.equal(await page.locator('.reward-decision,.reward-balance').count(),0);await shot('03-vainilla-cliente-9');
 const pending=page.waitForEvent('download');await page.click('#download-card');const download=await pending,parts=[];for await(const p of await download.createReadStream())parts.push(p);
 const decoded=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const image=ctx.getImageData(0,0,c.width,c.height);return jsQR(image.data,c.width,c.height)?.data;},Buffer.concat(parts).toString('base64'));assert.equal(decoded,f.card.qrValue);if(evidence)await download.saveAs(evidence+'/04-vainilla-png-9.png');
 await view(f.staff.cookie,'empleado');await page.fill('#lookup input',f.phone);await page.click('#lookup button');await page.waitForSelector('#stamp');await fit();assert.equal(await page.locator('#stamp-plus,#stamp-minus,#reward-save,#reward-redeem-now').count(),0);assert.equal(await page.locator('#redeem').isEnabled(),true);await guide('employee');await page.evaluate(()=>window.LoyaltyI18n.set('es'));await shot('05-vainilla-mostrador-diario');
 await view(f.admin.cookie,'admin');assert.equal(await page.locator('th', {hasText:'Por decidir'}).count(),0);await guide('admin');await page.evaluate(()=>window.LoyaltyI18n.set('es'));await shot('06-vainilla-admin-diario');
 await view(f.admin.cookie,'cuenta');await page.waitForSelector('#profile-form');await fit();assert.deepEqual(errors,[]);await context.close();
});
