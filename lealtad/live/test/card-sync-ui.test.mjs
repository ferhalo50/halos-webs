import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {mkdir} from 'node:fs/promises';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,server,invoke,slugs} from './reward-choice-fixture.mjs';
const sizes=[[360,800],[390,844],[412,915],[430,932],[768,1024],[1366,768]];
async function adjust(db,f,type,quantity){const c=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);const r=await invoke(db,f.slug,'/api/admin/customers/'+f.customer.data.user.id+'/stamps',{cookie:f.admin.cookie,body:{action:type,quantity,reason:'Corrección ficticia para sincronización',expectedStamps:c.stamps,expectedVersion:c.reward_version,expectedUpdatedAt:c.updated_at,operationId:crypto.randomUUID()}});assert.equal(r.status,200);return r;}
async function pageFor(browser,base,cookie,hash){const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await ctx.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());const [name,value]=cookie.split('=');await ctx.addCookies([{name,value,url:base}]);const page=await ctx.newPage();await page.goto(base+'/#'+hash);await page.waitForSelector('#app-loader',{state:'detached'});return{ctx,page};}
for(const slug of slugs)test(slug+': live customer/counter changes preserve details, QR face, lookup, quantity, selection and focus',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page:customer}=await pageFor(browser,base,f.customer.cookie,'tarjeta'),{page:staff}=await pageFor(browser,base,f.staff.cookie,'empleado');const errors=[];for(const p of [customer,staff])p.on('pageerror',e=>errors.push(e.message));
 let counterReads=0;staff.on('request',r=>{if(r.url().includes('/api/staff/card'))counterReads++;});
 await staff.clock.install();await staff.clock.runFor(16000);assert.equal(counterReads,0,'no polling without selected card');
 await staff.fill('#lookup input',f.phone);await staff.click('#lookup button');await staff.waitForSelector('#stamp');
 await customer.locator('.loyalty-card-details summary').click();await customer.click('#flip-card');
 await staff.fill('#lookup input','No borrar este texto');await staff.focus('#lookup input');
 if(slug==='santofe'){await staff.click('#stamp-plus');await staff.click('#stamp-plus');await staff.focus('#lookup input');}
 const changed=await adjust(db,f,'add',2);const start=performance.now();
 await staff.clock.runFor(5000);await staff.waitForFunction(()=>document.querySelector('#staff-card .stamp.filled,.vainilla-flower.is-filled')||document.querySelector('#staff-card').textContent.includes('2 /'));
 await customer.waitForFunction(()=>document.querySelector('.personal-card').textContent.match(/2\s*\/\s*(8|9|10)/),{timeout:18000});
 assert.equal(await customer.locator('.loyalty-card-details').getAttribute('open'),'');assert.equal(await customer.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'true');
 assert.equal(await staff.locator('#lookup input').inputValue(),'No borrar este texto');assert.equal(await staff.evaluate(()=>document.activeElement===document.querySelector('#lookup input')),true);
 if(slug==='santofe')assert.equal(await staff.locator('#stamp-quantity').innerText(),'3');
 assert.equal(changed.data.card.stamps,2);console.log(slug+' local visible sync observed within '+Math.round(performance.now()-start)+' ms (counter clock advanced)');
 await adjust(db,f,'remove',1);await staff.clock.runFor(5000);await staff.waitForFunction(()=>document.querySelector('#staff-card').textContent.match(/1\s*\/\s*(8|9|10)/));
 await adjust(db,f,'clear',1);await staff.clock.runFor(5000);await staff.waitForFunction(()=>document.querySelector('#staff-card').textContent.match(/0\s*\/\s*(8|9|10)/));
 if(slug==='santofe'){await adjust(db,f,'reward_add',3);await staff.clock.runFor(5000);await staff.waitForFunction(()=>document.querySelector('.reward-count')?.textContent==='3');assert.equal(await staff.locator('#stamp-quantity').innerText(),'3');}
 assert.deepEqual(errors,[]);
});

test('adaptive steady customer/counter budgets and real local counter latency',async t=>{
 const db=schema(),f=await fixture(db,'renace'),{app,base}=await server(db,'renace'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page:staff}=await pageFor(browser,base,f.staff.cookie,'empleado');await staff.fill('#lookup input',f.phone);await staff.click('#lookup button');await staff.waitForSelector('#stamp');
 const start=performance.now();await adjust(db,f,'add',2);await staff.waitForFunction(()=>document.querySelector('#staff-card').textContent.match(/2\s*\/\s*9/));const latency=performance.now()-start;assert.ok(latency<8000);console.log('Measured local counter change-to-display latency: '+Math.round(latency)+' ms (real clock)');
 const {page:customer}=await pageFor(browser,base,f.customer.cookie,'tarjeta');
 for(const [page,endpoint,budget] of [[customer,'/api/card',4],[staff,'/api/staff/card',12]]){
  await page.clock.install();let count=0;page.on('request',r=>{if(r.url().includes(endpoint))count++;});const ready=page.waitForResponse(r=>r.url().includes(endpoint));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(1);await ready;
  // Advance one second at a time, allowing each response/finally to settle.
  for(let i=0;i<20;i++){await page.clock.runFor(1000);await new Promise(r=>setTimeout(r,20));}
  const initial=count;for(let i=0;i<60;i++){await page.clock.runFor(1000);await new Promise(r=>setTimeout(r,20));}
  assert.ok(count-initial<=budget+1&&count-initial>=budget-1,endpoint+' observed '+(count-initial));console.log(endpoint+' steady requests in 60 simulated seconds: '+(count-initial));
 }
});

test('sync suspends hidden/offline, resumes focus/online, coalesces reads, rejects late responses and expires session',async t=>{
 const db=schema(),f=await fixture(db,'renace'),second=await fixture(db,'renace'),{app,base}=await server(db,'renace'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {ctx,page}=await pageFor(browser,base,f.staff.cookie,'empleado');await page.fill('#lookup input',f.phone);await page.click('#lookup button');await page.waitForSelector('#stamp');await page.clock.install();
 let reads=0;page.on('request',r=>{if(r.url().includes('/api/staff/card'))reads++;});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(60000);assert.equal(reads,0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForResponse(r=>r.url().includes('/api/staff/card'));
 await ctx.setOffline(true);const offline=reads;await page.clock.runFor(60000);assert.equal(reads,offline);
 await ctx.setOffline(false);await page.waitForResponse(r=>r.url().includes('/api/staff/card'));
 let release;const held=new Promise(r=>release=r);let intercepted=false;
 await page.route('**/api/staff/card?value='+encodeURIComponent(f.card.id),async route=>{intercepted=true;const response=await route.fetch();await held;await route.fulfill({response}).catch(error=>{if(!/already handled|Target.*closed/.test(error.message))throw error;});});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(1);await page.waitForFunction(()=>true);for(let i=0;!intercepted&&i<20;i++)await new Promise(r=>setTimeout(r,20));assert.equal(intercepted,true);
 const before=reads;await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});await page.clock.runFor(1000);assert.equal(reads,before,'one in-flight poll');
 await page.fill('#lookup input',second.phone);await page.click('#lookup button');await page.waitForFunction(phone=>document.querySelector('.customer-summary').textContent.includes(phone),second.phone);release();await page.unroute('**/api/staff/card?value='+encodeURIComponent(f.card.id));
 await adjust(db,second,'add',3);await page.clock.runFor(5000);await page.waitForFunction(()=>document.querySelector('#staff-card').textContent.match(/3\s*\/\s*9/));
 db.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE user_id=?").run(f.staff.data.user.id);await page.clock.runFor(5000);await page.waitForURL('**/#equipo');
 const final=reads;await page.clock.runFor(60000);assert.equal(reads,final);
});

for(const slug of slugs)test(slug+': remove/clear and saved-reward controls, confirmation, accessibility and responsive ES/EN',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 db.prepare('UPDATE loyalty_cards SET stamps=7,rewards_pending=? WHERE id=?').run(slug==='santofe'?5:0,f.card.id);
 const {page}=await pageFor(browser,base,f.admin.cookie,'admin');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const locale of ['es','en'])for(const [width,height] of sizes){
  await page.setViewportSize({width,height});await page.evaluate(l=>window.LoyaltyI18n.set(l),locale);await page.click('.adjust-stamps');
  const options=await page.locator('[name=action] option').evaluateAll(nodes=>nodes.map(n=>n.value));assert.equal(options.includes('reward_add'),slug==='santofe');
  await page.selectOption('[name=action]','remove');await page.fill('#adjust-quantity','2');await page.fill('dialog textarea','Corrección local con motivo');await page.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);assert.match(await page.locator('#adjust-preview').innerText(),/7 → 5/);
  await page.click('#confirm-adjust');await page.waitForFunction(()=>document.querySelector('#confirm-adjust').textContent.includes('−2'));
  assert.match(await page.locator('#adjust-preview').innerText(),new RegExp(locale==='es'?(slug==='vainillacoffee'?'2 flores':'2 sellos'):(slug==='vainillacoffee'?'2 flowers':'2 stamps')));
  const bounds=await page.locator('dialog').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));assert.equal(bounds.overflow,false);assert.ok(bounds.left>=0&&bounds.right<=width);
  if(process.env.ADMIN_MULTI_EVIDENCE&&locale==='es'&&[390,1366].includes(width)){await mkdir(process.env.ADMIN_MULTI_EVIDENCE,{recursive:true});await page.screenshot({path:process.env.ADMIN_MULTI_EVIDENCE+'/'+slug+'-remove-'+width+'.png'});}
  await page.click('#cancel-adjust');await page.selectOption('[name=action]','clear');await page.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);assert.match(await page.locator('#adjust-preview').innerText(),/7 → 0/);await page.click('#confirm-adjust');await page.waitForFunction(()=>document.querySelector('#confirm-adjust').textContent.includes('−7'));await page.click('#cancel-adjust');
  if(slug==='santofe'){for(const a of ['reward_add','reward_remove','reward_clear']){await page.selectOption('[name=action]',a);await page.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);assert.match(await page.locator('#adjust-preview').innerText(),new RegExp('5 → '+(a==='reward_add'?6:a==='reward_remove'?4:0)));await page.click('#confirm-adjust');await page.waitForFunction(()=>/Confirm/.test(document.querySelector('#confirm-adjust').textContent));await page.click('#cancel-adjust');}}
  await page.click('#cancel-adjust');await page.waitForSelector('dialog',{state:'detached'});
 }
 await page.click('.adjust-stamps');await page.selectOption('[name=action]','remove');await page.fill('#adjust-quantity','5');await page.fill('dialog textarea','Retirada local para auditoría');await page.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);await page.click('#confirm-adjust');await page.waitForFunction(()=>document.querySelector('#confirm-adjust').textContent.includes('−5'));await page.click('#confirm-adjust');await page.waitForSelector('dialog',{state:'detached'});assert.equal(db.prepare('SELECT stamps FROM loyalty_cards WHERE id=?').get(f.card.id).stamps,2);
 const dashboard=(await invoke(db,slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data;
 const events=[dashboard.events.find(e=>e.event_type==='stamp_removed')];
 if(slug==='santofe'){for(const [a,n] of [['reward_add',2],['reward_remove',1],['reward_clear',6]]){await adjust(db,f,a,n);}
  events.push(...(await invoke(db,slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data.events.filter(e=>e.event_type.startsWith('saved_reward')));
 }
 for(const locale of ['es','en']){
  const bytes=await page.evaluate(async data=>{const worker=new Worker('/assets/xlsx-worker.js');try{return await new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve([...new Uint8Array(data.buffer)]);worker.onerror=e=>reject(Error(e.message));worker.postMessage(data);});}finally{worker.terminate();}},{kind:'activity',rows:events,business:dashboard.business,locale,generatedAt:new Date().toISOString()});
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(bytes));const rows=workbook.worksheets.flatMap(sheet=>sheet.getSheetValues());
  assert.ok(rows.some(row=>Array.isArray(row)&&String(row[5]).startsWith('−5 ')&&row[6]==='Retirada local para auditoría'));
  if(slug==='santofe')assert.ok(rows.some(row=>Array.isArray(row)&&row[5]===(locale==='es'?'+2 recompensas guardadas':'+2 saved rewards')));
 }
 assert.deepEqual(errors,[]);
});

test('WebKit iPhone/iPad: all-tenant adjustments, preserved input and customer sync',async t=>{
 const browser=await webkit.launch({headless:true});t.after(()=>browser.close());
 for(const slug of slugs){const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);
  try{const {ctx,page}=await pageFor(browser,base,f.admin.cookie,'admin');
   for(const [width,height] of [[390,844],[768,1024]]){await page.setViewportSize({width,height});await page.click('.adjust-stamps');await page.fill('#adjust-quantity','2');await page.fill('dialog textarea','Corrección WebKit local');await page.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);await page.click('#confirm-adjust');await page.waitForFunction(()=>document.querySelector('#confirm-adjust').textContent.includes('+2'));
    assert.equal(await page.locator('dialog').evaluate(d=>d.scrollWidth>d.clientWidth),false);assert.match(await page.locator('#adjust-preview').innerText(),/0 → 2/);await page.click('#cancel-adjust');assert.equal(await page.locator('dialog textarea').inputValue(),'Corrección WebKit local');await page.click('#cancel-adjust');}
   await ctx.close();const client=await pageFor(browser,base,f.customer.cookie,'tarjeta');await adjust(db,f,'add',2);await client.page.waitForFunction(()=>document.querySelector('.personal-card').textContent.match(/2\s*\/\s*(8|9|10)/));await client.ctx.close();
  }finally{app.close();db.close();}
 }
});

test('stale admin confirmation can refresh without losing reason; counter conflict never retries a purchase',async t=>{
 const db=schema(),f=await fixture(db,'santofe'),{app,base}=await server(db,'santofe'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 await adjust(db,f,'add',7);const admin=await pageFor(browser,base,f.admin.cookie,'admin');const p=admin.page;
 await p.click('.adjust-stamps');await p.selectOption('[name=action]','remove');await p.fill('#adjust-quantity','2');await p.fill('dialog textarea','Conservar mi motivo al actualizar');await p.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);await p.click('#confirm-adjust');await p.waitForFunction(()=>document.querySelector('#confirm-adjust').textContent.includes('−2'));
 await adjust(db,f,'remove',1);await p.click('#confirm-adjust');await p.waitForSelector('#reload-adjust',{state:'visible'});assert.equal(db.prepare('SELECT stamps FROM loyalty_cards WHERE id=?').get(f.card.id).stamps,6);
 await p.click('#reload-adjust');await p.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);assert.equal(await p.locator('dialog textarea').inputValue(),'Conservar mi motivo al actualizar');assert.match(await p.locator('#adjust-preview').innerText(),/6 → 4/);await p.click('#cancel-adjust');
 const {page}=await pageFor(browser,base,f.staff.cookie,'empleado');await page.fill('#lookup input',f.phone);await page.click('#lookup button');await page.waitForSelector('#stamp');await page.click('#stamp-plus');let posts=0;
 await page.route('**/api/staff/stamp',async r=>{posts++;await adjust(db,f,'remove',1);await r.continue();});page.on('dialog',d=>d.accept());await page.click('#stamp');
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('cambió'));await page.waitForFunction(()=>document.querySelector('#staff-card').textContent.match(/5\s*\/\s*10/));
 assert.equal(posts,1);assert.equal(await page.locator('#stamp-quantity').innerText(),'2');assert.equal(db.prepare('SELECT count(*) n FROM loyalty_events WHERE card_id=?').get(f.card.id).n,0);
});
