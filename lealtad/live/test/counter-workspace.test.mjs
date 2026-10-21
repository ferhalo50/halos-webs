import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,server,slugs,invoke} from './reward-choice-fixture.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const snapshots=db=>['loyalty_cards','loyalty_events','loyalty_purchase_operations','per_item_reward_operations','reward_choice_operations','admin_audit_log'].map(t=>JSON.stringify(db.prepare('SELECT * FROM '+t+' ORDER BY id').all()));
async function setup(t,slug='santofe',engine=chromium){
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug),browser=await engine.launch(engine===chromium?{channel:'msedge',headless:true}:{headless:true});
 t.after(async()=>{await browser.close();app.close();db.close();});
 const context=await browser.newContext({viewport:{width:1180,height:700},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const [name,value]=f.staff.cookie.split('=');await context.addCookies([{name,value,url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|inline style/i.test(m.text()))errors.push('CSP violation');});
 await page.goto(base+'/#empleado');await page.waitForSelector('#app-loader',{state:'detached'});
 const lookup=async phone=>{await page.fill('#lookup input',phone);await page.click('#lookup button');await page.waitForFunction(phone=>document.querySelector('.customer-summary')?.textContent.includes(phone)&&document.querySelector('#lookup input')?.value==='',phone);};
 await lookup(f.phone);return{db,f,base,context,page,lookup,errors};
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#new-attention')&&!document.querySelector('#new-attention').disabled&&!document.querySelector('#staff-pin').disabled);}
async function empty(page){await page.waitForSelector('.staff-empty');assert.equal(await page.locator('.counter-card-preview,#stamp,#staff-pin,#new-attention').count(),0);assert.equal(await page.inputValue('#lookup input'),'');}

for(const engine of [chromium,webkit])for(const slug of slugs)test(slug+' '+engine.name()+': pending lookup and camera cannot replace the PIN recipient; one authorized result reaches staff',async t=>{
 const {db,f,page,lookup,errors}=await setup(t,slug,engine),second=await fixture(db,slug),lookupStarted=deferred(),lookupHold=deferred(),pinStarted=deferred(),pinHold=deferred();
 const alerts=[];let pinRequests=0,temporaryPin;
 page.on('dialog',async dialog=>{if(dialog.type()==='alert')alerts.push(dialog.message());await dialog.accept();});
 await page.evaluate(()=>{window.__cameraResolve=null;window.__cameraStops=0;Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>window.__cameraResolve=resolve)}});});
 await page.click('#scan');await page.waitForFunction(()=>Boolean(window.__cameraResolve));
 await page.route('**/api/staff/card?value='+second.phone,async route=>{const response=await route.fetch();lookupStarted.resolve();await lookupHold.promise;await route.fulfill({response}).catch(()=>{});});
 await page.route('**/api/staff/customers/*/pin',async route=>{pinRequests++;assert.equal(new URL(route.request().url()).pathname,'/api/staff/customers/'+f.customer.data.user.id+'/pin');const response=await route.fetch();temporaryPin=(await response.json()).customer.temporaryPin;pinStarted.resolve();await pinHold.promise;await route.fulfill({response}).catch(()=>{});});
 await page.fill('#lookup input',second.phone);await page.click('#lookup button');await lookupStarted.promise;await page.click('#staff-pin');await pinStarted.promise;
 try{
  assert.equal(await page.locator('#new-attention').isDisabled(),true);
  await page.locator('#staff-pin').evaluate(b=>{b.disabled=false;b.click();});
  lookupHold.resolve();await page.evaluate(()=>window.__cameraResolve({getTracks:()=>[{stop:()=>window.__cameraStops++}]}));
  // Both obsolete results have been released while the PIN response is still held.
  await page.waitForTimeout(100);
  assert.ok((await page.locator('.customer-summary').innerText()).includes(f.phone),'the original PIN recipient must remain selected');
  assert.ok(!(await page.locator('.customer-summary').innerText()).includes(second.phone));
  assert.equal(await page.evaluate(()=>window.__cameraStops),1);
 }finally{lookupHold.resolve();pinHold.resolve();}
 await page.waitForFunction(()=>!document.querySelector('#staff-pin').disabled);await ready(page);
 assert.equal(pinRequests,1);assert.equal(alerts.length,1);assert.ok(alerts[0].includes(temporaryPin));
 assert.equal(db.prepare('SELECT must_change_secret FROM users WHERE id=?').get(f.customer.data.user.id).must_change_secret,1);
 assert.equal(db.prepare('SELECT must_change_secret FROM users WHERE id=?').get(second.customer.data.user.id).must_change_secret,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM loyalty_events').get().n,0);
 assert.equal((await invoke(db,slug,'/api/me',{cookie:f.customer.cookie})).status,401,'only the intended customer sessions are revoked by the existing PIN endpoint');
 const login=await invoke(db,slug,'/api/login/customer',{body:{phone:f.phone,pin:temporaryPin}});assert.equal(login.status,200);assert.equal(login.data.user.mustChangeSecret,true);
 assert.equal((await invoke(db,slug,'/api/card',{cookie:login.cookie})).status,403);
 assert.equal((await invoke(db,slug,'/api/account/secret',{cookie:login.cookie,body:{currentSecret:temporaryPin,newSecret:'683725'}})).status,200);
 const card=await invoke(db,slug,'/api/card',{cookie:login.cookie});assert.equal(card.status,200);assert.equal(card.data.card.id,f.card.id);assert.equal(card.data.card.stamps,0);
 await lookup(second.phone);assert.equal(alerts.length,1,'changing customer afterwards never replays the secret');assert.deepEqual(errors,[]);
});

for(const engine of [chromium,webkit])test(engine.name()+': the same authorized employee receives the temporary PIN once after internal navigation',async t=>{
 const {f,page,errors}=await setup(t,'santofe',engine),started=deferred(),hold=deferred(),alerts=[];
 page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});let secret,requests=0;
 await page.route('**/api/staff/customers/*/pin',async route=>{requests++;const response=await route.fetch();secret=(await response.json()).customer.temporaryPin;started.resolve();await hold.promise;await route.fulfill({response});});
 await page.click('#staff-pin');await started.promise;
 try{await page.click('#account-link');await page.waitForSelector('#profile-form');}finally{hold.resolve();}
 await page.waitForTimeout(100);assert.equal(alerts.length,1);assert.ok(alerts[0].includes(secret));assert.equal(requests,1);
 await page.click('#counter-link');await page.waitForFunction(()=>document.querySelector('#staff-pin')&&!document.querySelector('#staff-pin').disabled);
 assert.ok((await page.locator('.customer-summary').innerText()).includes(f.phone));assert.equal(alerts.length,1);assert.deepEqual(errors,[]);
});

for(const next of ['logout','different employee'])test('late PIN is never disclosed after '+next,async t=>{
 const {db,f,page,errors}=await setup(t),other=await fixture(db,'santofe'),started=deferred(),hold=deferred(),released=deferred(),alerts=[];
 page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});let requests=0;
 await page.route('**/api/staff/customers/*/pin',async route=>{requests++;const response=await route.fetch();started.resolve();await hold.promise;await route.fulfill({response}).catch(()=>{});released.resolve();});
 await page.click('#staff-pin');await started.promise;
 try{
  await page.click('#logout');await page.waitForSelector('.tenant-landing');
  if(next==='different employee'){
   await page.evaluate(()=>location.hash='equipo');await page.waitForSelector('#auth-form');
   await page.fill('#auth-form [name=login]',db.prepare('SELECT username FROM users WHERE id=?').get(other.staff.data.user.id).username);
   await page.fill('#auth-form [name=secret]','Fictitious-local-only-4826!');await page.click('#auth-form button');await page.waitForSelector('.staff-empty');
  }
 }finally{hold.resolve();}
 await released.promise;await page.waitForTimeout(100);assert.equal(alerts.length,0);assert.equal(requests,1);
 assert.equal(await page.locator('.customer-summary,.counter-card-preview').count(),0);
 assert.equal(await page.locator('#app').innerText().then(s=>s.includes(f.phone)),false);
 if(next==='different employee'){assert.equal((await page.evaluate(()=>fetch('/api/me').then(r=>r.json()))).user.id,other.staff.data.user.id);}
 assert.deepEqual(errors,[]);
});

test('an uncancellable lookup body released after the PIN finishes cannot restore another customer',async t=>{
 const {db,f,page,errors}=await setup(t),second=await fixture(db,'santofe'),alerts=[];
 page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});
 await page.evaluate(phone=>{const original=window.fetch;window.fetch=async function(...args){const r=await original.apply(this,args);if(String(args[0]).includes('/api/staff/card?value='+phone)){const data=await r.clone().json();r.json=()=>new Promise(resolve=>window.__releaseLookupBody=()=>resolve(data));}return r;};},second.phone);
 await page.fill('#lookup input',second.phone);await page.click('#lookup button');await page.waitForFunction(()=>Boolean(window.__releaseLookupBody));
 await page.click('#staff-pin');await page.waitForFunction(()=>!document.querySelector('#staff-pin').disabled);await ready(page);assert.equal(alerts.length,1);
 await page.evaluate(()=>window.__releaseLookupBody());await page.waitForTimeout(100);
 assert.ok((await page.locator('.customer-summary').innerText()).includes(f.phone));assert.ok(!(await page.locator('.customer-summary').innerText()).includes(second.phone));assert.deepEqual(errors,[]);
});

test('PIN network errors keep the recipient and draft, discard old reads and require an explicit retry',async t=>{
 const {db,f,page,errors}=await setup(t),second=await fixture(db,'santofe'),readStarted=deferred(),readHold=deferred(),pinStarted=deferred(),pinHold=deferred(),alerts=[];
 page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});let requests=0;
 await page.click('#stamp-plus');
 await page.route('**/api/staff/card?value='+second.phone,async route=>{const response=await route.fetch();readStarted.resolve();await readHold.promise;await route.fulfill({response}).catch(()=>{});});
 await page.route('**/api/staff/customers/*/pin',async route=>{requests++;if(requests===1){pinStarted.resolve();await pinHold.promise;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'unavailable',message:'Fallo de red simulado'}})});}else await route.continue();});
 await page.fill('#lookup input',second.phone);await page.click('#lookup button');await readStarted.promise;await page.click('#staff-pin');await pinStarted.promise;
 try{readHold.resolve();}finally{pinHold.resolve();}
 await ready(page);assert.equal(requests,1);assert.equal(alerts.length,0);assert.match(await page.locator('#toast').innerText(),/Fallo de red simulado/);assert.equal(await page.locator('#stamp-quantity').innerText(),'2');assert.ok((await page.locator('.customer-summary').innerText()).includes(f.phone));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='pin_reset'").get().n,0);
 await page.click('#staff-pin');await ready(page);assert.equal(requests,2);assert.equal(alerts.length,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='pin_reset'").get().n,1);assert.deepEqual(errors,[]);
});

test('PIN result for an unexpected customer is rejected; foreign tenants and customers have no reset permission',async t=>{
 const {db,f,page,errors}=await setup(t,'renace'),foreign=await fixture(db,'mooncoffee'),alerts=[];
 page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});
 const before=db.prepare('SELECT secret_hash FROM users WHERE id=?').get(foreign.customer.data.user.id).secret_hash;
 const denied=await invoke(db,'renace','/api/staff/customers/'+foreign.customer.data.user.id+'/pin',{cookie:f.staff.cookie,method:'PATCH'});assert.equal(denied.status,404);
 assert.equal((await invoke(db,'renace','/api/staff/customers/'+f.customer.data.user.id+'/pin',{cookie:f.customer.cookie,method:'PATCH'})).status,403);
 assert.equal((await invoke(db,'renace','/api/staff/customers/'+f.customer.data.user.id+'/pin',{method:'PATCH'})).status,401);
 await page.route('**/api/staff/customers/*/pin',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,customer:{id:foreign.customer.data.user.id,name:'Cliente ajeno ficticio',temporaryPin:'111111'}})}));
 await page.click('#staff-pin');await ready(page);assert.equal(alerts.length,0);assert.match(await page.locator('#toast').innerText(),/No se pudo completar/);
 assert.equal(db.prepare('SELECT secret_hash FROM users WHERE id=?').get(foreign.customer.data.user.id).secret_hash,before);assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='pin_reset'").get().n,0);assert.deepEqual(errors,[]);
});

for(const type of ['stamp','redeem','save','redeem_now'])test(type+': a pending lookup cannot replace the customer during a confirmed counter operation',async t=>{
 const {db,f,page,lookup,errors}=await setup(t),second=await fixture(db,'santofe'),readStarted=deferred(),readHold=deferred(),operationStarted=deferred(),operationHold=deferred();
 db.prepare('UPDATE loyalty_cards SET stamps=3,rewards_pending=?,reward_choices_pending=? WHERE id=?').run(type==='redeem'?1:0,['save','redeem_now'].includes(type)?1:0,f.card.id);await lookup(f.phone);
 const before=JSON.stringify(db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(second.card.id));let posts=0;page.on('dialog',d=>d.accept());
 await page.route('**/api/staff/card?value='+second.phone,async route=>{const response=await route.fetch();readStarted.resolve();await readHold.promise;await route.fulfill({response}).catch(()=>{});});
 const endpoint=['save','redeem_now'].includes(type)?'reward-choice':type;
 await page.route('**/api/staff/'+endpoint,async route=>{posts++;const response=await route.fetch();operationStarted.resolve();await operationHold.promise;await route.fulfill({response});});
 await page.fill('#lookup input',second.phone);await page.click('#lookup button');await readStarted.promise;await page.click('#'+({stamp:'stamp',redeem:'redeem',save:'reward-save',redeem_now:'reward-redeem-now'}[type]));await operationStarted.promise;
 try{readHold.resolve();await page.waitForTimeout(100);assert.ok((await page.locator('.customer-summary').innerText()).includes(f.phone));assert.equal(await page.locator('#new-attention').isDisabled(),true);}finally{operationHold.resolve();}
 await ready(page);assert.equal(posts,1);assert.ok((await page.locator('.customer-summary').innerText()).includes(f.phone));assert.equal(JSON.stringify(db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(second.card.id)),before);
 const card=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);assert.equal(card.stamps,type==='stamp'?4:3);assert.equal(card.rewards_pending,type==='save'?1:0);assert.equal(card.reward_choices_pending,0);assert.equal(card.redeemed_count,['redeem','redeem_now'].includes(type)?1:0);assert.deepEqual(errors,[]);
});

test('PIN pauses in-flight polling and resumes a fresh read without repainting an old result',async t=>{
 const {db,f,page,errors}=await setup(t),pollStarted=deferred(),pollHold=deferred(),pinStarted=deferred(),pinHold=deferred();let polls=0;
 page.on('dialog',d=>d.accept());
 await page.route('**/api/staff/card?value='+encodeURIComponent(f.card.id),async route=>{polls++;const response=await route.fetch();if(polls===1){pollStarted.resolve();await pollHold.promise;}await route.fulfill({response}).catch(()=>{});});
 await page.route('**/api/staff/customers/*/pin',async route=>{const response=await route.fetch();pinStarted.resolve();await pinHold.promise;await route.fulfill({response});});
 await page.evaluate(()=>dispatchEvent(new Event('focus')));await pollStarted.promise;await page.click('#staff-pin');await pinStarted.promise;
 try{pollHold.resolve();await page.evaluate(()=>dispatchEvent(new Event('focus')));await page.waitForTimeout(100);assert.equal(polls,1);assert.equal(await page.locator('#new-attention').isDisabled(),true);}finally{pinHold.resolve();}
 await ready(page);await page.waitForFunction(()=>document.querySelector('#sync-status')?.textContent.includes('Tarjeta al día'));assert.ok(polls>=2);assert.equal(db.prepare('SELECT COUNT(*) n FROM loyalty_events').get().n,0);assert.deepEqual(errors,[]);
});

for(const slug of slugs)test(slug+': successful service remains selected until Next customer; local reset preserves records/session and discards only confirmed drafts',async t=>{
 const {db,f,context,page,lookup,errors}=await setup(t,slug),second=await fixture(db,slug);db.prepare('UPDATE users SET name=? WHERE id=?').run('Siguiente ficticio',second.customer.data.user.id);
 await page.evaluate(()=>window.__cameraRequests=0);await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>{window.__cameraRequests++;return Promise.reject(Error('unexpected'));};});
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/staff/stamp'&&r.request().method()==='POST');page.once('dialog',d=>d.accept());await page.click('#stamp');assert.equal((await response).status(),200);await ready(page);
 assert.equal(await page.locator('.counter-card-preview').isVisible(),true,'successful operations never auto-clear the current customer');assert.equal(db.prepare('SELECT stamps FROM loyalty_cards WHERE id=?').get(f.card.id).stamps,1);
 if(slug==='santofe'){
  await page.click('#stamp-plus');await page.click('#stamp-plus');assert.equal(await page.locator('#stamp-quantity').innerText(),'3');
  page.once('dialog',d=>d.dismiss());await page.click('#new-attention');assert.equal(await page.locator('#stamp-quantity').innerText(),'3');assert.equal(await page.locator('.counter-card-preview').isVisible(),true);
 }
 const before=snapshots(db),cookie=await context.cookies();let requests=0;const observe=r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests++;};page.on('request',observe);
 if(slug==='santofe')page.once('dialog',d=>d.accept());await page.click('#new-attention');await empty(page);page.off('request',observe);
 assert.equal(requests,0,'clearing an attention is a local operation, not an API action');assert.deepEqual(snapshots(db),before);assert.deepEqual(await context.cookies(),cookie);assert.equal(await page.evaluate(()=>window.__cameraRequests),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'scan');
 await lookup(second.phone);assert.match(await page.locator('.counter-client').innerText(),/Siguiente ficticio/);assert.equal(await page.locator('#staff-card').innerText().then(x=>x.includes(f.phone)),false);if(slug==='santofe')assert.equal(await page.locator('#stamp-quantity').innerText(),'1');
 await page.evaluate(()=>LoyaltyI18n.set('en'));assert.equal(await page.locator('#new-attention').innerText(),'Next customer');assert.equal(await page.locator('.counter-card-progress [role=img]').getAttribute('aria-label'),'Actual progress');await page.click('#new-attention');await empty(page);assert.match(await page.locator('#toast').innerText(),/Ready for the next customer/);assert.deepEqual(errors,[]);
});

test('Next customer cannot interrupt a committed purchase or a pending temporary-PIN operation',async t=>{
 const {db,f,page,errors}=await setup(t);const hold=deferred(),started=deferred();
 await page.route('**/api/staff/stamp',async route=>{const response=await route.fetch();started.resolve();await hold.promise;await route.fulfill({response});});
 page.once('dialog',d=>d.accept());await page.click('#stamp');await started.promise;
 try{assert.equal(await page.locator('#new-attention').isDisabled(),true);assert.equal(await page.locator('#staff-pin').isDisabled(),true);await page.locator('#new-attention').evaluate(b=>{b.disabled=false;b.click();});assert.equal(await page.locator('.counter-card-preview').isVisible(),true);}finally{hold.resolve();}
 await ready(page);assert.equal(db.prepare('SELECT COUNT(*) count FROM loyalty_events').get().count,1);assert.equal(db.prepare('SELECT stamps FROM loyalty_cards WHERE id=?').get(f.card.id).stamps,1);
 const pinHold=deferred(),pinStarted=deferred();await page.route('**/api/staff/customers/*/pin',async route=>{const response=await route.fetch();pinStarted.resolve();await pinHold.promise;await route.fulfill({response});});page.on('dialog',d=>d.accept());await page.click('#staff-pin');await pinStarted.promise;
 try{assert.equal(await page.locator('#new-attention').isDisabled(),true);await page.locator('#new-attention').evaluate(b=>{b.disabled=false;b.click();});assert.equal(await page.locator('.counter-card-preview').isVisible(),true);}finally{pinHold.resolve();}
 await ready(page);const before=snapshots(db);await page.click('#new-attention');await empty(page);assert.deepEqual(snapshots(db),before);assert.deepEqual(errors,[]);
});

test('failed purchase retains customer and quantity; reset needs draft confirmation and never retries the operation',async t=>{
 const {db,page,errors}=await setup(t);let writes=0;await page.route('**/api/staff/stamp',route=>{writes++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{message:'Fallo de red simulado',code:'temporarily_unavailable'}})});});
 await page.click('#stamp-plus');page.once('dialog',d=>d.accept());await page.click('#stamp');await ready(page);assert.equal(await page.locator('#stamp-quantity').innerText(),'2');assert.equal(await page.locator('.counter-card-preview').isVisible(),true);assert.equal(db.prepare('SELECT COUNT(*) n FROM loyalty_events').get().n,0);
 page.once('dialog',d=>d.dismiss());await page.click('#new-attention');assert.equal(await page.locator('#stamp-quantity').innerText(),'2');page.once('dialog',d=>d.accept());await page.click('#new-attention');await empty(page);assert.equal(writes,1);assert.deepEqual(errors,[]);
});

test('late lookups and polls cannot restore a cleared card or replace the following customer',async t=>{
 const {db,f,page,lookup,errors}=await setup(t),second=await fixture(db,'santofe'),third=await fixture(db,'santofe'),hold=deferred(),started=deferred();
 await page.route('**/api/staff/card?value='+second.phone,async route=>{const response=await route.fetch();started.resolve();await hold.promise;await route.fulfill({response}).catch(()=>{});});
 await page.fill('#lookup input',second.phone);await page.click('#lookup button');await started.promise;await page.click('#new-attention');await empty(page);hold.resolve();await lookup(third.phone);assert.match(await page.locator('.customer-summary').innerText(),new RegExp(third.phone));
 const polling=deferred(),pollStarted=deferred();await page.route('**/api/staff/card?value='+encodeURIComponent(third.card.id),async route=>{const response=await route.fetch();pollStarted.resolve();await polling.promise;await route.fulfill({response}).catch(()=>{});});
 await page.evaluate(()=>dispatchEvent(new Event('focus')));await pollStarted.promise;await page.click('#new-attention');await empty(page);polling.resolve();await page.waitForTimeout(100);await empty(page);assert.equal(await page.locator('#staff-card').innerText().then(x=>x.includes(f.phone)||x.includes(second.phone)||x.includes(third.phone)),false);assert.equal(db.prepare('SELECT COUNT(*) n FROM loyalty_events').get().n,0);assert.deepEqual(errors,[]);
});

test('clearing attention cancels pending camera acquisition; stale camera failures cannot stop a newer request',async t=>{
 const {page,lookup,f,errors}=await setup(t);await page.evaluate(()=>{window.__pendingCameras=[];window.__stoppedTracks=0;navigator.mediaDevices.getUserMedia=()=>new Promise((resolve,reject)=>window.__pendingCameras.push({resolve,reject}));});
 await page.click('#scan');await page.waitForFunction(()=>window.__pendingCameras.length===1);await page.click('#new-attention');await empty(page);await page.evaluate(()=>window.__pendingCameras[0].resolve({getTracks:()=>[{stop:()=>window.__stoppedTracks++}]}));await page.waitForFunction(()=>window.__stoppedTracks===1);await empty(page);
 await lookup(f.phone);await page.click('#scan');await page.waitForFunction(()=>window.__pendingCameras.length===2);await page.click('#new-attention');await empty(page);await page.click('#scan');await page.waitForFunction(()=>window.__pendingCameras.length===3);
 await page.evaluate(()=>window.__pendingCameras[1].reject(Error('stale permission refusal')));await page.waitForTimeout(50);assert.equal(await page.locator('#scan').isDisabled(),true);assert.doesNotMatch(await page.locator('#toast').innerText(),/No se pudo abrir/);
 await page.evaluate(()=>window.__pendingCameras[2].reject(Error('current permission refusal')));await page.waitForFunction(()=>!document.querySelector('#scan').disabled);assert.deepEqual(errors,[]);
});

const sizes=[[1180,820],[1180,796],[1180,700],[1180,660],[1280,720],[1366,768],[820,1100],[390,844],[360,800]];
for(const slug of slugs)test(slug+': tablet counter fits priority actions; real progress, rewards, touch sizes and ES/EN survive responsive layouts',async t=>{
 const db=schema(),f=await fixture(db,slug);db.prepare('UPDATE loyalty_cards SET stamps=2,rewards_pending=? WHERE id=?').run(slug==='santofe'?1:0,f.card.id);const {app,base}=await server(db,slug);t.after(()=>{app.close();db.close();});
 for(const engine of [chromium,webkit]){const browser=await engine.launch(engine===chromium?{channel:'msedge',headless:true}:{headless:true});try{for(const role of ['staff','admin']){
  const context=await browser.newContext({viewport:{width:1180,height:700},isMobile:true,hasTouch:true,serviceWorkers:'block'});const [name,value]=f[role].cookie.split('=');await context.addCookies([{name,value,url:base}]);const page=await context.newPage();await page.goto(base+'/#empleado');await page.waitForSelector('#app-loader',{state:'detached'});await page.fill('#lookup input',f.phone);await page.click('#lookup button');await page.waitForSelector('#new-attention');
  for(const language of ['es','en'])for(const [width,height]of sizes){await page.setViewportSize({width,height});await page.evaluate(language=>{LoyaltyI18n.set(language);scrollTo(0,0);},language);
   const state=await page.evaluate(()=>{const box=s=>{const b=document.querySelector(s).getBoundingClientRect();return{top:b.top,bottom:b.bottom,width:b.width,height:b.height};};return{overflow:document.documentElement.scrollWidth>innerWidth,stamp:box('#stamp'),next:box('#new-attention'),preview:box('.counter-card-preview'),input:box('#lookup input'),quantity:document.querySelector('.stamp-quantity')?box('.stamp-quantity'):null,markers:document.querySelectorAll('.counter-card-preview .stamp').length,filled:document.querySelectorAll('.counter-card-preview .stamp.filled').length};});
   assert.equal(state.overflow,false);assert.equal(state.markers,slug==='mooncoffee'?8:slug==='santofe'?10:9);assert.equal(state.filled,2);for(const b of [state.stamp,state.next,state.input]){assert.ok(b.width>=44&&b.height>=44);}
   if(width>=1000&&height>=660){assert.ok(state.stamp.bottom<=height-8,'processing is available without page scroll');assert.ok(state.next.bottom<=height-8);assert.ok(state.preview.height<140);if(state.quantity)assert.ok(state.quantity.bottom<=height-8);}
   assert.equal(await page.locator('#new-attention').innerText(),language==='es'?'Nueva atención':'Next customer');
  }
  if(slug==='santofe'){
   db.prepare('UPDATE loyalty_cards SET stamps=3,reward_choices_pending=1 WHERE id=?').run(f.card.id);await page.setViewportSize({width:1180,height:700});await page.fill('#lookup input',f.phone);await page.click('#lookup button');await page.waitForSelector('#reward-save');assert.equal(await page.locator('.counter-card-preview .stamp.filled').count(),3,'operator preview shows actual progress, not a synthetic full card');assert.equal(await page.locator('#stamp').isDisabled(),true);assert.equal(await page.locator('#reward-save').isEnabled(),true);assert.equal(await page.locator('#reward-redeem-now').isEnabled(),true);
   const before=snapshots(db);await page.click('#new-attention');await empty(page);assert.deepEqual(snapshots(db),before);db.prepare('UPDATE loyalty_cards SET stamps=2,reward_choices_pending=0 WHERE id=?').run(f.card.id);
  }
  await context.close();
 }}finally{await browser.close();}}
});
