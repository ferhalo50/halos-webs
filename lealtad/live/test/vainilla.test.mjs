import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {TENANTS,resolveTenant} from '../worker/tenants.js';
const base='http://127.0.0.1:8790',pin='4826';
const adminCredentials={username:'admin_vainilla_local',password:'Vainilla-admin-local928!'},staffCredentials={username:'vainilla_staff_local',password:'Vainilla-staff-local928!'};
let serial=0;
const phone=()=>String((Date.now()+serial++)%10000000000).padStart(10,'0');
const sizes=[[360,800],[390,844],[393,852],[412,915],[1366,768],[1440,900]];
async function api(path,{body,cookie,host=base}={}){if(['/api/staff/stamp','/api/staff/redeem'].includes(path)&&body&&body.expectedVersion===undefined){const found=await api('/api/staff/card?value='+body.cardId,{cookie,host});if(found.status===200&&found.data.card.stampPolicy==='per_item')body={...body,expectedVersion:found.data.card.rewardVersion,operationId:crypto.randomUUID()};}const r=await fetch(host+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function account(stamps=0){const number=phone(),created=await api('/api/register',{body:{name:'Cliente Vainilla',phone:number,pin}});assert.equal(created.status,201);const card=(await api('/api/card',{cookie:created.cookie})).data.card;if(stamps){const staff=await api('/api/login/staff',{body:staffCredentials});assert.equal((await api('/api/staff/stamp',{cookie:staff.cookie,body:{cardId:card.id,quantity:stamps}})).status,200);}return{...created,card,phone:number};}
async function loginPage(page,number){await page.goto(base+'/#login');await page.fill('[name="login"]',number);await page.fill('[name="secret"]',pin);await page.click('#auth-form button');await page.waitForSelector('#qr svg',{state:'attached'});await page.waitForSelector('#app-loader',{state:'detached'});}

test('Vainilla has nine per-item flowers, exact links and an isolated production hostname',()=>{
 const t=resolveTenant(new URL(base),{DEV_TENANT:'vainillacoffee'});assert.equal(t.slug,'vainillacoffee');assert.equal(t.rewardGoal,9);assert.equal(t.stampPolicy,'per_item');assert.equal(t.maxStampsPerTransaction,99);assert.deepEqual(Object.keys(t.stampStyles),['flower']);assert.equal(t.hostname,'vainillacoffee.haloswebs.com');
 const production=resolveTenant(new URL('https://vainillacoffee.haloswebs.com/?business=renace&business_id=business_santofe'),{DEV_TENANT:'mooncoffee',ALLOW_DEMO:'true'});assert.equal(production.slug,'vainillacoffee');assert.equal(production.rewardGoal,9);assert.equal(production.stampPolicy,'per_item');assert.equal(production.demo,false);
 assert.equal(resolveTenant(new URL('https://vainillacoffee.haloswebs.com.other.test'),{}),null);
 assert.deepEqual(t.socialLinks.map(l=>l.url),['https://www.instagram.com/vainillacoffee.mx?stkn=MTIxaW1pcW42cm5xag==','https://www.tiktok.com/@vainilla.coffee6?_r=1&_t=ZS-9ACJRKwC8f4','https://maps.app.goo.gl/V33tbMBdwbxGe34XA']);
 for(const [slug,goal] of [['renace',9],['mooncoffee',8],['santofe',10]]){assert.equal(resolveTenant(new URL('https://'+TENANTS[slug].hostname),{}).slug,slug);assert.equal(TENANTS[slug].rewardGoal,goal);}
});

test('Vainilla real local cards preserve vertical geometry, all flower states, ES/EN, QR flip and PNG decoding',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#inicio');await page.waitForSelector('.vainilla-card');await page.waitForSelector('#app-loader',{state:'detached'});assert.equal(await page.locator('.vainilla-flower-slot').count(),9);assert.equal(await page.locator('.vainilla-flower-slot img').count(),0);
 for(const {url} of TENANTS.vainillacoffee.socialLinks){const link=page.locator(`.visit-us a[href="${url}"]`);assert.equal(await link.count(),1);assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');}
 for(const [width,height] of sizes){await page.setViewportSize({width,height});const positions=await page.evaluate(()=>({nav:document.querySelector('#primary-navigation').getBoundingClientRect().bottom,card:document.querySelector('.vainilla-public-card').getBoundingClientRect().top}));assert.ok(positions.nav<=positions.card,'public team access must be before the card');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 for(const route of ['login','registro']){await page.goto(base+'/#'+route);await page.waitForSelector('#auth-form');for(const [width,height] of sizes){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}}
 let last;
 for(const flowers of [0,1,3,8,9]){
  await context.clearCookies();last=await account(flowers);await loginPage(page,last.phone);assert.equal(await page.locator('.vainilla-flower-slot.is-earned img').count(),flowers%9);assert.equal(await page.locator('.personal-card .stamp').count(),0);
  assert.ok(await page.locator('.vainilla-flower-slot').first().evaluate(n=>getComputedStyle(n).left!=='auto'&&getComputedStyle(n).top!=='auto'&&!n.hasAttribute('style')),'flowers must be positioned by CSP-compatible external CSS');
  assert.equal(await page.locator('.premium-customer .reward-count').innerText(),String(Math.floor(flowers/9)));
  for(const [width,height] of sizes){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.locator('.vainilla-card').evaluate(n=>n.scrollHeight<=n.clientHeight+1));const faces=await page.locator('.loyalty-card-face').evaluateAll(ns=>ns.map(n=>({w:n.offsetWidth,h:n.offsetHeight})));assert.deepEqual(faces[0],faces[1]);assert.ok(faces[0].h>faces[0].w);}
  for(const lang of ['en','es']){await page.evaluate(l=>window.LoyaltyI18n.set(l),lang);assert.equal(await page.locator('.vainilla-card-rule').innerText(),lang==='en'?'1 coffee = 1 flower':'1 café = 1 flor');assert.ok((await page.locator('.vainilla-card-owner').innerText()).includes('Cliente Vainilla'));}
  await page.click('#flip-card');assert.equal(await page.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'true');await page.click('#flip-card');
 }
 for(const lang of ['es','en']){await page.evaluate(l=>window.LoyaltyI18n.set(l),lang);await page.click('[data-renace-guide="customer"]');const guide=await page.locator('#renace-guide').innerText();assert.ok(guide.includes(lang==='es'?'9 flores':'9 flowers'));assert.ok(!guide.includes('Santofé'));assert.ok(!guide.includes('fictici'));await page.click('.guide-close');}
 const pending=page.waitForEvent('download');await page.click('#download-card');const download=await pending,chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
 const qr=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);return jsQR(pixels.data,canvas.width,canvas.height)?.data;},Buffer.concat(chunks).toString('base64'));
 assert.equal(qr,last.card.qrValue);assert.ok(qr.startsWith('vainillacoffee:'));assert.deepEqual(errors,[]);await context.close();
});

test('Vainilla local authentication, isolation, role permissions, multiple flowers, reward crossing, audit and exports',async()=>{
 const staff=await api('/api/login/staff',{body:staffCredentials}),admin=await api('/api/login/staff',{body:adminCredentials});assert.equal(staff.status,200);assert.equal(admin.status,200);
 assert.equal((await api('/api/admin/dashboard',{cookie:staff.cookie})).status,403);
 const customer=await account(),id=customer.card.id;
 assert.equal((await api('/api/login/customer',{body:{phone:customer.phone,pin}})).status,200);
 assert.equal((await api('/api/staff/stamp',{cookie:customer.cookie,body:{cardId:id,quantity:1}})).status,403);
 assert.equal((await api('/api/staff/card?value='+encodeURIComponent(customer.card.qrValue),{cookie:staff.cookie})).data.card.id,id);
 for(const host of ['http://127.0.0.1:8787','http://127.0.0.1:8788','http://127.0.0.1:8789']){
  const other=await api('/api/register',{host,body:{name:'Otro tenant local',phone:customer.phone,pin}});assert.equal(other.status,201);
  const otherCard=(await api('/api/card',{host,cookie:other.cookie})).data.card;
  assert.equal((await api('/api/me',{host,cookie:customer.cookie})).status,401);assert.equal((await api('/api/me',{cookie:other.cookie})).status,401);
  assert.equal((await api('/api/staff/card?value='+encodeURIComponent(otherCard.qrValue),{cookie:staff.cookie})).status,404);
  assert.equal((await api('/api/staff/stamp',{cookie:staff.cookie,body:{cardId:otherCard.id,quantity:1}})).status,404);
  const foreignCredentials=host.endsWith('8787')?{username:'mostrador_local',password:'Staff-test-928!'}:host.endsWith('8788')?{username:'moon_staff_local',password:'Moon-staff-local928!'}:{username:'santofe_staff_local',password:'Santofe-staff-local928!'};
  const foreignStaff=await api('/api/login/staff',{host,body:foreignCredentials});assert.equal(foreignStaff.status,200);
  assert.equal((await api('/api/staff/card?value='+encodeURIComponent(customer.card.qrValue),{host,cookie:foreignStaff.cookie})).status,404);
  assert.equal((await api('/api/staff/stamp',{host,cookie:foreignStaff.cookie,body:{cardId:id,quantity:1}})).status,404);
  const exported=(await api('/api/admin/export/clients?offset=0',{cookie:admin.cookie})).data.rows;assert.ok(!exported.some(r=>r.id===otherCard.id));
 }
 for(const [quantity,expected] of [[1,1],[1,2],[5,7],[1,8],[1,0]]){const r=await api('/api/staff/stamp',{cookie:staff.cookie,body:{cardId:id,quantity}});assert.equal(r.status,200);assert.equal(r.data.card.stamps,expected);assert.equal(r.data.operation.freeCoffees,0);}
 const ready=(await api('/api/card',{cookie:customer.cookie})).data.card;assert.equal(ready.stamps,0);assert.equal(ready.rewardsPending,1);assert.equal(ready.redeemed,0);
 const redeemed=await api('/api/staff/redeem',{cookie:staff.cookie,body:{cardId:id}});assert.equal(redeemed.data.card.stamps,0);assert.equal(redeemed.data.card.redeemed,1);assert.equal((await api('/api/staff/redeem',{cookie:staff.cookie,body:{cardId:id}})).status,409);
 for(const [before,total,after,paid] of [[8,1,0,1],[8,2,1,2],[8,4,3,4],[9,1,1,1],[9,10,1,10]]){
  const c=await account(before),r=await api('/api/staff/stamp',{cookie:staff.cookie,body:{cardId:c.card.id,quantity:total}});assert.equal(r.status,200);assert.equal(r.data.card.stamps,after);assert.equal(r.data.operation.paidCoffees,paid);assert.equal(r.data.operation.freeCoffees,0);assert.equal(r.data.card.redeemed,0);assert.equal(r.data.card.rewardsPending,Math.floor((before+total)/9));
 }
 assert.equal((await api('/api/staff/stamp',{cookie:staff.cookie,body:{cardId:id,quantity:100}})).status,400);
 const dash=(await api('/api/admin/dashboard?q='+customer.phone,{cookie:admin.cookie})).data;assert.equal(dash.business.id,'business_vainillacoffee');assert.equal(dash.customers.length,1);
 assert.equal((await api('/api/admin/customers/'+customer.data.user.id+'/stamps',{cookie:admin.cookie,body:{delta:1,expectedStamps:0,reason:'Ajuste local de prueba'}})).status,200);
 let offset=0,events=[];do{const exportPage=await api('/api/admin/export/activity?offset='+offset,{cookie:admin.cookie});assert.equal(exportPage.status,200);events.push(...exportPage.data.rows);offset=exportPage.data.nextOffset;}while(offset!==null);
 assert.ok(events.some(e=>e.card_id===id&&e.event_type==='redeem'));assert.ok(events.some(e=>e.card_id===id&&e.event_type==='stamp_added'));
 const employee=await api('/api/admin/employees',{cookie:admin.cookie,body:{name:'Apoyo local Vainilla',username:'vainilla_'+phone(),password:'Prueba-equipo-928!'}});assert.equal(employee.status,201);
});

test('Per-item rewards preserve the paid quantity and reject stale or foreign operations atomically',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  db.exec("INSERT INTO businesses(id,slug,name,reward_goal,stamp_policy) VALUES('business_vainillacoffee','vainillacoffee','Vainilla Coffee',9,'per_item'); INSERT INTO users(id,business_id,role,name,secret_hash,secret_salt) VALUES('customer','business_vainillacoffee','customer','Local','x','x'),('staff','business_vainillacoffee','employee','Staff','x','x'); INSERT INTO loyalty_cards(id,business_id,customer_id,qr_token) VALUES('card','business_vainillacoffee','customer','local-token');");
  const insert=db.prepare("INSERT INTO per_item_reward_operations VALUES(?,'business_vainillacoffee','card','customer','staff','purchase',?,?,0,?,'2026-10-01','2026-10-01T10:00:00.000Z')");
  for(let before=0;before<9;before++)for(let total=1;total<=99;total++){
   db.prepare("UPDATE loyalty_cards SET stamps=?,rewards_pending=0,redeemed_count=0,reward_version=reward_version+1 WHERE id='card'").run(before);const v=db.prepare("SELECT reward_version FROM loyalty_cards WHERE id='card'").get().reward_version;
   insert.run(before+'-'+total,total,before,v);const result=db.prepare("SELECT stamps,rewards_pending,redeemed_count FROM loyalty_cards WHERE id='card'").get();assert.equal(result.stamps,(before+total)%9);assert.equal(result.rewards_pending,Math.floor((before+total)/9));assert.equal(result.redeemed_count,0);
   const audit=db.prepare("SELECT quantity,metadata FROM loyalty_events WHERE id=?").get(before+'-'+total);assert.equal(audit.quantity,total);assert.equal(JSON.parse(audit.metadata).rewards_generated,result.rewards_pending);
  }
  const snapshot=db.prepare("SELECT * FROM loyalty_cards WHERE id='card'").get(),n=db.prepare('SELECT COUNT(*) AS n FROM loyalty_events').get().n;
  assert.throws(()=>insert.run('stale',2,snapshot.stamps,snapshot.reward_version-1),/reward_conflict/);assert.deepEqual(db.prepare("SELECT * FROM loyalty_cards WHERE id='card'").get(),snapshot);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loyalty_events').get().n,n);
  assert.throws(()=>db.exec("INSERT INTO per_item_reward_operations VALUES('foreign','business_santofe','card','customer','staff','purchase',1,0,0,0,'2026-10-01','2026-10-01T10:00:00.000Z')"),/reward_conflict/);
 }finally{db.close();}
});

test('Vainilla staff/admin layouts, bilingual controls, PWA manifest, PNG icons and cached bouquet assets',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const customer=await account(3);
 for(const [role,credentials] of [['employee',staffCredentials],['admin',adminCredentials]]){
  await context.clearCookies();await page.goto(base+'/#equipo');await page.fill('[name="login"]',credentials.username);await page.fill('[name="secret"]',credentials.password);await page.click('#auth-form button');await page.waitForFunction(expected=>document.body.dataset.role===expected,role);await page.waitForSelector('#counter-link',{state:'visible'});if(role==='admin')await page.click('#counter-link');await page.waitForSelector('#lookup');await page.fill('#lookup input',customer.phone);await page.click('#lookup button');await page.waitForSelector('#stamp');assert.equal(await page.locator('#admin-link').isVisible(),role==='admin');
  for(const [width,height] of sizes){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  for(const lang of ['en','es']){await page.evaluate(l=>window.LoyaltyI18n.set(l),lang);await page.click('[data-renace-guide="employee"]');const guide=await page.locator('#renace-guide').innerText();assert.ok(guide.includes('9 paid coffees')||guide.includes('9 cafés pagados'));assert.ok(!guide.includes('Santofé'));await page.click('.guide-close');assert.equal(await page.locator('#stamp').innerText(),lang==='en'?'Process coffees':'Procesar cafés');}
  if(role==='employee'){await page.evaluate(()=>window.LoyaltyI18n.set('en'));for(let n=0;n<3;n++)await page.click('#stamp-plus');let confirmation='';page.once('dialog',dialog=>{confirmation=dialog.message();return dialog.accept();});const operation=page.waitForResponse(r=>r.url().endsWith('/api/staff/stamp')&&r.request().method()==='POST');await page.click('#stamp');assert.equal((await (await operation).json()).card.stamps,7);assert.ok(confirmation.includes('Paid coffees: 4'));assert.ok(confirmation.includes('Confirm for Cliente Vainilla?'));await page.waitForFunction(()=>document.querySelectorAll('#staff-card .is-earned').length===7);
   for(let n=0;n<2;n++)await page.click('#stamp-plus');page.once('dialog',dialog=>{confirmation=dialog.message();return dialog.accept();});const crossing=page.waitForResponse(r=>r.url().endsWith('/api/staff/stamp')&&r.request().method()==='POST');await page.click('#stamp');assert.equal((await (await crossing).json()).card.stamps,1);assert.ok(confirmation.includes('Paid coffees: 3'));assert.ok(confirmation.includes('Rewards earned: 1'));await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Paid coffees recorded. Check progress and available free drinks.');
  }
  if(role==='admin'){await page.click('#admin-link');await page.waitForSelector('#customer-search');for(const [width,height] of sizes){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.equal(await page.locator('.stats .panel').nth(1).locator('span').innerText(),'Flowers today');}
 }
 const manifest=await(await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.name,'Vainilla Coffee · Lealtad');assert.equal(manifest.short_name,'Vainilla Coffee');assert.equal(manifest.theme_color,'#fffaf0');assert.equal(manifest.background_color,'#fffaf0');
 for(const size of [192,512]){const icon=manifest.icons.find(i=>i.sizes===size+'x'+size);assert.equal(icon.purpose,'any maskable');const bytes=Buffer.from(await(await fetch(base+icon.src)).arrayBuffer());assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  assert.equal(await page.evaluate(async({src,size})=>{const image=await createImageBitmap(await(await fetch(src)).blob()),canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,size,size).data;for(let y=0;y<size;y++)for(let x=0;x<size;x++){if(Math.hypot(x-size/2,y-size/2)<=size*.4+1)continue;const i=(y*size+x)*4;if(Math.max(Math.abs(data[i]-255),Math.abs(data[i+1]-250),Math.abs(data[i+2]-240))>10)return false;}return true;},{src:icon.src,size}),true,'branding must stay inside the maskable safe circle');
 }
 const sw=await(await fetch(base+'/service-worker.js')).text();for(const asset of ['vainilla.js','vainilla.css','bouquet.jpg','flower.svg','icon-192.png','icon-512.png'])assert.ok(sw.includes(asset));assert.ok(sw.includes("url.pathname.startsWith('/api/')"));assert.deepEqual(errors,[]);await context.close();
});

test('Vainilla navigation preserves the active counter when an obsolete Admin request succeeds or fails',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 for(const status of [200,503]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.request.post(base+'/api/login/staff',{data:adminCredentials});const page=await context.newPage();
  // Observe completion of the actual API JSON consumption and its next paint.
  await page.addInitScript(()=>{const original=window.fetch;window.dashboardConsumed=new Promise(resolve=>{window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).includes('/api/admin/dashboard?')){const json=response.json.bind(response);response.json=async()=>{try{return await json();}finally{requestAnimationFrame(resolve);}};}return response;};});});
  let release,seen;const blocked=new Promise(r=>release=r),requested=new Promise(r=>seen=r);
  await page.route('**/api/admin/dashboard?**',async route=>{const response=await route.fetch();seen();await blocked;await route.fulfill(status===200?{response}:{status,contentType:'application/json',body:JSON.stringify({ok:false,error:{message:'Controlled local failure'}})});});
  await page.goto(base+'/#admin');await requested;await page.waitForSelector('#app-loader',{state:'detached'});
  await page.click('#counter-link');await page.locator('#lookup input').fill('0000090003');release();
  await page.evaluate(()=>window.dashboardConsumed);
  assert.equal(new URL(page.url()).hash,'#empleado');assert.equal(await page.locator('#lookup input').inputValue(),'0000090003');assert.equal(await page.locator('#customer-search').count(),0);assert.doesNotMatch(await page.locator('#app').innerText(),/No pudimos cargar esta vista/);
  await context.close();
 }
});

test('Vainilla service worker precaches its complete shell and renders the public bouquet offline',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(base+'/');
 await page.evaluate(()=>navigator.serviceWorker.register('/service-worker.js'));
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active,{},{timeout:10000});
 const result=await page.evaluate(async()=>{await navigator.serviceWorker.ready;const names=await caches.keys(),name=names.find(n=>n.startsWith(window.LoyaltyTenant.slug+'-shell-')),cache=await caches.open(name);return{names,paths:(await cache.keys()).map(r=>new URL(r.url).pathname)};});
 assert.ok(result.paths.includes('/assets/vainilla/flower.svg'),JSON.stringify(result));assert.ok(result.paths.includes('/assets/vainilla/icon-512.png'));assert.ok(result.paths.includes('/assets/vainilla.js'));assert.ok(!result.paths.some(path=>path.startsWith('/api/')));
 await page.context().setOffline(true);await page.reload();await page.waitForSelector('.vainilla-card');assert.equal(await page.locator('.vainilla-flower-slot').count(),9);
});
