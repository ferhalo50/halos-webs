import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,server,invoke,slugs} from './reward-choice-fixture.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const profiles=[['Android',()=>chromium.launch({channel:'msedge',headless:true}),true],['iPhone',()=>webkit.launch({headless:true}),true],['desktop',()=>chromium.launch({channel:'msedge',headless:true}),false]];
const widths=[[360,800],[390,844],[412,915],[430,932],[768,1024],[1366,768]];
async function open(browser,base,cookie,route='cuenta',mobile=true){
 const context=await browser.newContext({viewport:{width:mobile?390:1366,height:mobile?844:768},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:base}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#'+route);await page.waitForSelector('#app-loader',{state:'detached'});
 return{context,page,errors};
}
async function photo(page,name){if(!process.env.NAV_EVIDENCE)return;await mkdir(process.env.NAV_EVIDENCE,{recursive:true});await page.screenshot({path:process.env.NAV_EVIDENCE+'/'+name+'.png'});}

for(const slug of slugs)test(slug+': card shell is immediate, localized, responsive and performs one request per entry',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);t.after(()=>{app.close();db.close();});
 for(const [profile,launch,mobile] of profiles){const browser=await launch();try{
  const {context,page,errors}=await open(browser,base,f.customer.cookie,'cuenta',mobile);let meRequests=0;
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/me')meRequests++;});
  for(const locale of ['es','en'])for(const [width,height] of widths){
   await page.setViewportSize({width,height});await page.evaluate(lang=>window.LoyaltyI18n.set(lang),locale);
   await page.click('#account-link');await page.waitForSelector('#profile-form');
   const hold=deferred(),received=deferred();let count=0;
   const intercept=async route=>{count++;received.resolve();await hold.promise;await route.continue().catch(()=>{});};
   await page.route('**/api/card',intercept);
   try{
    await page.click('#card-link');await received.promise;await page.waitForSelector('[data-card-loading]');
    assert.equal(await page.locator('#profile-form,#qr svg,.premium-customer').count(),0,'no previous private view or fabricated QR while loading');
    assert.equal(await page.locator('[data-card-loading]').getAttribute('aria-busy'),'true');
    assert.equal(await page.locator('[data-card-loading] [role=status]').innerText(),locale==='es'?'Cargando tu tarjeta…':'Loading your card…');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    if(profile==='Android'&&locale==='es'&&width===390)await photo(page,slug+'-card-loading');
   }finally{hold.resolve();}
   await page.waitForSelector('#qr svg',{state:'attached'});assert.equal(await page.locator('[data-card-loading]').count(),0);assert.equal(count,1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.equal(await page.locator('.premium-customer code').innerText(),f.card.id);
   if(profile==='Android'&&locale==='es'&&width===390)await photo(page,slug+'-card-ready');
   await page.unroute('**/api/card',intercept);
  }
  assert.equal(meRequests,0,'internal navigation does not re-fetch the session');assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}}
});

for(const slug of slugs)for(const role of ['customer','staff','admin'])test(slug+': '+role+' logout from Inicio updates the same document, blocks Back and preserves other sessions',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);t.after(()=>{app.close();db.close();});
 const id=f[role].data.user.id;
 const second=role==='customer'?await invoke(db,slug,'/api/login/customer',{body:{phone:f.phone,pin:'4826'}}):await invoke(db,slug,'/api/login/staff',{body:{username:db.prepare('SELECT username FROM users WHERE id=?').get(id).username,password:'Fictitious-local-only-4826!'}});
 assert.equal(second.status,200);
 for(const [profile,launch,mobile] of profiles){
  // Each browser receives a separate fictitious login; never use productive accounts.
  const fresh=role==='customer'?await invoke(db,slug,'/api/login/customer',{body:{phone:f.phone,pin:'4826'}}):await invoke(db,slug,'/api/login/staff',{body:{username:db.prepare('SELECT username FROM users WHERE id=?').get(id).username,password:'Fictitious-local-only-4826!'}});
  const before=db.prepare('SELECT COUNT(*) n FROM sessions').get().n,browser=await launch();try{
   const protectedRoute=role==='customer'?'tarjeta':role==='admin'?'admin':'empleado';
   const {context,page,errors}=await open(browser,base,fresh.cookie,protectedRoute,mobile);
   await page.waitForSelector(role==='customer'?'#qr svg':role==='admin'?'#employee-form':'#lookup',{state:'attached'});
   await page.click('#home-link');await page.waitForSelector('.tenant-landing');
   const marker=await page.evaluate(()=>window.__documentMarker=crypto.randomUUID());
   const hold=deferred(),started=deferred();let posts=0;
   await page.route('**/api/logout',async route=>{posts++;started.resolve();await hold.promise;await route.continue();});
   await page.click('#logout');await started.promise;await page.waitForSelector('[data-logout-state=pending]');
   await page.evaluate(()=>document.querySelector('#logout').click());assert.equal(await page.locator('#logout').isDisabled(),true);
   assert.equal(await page.locator('#qr svg,#employee-form,#lookup,#profile-form').count(),0);
   hold.resolve();await page.waitForSelector('.tenant-landing');await page.waitForFunction(()=>document.querySelector('#logout').hidden);
   assert.equal(posts,1);assert.equal(new URL(page.url()).hash,'#inicio');assert.equal(await page.evaluate(()=>window.__documentMarker),marker);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,before-1,'only the voluntarily closed session is removed');
   assert.equal((await invoke(db,slug,'/api/me',{cookie:second.cookie})).data.user.id,id,'another session of the same account remains valid');
   for(const route of ['cuenta',protectedRoute]){await page.evaluate(hash=>location.hash=hash,route);await page.waitForSelector('#auth-form');assert.equal(await page.locator('#qr svg,#employee-form,#lookup,#profile-form').count(),0);}
   await page.goBack();await page.waitForTimeout(30);assert.equal(await page.locator('#qr svg,#employee-form,#lookup,#profile-form').count(),0);
   assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
 }
});

for(const role of ['customer','staff','admin'])test(role+': failed logout never claims success; retry confirms closure without leaking the old view',async t=>{
 const db=schema(),f=await fixture(db,'santofe'),{app,base}=await server(db,'santofe'),browser=await webkit.launch({headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page,context,errors}=await open(browser,base,f[role].cookie);const before=db.prepare('SELECT COUNT(*) n FROM sessions').get().n;
 for(const locale of ['es','en']){
  await page.evaluate(lang=>window.LoyaltyI18n.set(lang),locale);
  await page.route('**/api/logout',r=>r.abort('failed'));await page.click('#logout');await page.waitForSelector('[data-logout-state=error]');
  assert.equal(await page.locator('[data-logout-state] h1').innerText(),locale==='es'?'No pudimos confirmar el cierre de sesión.':'We could not confirm sign-out.');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,before);assert.equal(await page.locator('#profile-form,#qr svg,#lookup,#employee-form').count(),0);
  await page.unroute('**/api/logout');
 }
 await page.click('#retry-logout');await page.waitForSelector('.tenant-landing');assert.equal(await page.locator('#logout').isVisible(),false);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,before-1);assert.deepEqual(errors,[]);await context.close();
});

test('leaving a pending card/admin load and logging out discards late results without restoring protected views',async t=>{
 const db=schema(),f=await fixture(db,'renace'),{app,base}=await server(db,'renace'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 for(const [role,path,link]of [['customer','**/api/card','#card-link'],['admin','**/api/admin/dashboard?*','#admin-link']]){
  const {page,context,errors}=await open(browser,base,f[role].cookie);const hold=deferred(),started=deferred();
  await page.route(path,async route=>{const response=await route.fetch();started.resolve();await hold.promise;await route.fulfill({response}).catch(()=>{});});
  await page.click(link);await started.promise;await page.click('#logout');await page.waitForSelector('.tenant-landing');hold.resolve();await page.waitForTimeout(80);
  assert.equal(await page.locator('#logout').isVisible(),false);assert.equal(await page.locator('#qr svg,#employee-form,#profile-form').count(),0);assert.deepEqual(errors,[]);await context.close();
 }
});

test('an old profile response cannot restore a previous user after logout and another customer login',async t=>{
 const db=schema(),f=await fixture(db,'mooncoffee'),other=await fixture(db,'mooncoffee'),{app,base}=await server(db,'mooncoffee'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page,context,errors}=await open(browser,base,f.customer.cookie);const hold=deferred(),started=deferred();
 await page.route('**/api/account/profile',async route=>{const response=await route.fetch();started.resolve();await hold.promise;await route.fulfill({response}).catch(()=>{});});
 await page.fill('#profile-form [name=name]','Anterior ficticio');await page.click('#profile-form button');await started.promise;
 await page.click('#logout');await page.waitForSelector('.tenant-landing');await page.evaluate(()=>location.hash='login');await page.waitForSelector('#auth-form');
 await page.fill('#auth-form [name=login]',other.phone);await page.fill('#auth-form [name=secret]','4826');await page.click('#auth-form button');await page.waitForSelector('#qr svg',{state:'attached'});
 hold.resolve();await page.waitForTimeout(80);assert.equal(await page.locator('.premium-customer code').innerText(),other.card.id);
 await page.click('#account-link');await page.waitForSelector('#profile-form');assert.notEqual(await page.inputValue('#profile-form [name=name]'),'Anterior ficticio');assert.deepEqual(errors,[]);await context.close();
});

test('card reentry cancels obsolete loading; auto-refresh updates the current card with no extra bootstrap',async t=>{
 const db=schema(),f=await fixture(db,'vainillacoffee'),{app,base}=await server(db,'vainillacoffee'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page,context,errors}=await open(browser,base,f.customer.cookie);const hold=deferred(),started=deferred();
 const pending=async route=>{started.resolve();await hold.promise;await route.continue().catch(()=>{});};await page.route('**/api/card',pending);
 await page.click('#card-link');await started.promise;await page.click('#account-link');await page.waitForSelector('#profile-form');hold.resolve();await page.unroute('**/api/card',pending);
 assert.equal(await page.locator('#qr svg').count(),0);await page.click('#card-link');await page.waitForSelector('#qr svg',{state:'attached'});
 const qr=await page.locator('#qr').innerHTML();db.prepare('UPDATE loyalty_cards SET stamps=3,reward_version=reward_version+1 WHERE id=?').run(f.card.id);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.querySelectorAll('.personal-card .vainilla-flower-slot.is-earned').length===3);
 assert.equal(await page.locator('#qr').innerHTML(),qr);assert.equal(await page.locator('.premium-customer code').innerText(),f.card.id);assert.deepEqual(errors,[]);await context.close();
});

for(const slug of ['renace','santofe'])test(slug+': pending counter result cannot repaint during logout confirmation',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page,context,errors}=await open(browser,base,f.staff.cookie,'empleado');page.on('dialog',d=>d.accept());
 await page.fill('#lookup input',f.card.id);await page.click('#lookup button');await page.waitForSelector('#stamp');
 const operation=deferred(),operationStarted=deferred(),logout=deferred(),logoutStarted=deferred();
 await page.route('**/api/staff/stamp',async route=>{const response=await route.fetch();operationStarted.resolve();await operation.promise;await route.fulfill({response}).catch(()=>{});});
 await page.route('**/api/logout',async route=>{logoutStarted.resolve();await logout.promise;await route.continue();});
 await page.click('#stamp');await operationStarted.promise;await page.click('#logout');await logoutStarted.promise;
 operation.resolve();await page.waitForTimeout(80);assert.equal(await page.locator('[data-logout-state=pending]').count(),1);assert.equal(await page.locator('#staff-card').count(),0);
 logout.resolve();await page.waitForSelector('.tenant-landing');assert.deepEqual(errors,[]);await context.close();
});

test('a card response attributed to another owner is rejected before displaying its QR or personal data',async t=>{
 const db=schema(),f=await fixture(db,'renace'),{app,base}=await server(db,'renace'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page,context,errors}=await open(browser,base,f.customer.cookie);
 await page.route('**/api/card',async route=>{const response=await route.fetch(),json=await response.json();json.card.customerId='OTHER-FICTITIOUS-OWNER';json.card.name='Datos ajenos ficticios';await route.fulfill({response,json});});
 await page.click('#card-link');await page.waitForSelector('#retry');assert.equal(await page.locator('#qr svg,.premium-customer').count(),0);assert.equal(await page.locator('#app').innerText().then(s=>s.includes('Datos ajenos ficticios')),false);assert.deepEqual(errors,[]);await context.close();
});

for(const engine of ['chromium','webkit'])test(engine+': a pending login cannot install another session cookie after voluntary logout',async t=>{
 const db=schema(),f=await fixture(db,'renace'),other=await fixture(db,'renace'),{app,base}=await server(db,'renace'),browser=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'msedge',headless:true}));t.after(async()=>{await browser.close();app.close();db.close();});
 const {page,context,errors}=await open(browser,base,f.customer.cookie,'login');const hold=deferred(),started=deferred();
 await page.route('**/api/login/customer',async route=>{started.resolve();await hold.promise;await route.fulfill({status:200,headers:{'content-type':'application/json','set-cookie':other.customer.cookie+'; Path=/; HttpOnly; SameSite=Lax'},body:JSON.stringify(other.customer.data)}).catch(()=>{});});
 await page.fill('#auth-form [name=login]',other.phone);await page.fill('#auth-form [name=secret]','4826');await page.click('#auth-form button');await started.promise;
 await page.click('#logout');await page.waitForSelector('.tenant-landing');hold.resolve();await page.waitForTimeout(100);
 const me=await context.request.get(base+'/api/me');assert.equal(me.status(),401,'late Set-Cookie must not resurrect an authenticated session');assert.equal((await me.json()).user,undefined);assert.equal(await page.locator('#logout').isVisible(),false);assert.deepEqual(errors,[]);await context.close();
});
