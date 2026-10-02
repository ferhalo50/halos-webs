import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import ExcelJS from 'exceljs';
const cases=[{slug:'vainillacoffee',base:'http://127.0.0.1:8790',goal:9,staff:'vainilla_staff_local',password:'Vainilla-staff-local928!',admin:'admin_vainilla_local',adminPassword:'Vainilla-admin-local928!',buy:4},{slug:'santofe',base:'http://127.0.0.1:8789',goal:10,staff:'santofe_staff_local',password:'Santofe-staff-local928!',admin:'admin_santofe_local',adminPassword:'Santofe-admin-local928!',buy:5}];
let serial=0;
async function api(t,path,cookie,body){const r=await fetch(t.base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function fixture(t){const phone=String((Date.now()+serial++)%10000000000).padStart(10,'0'),customer=await api(t,'/api/register',null,{name:'Ramo recompensas local',phone,pin:'4826'});assert.equal(customer.status,201);const staff=await api(t,'/api/login/staff',null,{username:t.staff,password:t.password}),admin=await api(t,'/api/login/staff',null,{username:t.admin,password:t.adminPassword});const card=(await api(t,'/api/card',customer.cookie)).data.card;return{phone,customer,staff,admin,card};}
async function purchase(t,f,quantity,card=f.card,extra={}){const r=await api(t,'/api/staff/stamp',f.staff.cookie,{cardId:card.id,quantity,expectedVersion:card.rewardVersion,operationId:crypto.randomUUID(),...extra});if(r.status===200)f.card=r.data.card;return r;}

async function saveChoices(t,f){while(f.card.rewardChoicesPending>0){const saved=await api(t,'/api/staff/reward-choice',f.staff.cookie,{cardId:f.card.id,decision:'save',expectedVersion:f.card.rewardVersion,operationId:crypto.randomUUID()});assert.equal(saved.status,200);f.card=saved.data.card;}}
test('Pending reward migration preserves known entitlements, daily cards and historical data without guessing',()=>{
 const db=new DatabaseSync(':memory:');try{
  const names=readdirSync(new URL('../migrations/',import.meta.url)).sort();for(const name of names.filter(n=>n<'0013'))db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  for(const [id,business,stamps] of [['partial','business_santofe',8],['full','business_santofe',10],['daily','business_renace',9]]){
   db.prepare('INSERT INTO users(id,business_id,role,name,secret_hash,secret_salt) VALUES(?,?,\'customer\',?,\'x\',\'x\')').run(id,business,id);
   db.prepare('INSERT INTO loyalty_cards(id,business_id,customer_id,qr_token,stamps,redeemed_count) VALUES(?,?,?,?,?,2)').run(id,business,id,'qr-'+id,stamps);
  }
  db.exec(readFileSync(new URL('../migrations/0013_pending_rewards.sql',import.meta.url),'utf8'));
  const row=id=>db.prepare('SELECT stamps,rewards_pending,redeemed_count,qr_token FROM loyalty_cards WHERE id=?').get(id);
  assert.deepEqual({...row('partial')},{stamps:8,rewards_pending:0,redeemed_count:2,qr_token:'qr-partial'});
  assert.deepEqual({...row('full')},{stamps:0,rewards_pending:1,redeemed_count:2,qr_token:'qr-full'});
  assert.deepEqual({...row('daily')},{stamps:9,rewards_pending:0,redeemed_count:2,qr_token:'qr-daily'});
  assert.throws(()=>db.exec("UPDATE loyalty_cards SET rewards_pending=-1 WHERE id='full'"),/CHECK/);
 }finally{db.close();}
});

test('Both per-item tenants accumulate multiple rewards and redeem once without changing progress; replay, concurrency and foreign QR are rejected',async()=>{
 const all=[];
 for(const t of cases){
  const f=await fixture(t);all.push({t,f});assert.equal((await purchase(t,f,8)).status,200);const r=await purchase(t,f,t.buy);assert.equal(r.status,200);assert.equal(f.card.stamps,3);assert.equal(f.card.rewardChoicesPending,1);assert.equal(f.card.rewardsPending,0);await saveChoices(t,f);assert.equal(f.card.rewardsPending,1);assert.equal(f.card.redeemed,0);assert.equal(r.data.operation.paidCoffees,t.buy);assert.equal(r.data.operation.freeCoffees,0);
  const request={cardId:f.card.id,expectedVersion:f.card.rewardVersion,operationId:crypto.randomUUID()};const redeemed=await api(t,'/api/staff/redeem',f.staff.cookie,request);assert.equal(redeemed.status,200);f.card=redeemed.data.card;assert.equal(f.card.stamps,3);assert.equal(f.card.rewardsPending,0);assert.equal(f.card.redeemed,1);
  assert.equal((await api(t,'/api/staff/redeem',f.staff.cookie,{...request,expectedVersion:f.card.rewardVersion,operationId:crypto.randomUUID()})).status,409);
  const again=await purchase(t,f,t.goal*3);assert.equal(again.status,200);assert.equal(f.card.stamps,3);assert.equal(f.card.rewardChoicesPending,3);await saveChoices(t,f);assert.equal(f.card.rewardsPending,3);
  const snapshot={...f.card},key=crypto.randomUUID(),payload={cardId:f.card.id,expectedVersion:snapshot.rewardVersion,operationId:key};
  const keys=[key,crypto.randomUUID()];const concurrent=await Promise.all(keys.map(operationId=>api(t,'/api/staff/redeem',f.staff.cookie,{...payload,operationId})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  f.card=(await api(t,'/api/card',f.customer.cookie)).data.card;assert.equal(f.card.rewardsPending,2);assert.equal(f.card.stamps,3);assert.equal(f.card.redeemed,2);assert.equal((await api(t,'/api/staff/redeem',f.staff.cookie,{...payload,expectedVersion:f.card.rewardVersion,operationId:keys[concurrent.findIndex(r=>r.status===200)]})).status,409);assert.deepEqual((await api(t,'/api/card',f.customer.cookie)).data.card,f.card);
  // Reusing a committed purchase key also cannot add a reward twice, even with a fresh snapshot.
  const buyKey=crypto.randomUUID();assert.equal((await purchase(t,f,19,f.card,{operationId:buyKey})).status,200);const after={...f.card};assert.equal((await purchase(t,f,19,f.card,{operationId:buyKey})).status,409);assert.deepEqual((await api(t,'/api/card',f.customer.cookie)).data.card,after);
  assert.equal((await api(t,'/api/staff/redeem',f.staff.cookie,{cardId:f.card.id})).status,409);
  const dashboard=await api(t,'/api/admin/dashboard?q='+f.phone,f.admin.cookie);assert.equal(dashboard.data.customers[0].rewards_pending,f.card.rewardsPending);
  let offset=0,clients=[],activity=[];for(const kind of ['clients','activity']){offset=0;do{const e=await api(t,'/api/admin/export/'+kind+'?offset='+offset,f.admin.cookie);(kind==='clients'?clients:activity).push(...e.data.rows);offset=e.data.nextOffset;}while(offset!==null);}
  assert.equal(clients.find(r=>r.id===f.card.id).rewards_pending,f.card.rewardsPending);const events=activity.filter(e=>e.card_id===f.card.id);assert.equal(events.filter(e=>e.event_type==='saved_reward_redeemed').length,2);assert.ok(events.some(e=>/recompensas generadas:/.test(e.reason)));assert.ok(events.some(e=>/bebida guardada canjeada; progreso 3\//.test(e.reason)));
  assert.equal((await api(t,'/api/staff/redeem',f.customer.cookie,payload)).status,403);
 }
 for(const {t,f} of all){const other=all.find(x=>x.t!==t);assert.equal((await api(t,'/api/staff/card?value='+encodeURIComponent(other.f.card.qrValue),f.staff.cookie)).status,404);assert.equal((await api(t,'/api/staff/redeem',f.staff.cookie,{cardId:other.f.card.id,expectedVersion:other.f.card.rewardVersion,operationId:crypto.randomUUID()})).status,404);}
 // Exact multiple-goal example requested by the user.
 const t=cases[0],f=await fixture(t);await purchase(t,f,8);await purchase(t,f,19);assert.equal(f.card.stamps,0);assert.equal(f.card.rewardChoicesPending,3);assert.equal(f.card.rewardsPending,0);assert.equal(f.card.redeemed,0);
 const race=await fixture(t),snapshot=race.card;const parallel=await Promise.all([purchase(t,race,1,snapshot),purchase(t,race,2,snapshot)]);assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);const after=(await api(t,'/api/card',race.customer.cookie)).data.card;assert.equal(after.stamps,parallel.find(r=>r.status===200).data.operation.paidCoffees);assert.equal(after.rewardsPending,0);assert.equal((await api(t,'/api/staff/stamp',race.staff.cookie,{cardId:after.id,quantity:19})).status,409);
});

test('Client, counter, details, Admin and XLSX expose separate rewards in ES/EN without changing card geometry or QR',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const evidence=process.env.PENDING_REWARDS_EVIDENCE;if(evidence)mkdirSync(evidence,{recursive:true});
 for(const tenant of cases){
  const f=await fixture(tenant);await purchase(tenant,f,8);await purchase(tenant,f,tenant.buy);await saveChoices(tenant,f);
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function login(cookie,route){await context.clearCookies();const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:tenant.base}]);await page.goto(tenant.base+'/?testRole='+crypto.randomUUID()+'#'+route);await page.waitForSelector('#app-loader',{state:'detached'});await page.evaluate(()=>window.LoyaltyI18n.set('es'));}
  await login(f.customer.cookie,'tarjeta');await page.waitForSelector('#qr svg',{state:'attached'});assert.equal(await page.locator('.reward-count').innerText(),'1');
  for(const [width,height] of [[360,800],[390,844],[393,852],[412,915],[1366,768],[1440,900]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.locator('.reward-balance').evaluate(n=>n.getBoundingClientRect().top<innerHeight-64),'reward must be visible on opening the card');const faces=await page.locator('.loyalty-card-face').evaluateAll(ns=>ns.map(n=>[n.offsetWidth,n.offsetHeight]));if(faces.length===2)assert.deepEqual(faces[0],faces[1]);}
  await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.match(await page.locator('.reward-balance').innerText(),/Free drinks available/);await page.evaluate(()=>window.LoyaltyI18n.set('es'));await page.setViewportSize({width:390,height:844});if(evidence)await page.screenshot({path:evidence+'/'+tenant.slug+'-cliente.png',fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.click('#download-card');const download=await downloadPromise,parts=[];for await(const part of await download.createReadStream())parts.push(part);const qr=await page.evaluate(async encoded=>{const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,c.width,c.height);return jsQR(p.data,c.width,c.height)?.data;},Buffer.concat(parts).toString('base64'));assert.equal(qr,f.card.qrValue);
  await login(f.staff.cookie,'empleado');await page.waitForSelector('#lookup');await page.fill('#lookup input',f.phone);await page.click('#lookup button');await page.waitForSelector('#redeem');assert.equal(await page.locator('#staff-card .reward-count').innerText(),'1');assert.equal(await page.locator('#redeem').isEnabled(),true);await page.locator('#staff-card').evaluate(async n=>{await Promise.all(n.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});if(evidence)await page.screenshot({path:evidence+'/'+tenant.slug+'-mostrador.png',fullPage:true});
  await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.equal(await page.locator('#redeem').innerText(),'Redeem free drink');await page.evaluate(()=>window.LoyaltyI18n.set('es'));await page.evaluate(()=>window.LoyaltyI18n.set('en'));let message='';page.once('dialog',d=>{message=d.message();return d.accept();});await page.click('#redeem');await page.waitForFunction(()=>document.querySelector('#staff-card .reward-count')?.textContent==='0');assert.equal(await page.locator('#redeem').isDisabled(),true);assert.ok(message.startsWith('Redeem free '));assert.equal((await api(tenant,'/api/card',f.customer.cookie)).data.card.stamps,3);
  await login(f.admin.cookie,'admin');await page.waitForSelector('#customer-search');await page.fill('#customer-search input',f.phone);await page.click('#customer-search button');await page.waitForFunction(()=>document.querySelectorAll('.customers-panel tbody tr').length===1);assert.ok((await page.locator('.customers-panel thead').textContent()).includes('Gratis'));assert.ok((await page.locator('.mobile-reward-count').innerText()).includes('Gratis: 0'));assert.equal(await page.locator('td[data-label="Bebidas gratis disponibles"]').innerText(),'0');
  for(const [width,height] of [[360,800],[390,844],[393,852],[412,915]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:390,height:844});if(evidence)await page.screenshot({path:evidence+'/'+tenant.slug+'-admin.png',fullPage:true});await page.click('.adjust-stamps');await page.waitForSelector('#adjust-form');assert.match(await page.locator('#adjust-form').innerText(),/Bebidas gratis disponibles/);await page.click('#cancel-adjust');
  await page.evaluate(()=>window.LoyaltyI18n.set('en'));const xlsxPromise=page.waitForEvent('download');await page.click('#export-customers');const xlsx=await xlsxPromise,chunks=[];for await(const part of await xlsx.createReadStream())chunks.push(part);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.concat(chunks));const sheet=wb.worksheets[0];assert.equal(sheet.getCell(4,10).value,'Free drinks available');assert.equal(sheet.getCell(5,10).value,0);assert.equal(sheet.getCell(4,9).value,'Fecha de registro');assert.equal(sheet.getCell(4,11).value,'Rewards awaiting decision');assert.equal(sheet.getCell(5,11).value,0);assert.deepEqual(errors,[]);await context.close();
 }
});
