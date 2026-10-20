import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import worker from '../worker/index.js';
import {schema,fixture,env,server,invoke,slugs} from './reward-choice-fixture.mjs';

const sizes=[[360,800],[390,844],[412,915],[430,932],[768,1024],[1366,768]];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function pageFor(browser,base,cookie){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:base}]);
 const page=await context.newPage();await page.goto(base+'/#cuenta');await page.waitForSelector('#app-loader',{state:'detached'});
 return{page,context};
}

for(const slug of slugs)test(slug+': dashboard permissions, tenant boundaries, pagination and filters remain authoritative',async t=>{
 const db=schema();t.after(()=>db.close());const f=await fixture(db,slug),other=await fixture(db,slugs.find(s=>s!==slug));
 for(const [cookie,status] of [[undefined,401],[f.customer.cookie,403],[f.staff.cookie,403],[other.admin.cookie,401]]){
  const denied=await invoke(db,slug,'/api/admin/dashboard',{cookie});assert.equal(denied.status,status);assert.equal(denied.data.customers,undefined);
 }
 const response=await worker.fetch(new Request('http://127.0.0.1/api/admin/dashboard',{headers:{cookie:f.admin.cookie}}),env(db,slug));
 assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();
 assert.equal(result.business.id,'business_'+slug);assert.equal(result.metrics.customers,1);assert.equal(result.customerPage.total,1);
 assert.deepEqual(result.customers.map(c=>c.customer_id),[f.customer.data.user.id]);
 assert.equal(result.teamPermissions.primaryAdminId,f.admin.data.user.id);assert.equal(result.teamPermissions.canManageAdmins,true);
 assert.deepEqual(result.employees.map(e=>e.id).sort(),[f.admin.data.user.id,f.staff.data.user.id].sort());
 const search=await invoke(db,slug,'/api/admin/dashboard?q=7999999999&eventType=stamp_added',{cookie:f.admin.cookie});
 assert.equal(search.data.customers.length,0);assert.equal(search.data.customerPage.total,0);assert.equal(search.data.metrics.customers,1);
 assert.equal(search.data.eventPage.filters.eventType,'stamp_added');assert.equal(search.data.business.stamp_policy,slug==='santofe'?'per_item':'daily');
});

test('dashboard starts independent permission read before waiting for activity; no additional queries or writes',async t=>{
 const db=schema(),f=await fixture(db,'santofe'),e=env(db,'santofe');t.after(()=>db.close());
 const hold=deferred(),permission=deferred(),started=deferred(),prepare=e.DB.prepare.bind(e.DB);let reads=0,writes=0;
 e.DB.prepare=sql=>{const stmt=prepare(sql);for(const method of ['first','all','run']){const call=stmt[method].bind(stmt);stmt[method]=async(...args)=>{
  if(method==='run')writes++;else reads++;
  if(sql.includes('NOT EXISTS (SELECT 1 FROM admin_audit_log'))permission.resolve();
  if(sql.includes('UNION ALL')){started.resolve();await hold.promise;}
  return call(...args);
 };}return stmt;};
 const pending=worker.fetch(new Request('http://127.0.0.1/api/admin/dashboard',{headers:{cookie:f.admin.cookie}}),e);
 await started.promise;
 try{await Promise.race([permission.promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Permission query still waits for activity')),2000);timer.unref();})]);}
 finally{hold.resolve();}
 assert.equal((await pending).status,200);assert.equal(reads,9);assert.equal(writes,0);
});

for(const slug of slugs)test(slug+': immediate admin shell, ES/EN, responsive Edge/WebKit and one request per entry',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);t.after(()=>{app.close();db.close();});
 for(const engine of ['edge','webkit']){
  const browser=await(engine==='edge'?chromium.launch({channel:'msedge',headless:true}):webkit.launch({headless:true}));
  try{
   const {page,context}=await pageFor(browser,base,f.admin.cookie);const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const requests=[];page.on('request',r=>requests.push(r.url()));
   for(const locale of ['es','en'])for(const [width,height] of sizes){
    await page.setViewportSize({width,height});await page.evaluate(lang=>window.LoyaltyI18n.set(lang),locale);
    await page.locator('#account-link').click();await page.waitForSelector('#profile-form');
    const held=deferred(),received=deferred();let reads=0,titleBefore;
    const intercept=async route=>{reads++;received.resolve();const response=await route.fetch();await held.promise;await route.fulfill({response});};
    await page.route('**/api/admin/dashboard?*',intercept);
    try{
     await page.locator('#admin-link').click();await received.promise;
     await page.waitForSelector('[data-admin-loading]');assert.equal(await page.locator('[data-admin-loading]').getAttribute('aria-busy'),'true');
     titleBefore=await page.locator('#app > .page-title').boundingBox();
     assert.equal(await page.locator('#employee-form').count(),0,'no stale private data or live controls before authorization');
     assert.equal(await page.locator('[data-admin-loading] [role="status"]').innerText(),locale==='es'?'Cargando administración…':'Loading administration…');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
     if(process.env.ADMIN_NAV_SCREENSHOTS&&locale==='es'&&width===390&&engine==='edge'){
      await mkdir(process.env.ADMIN_NAV_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.ADMIN_NAV_SCREENSHOTS+'/'+slug+'-loading.png'});
     }
    }finally{held.resolve();}
    await page.waitForSelector('#employee-form');assert.equal(await page.locator('[data-admin-loading]').count(),0);
    const titleAfter=await page.locator('#app > .page-title').boundingBox();assert.ok(Math.abs(titleAfter.y-titleBefore.y)<1&&Math.abs(titleAfter.height-titleBefore.height)<1,'heading stays in place when data arrives');
    assert.equal(reads,1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.ok(await page.locator('#export-all-customers').isEnabled());assert.equal(await page.locator('.adjust-stamps').count(),1);
    if(process.env.ADMIN_NAV_SCREENSHOTS&&((locale==='es'&&width===390&&engine==='edge')||(slug==='santofe'&&locale==='en'&&width===1366&&engine==='webkit'))){
     await page.screenshot({path:process.env.ADMIN_NAV_SCREENSHOTS+'/'+slug+'-'+engine+'-'+locale+'-'+width+'-ready.png'});
    }
    await page.unroute('**/api/admin/dashboard?*',intercept);
   }
   assert.equal(requests.some(url=>/xlsx-worker|exceljs|\/api\/admin\/export/.test(url)),false,'export code stays lazy');
   assert.equal(requests.filter(url=>url.includes('/api/me')).length,0,'navigation does not repeat initial session request');assert.deepEqual(errors,[]);
   await context.close();
  }finally{await browser.close();}
 }
});

test('admin load cancels on leaving, ignores late responses and recovers from server failure without duplicate listeners',async t=>{
 const db=schema(),f=await fixture(db,'santofe'),{app,base}=await server(db,'santofe'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const {page}=await pageFor(browser,base,f.admin.cookie);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const held=deferred(),received=deferred(),aborted=deferred();page.on('requestfailed',r=>{if(r.url().includes('/api/admin/dashboard'))aborted.resolve();});
 await page.route('**/api/admin/dashboard?*',async route=>{const response=await route.fetch();received.resolve();await held.promise;await route.fulfill({response}).catch(error=>{if(!/closed|already handled/.test(error.message))throw error;});});
 await page.click('#admin-link');await received.promise;await page.click('#account-link');await page.waitForSelector('#profile-form');
 await Promise.race([aborted.promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Admin fetch was not cancelled')),2000);timer.unref();})]);held.resolve();
 await page.unroute('**/api/admin/dashboard?*');assert.equal(await page.locator('#employee-form').count(),0);
 await page.route('**/api/admin/dashboard?*',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({ok:false,error:{message:'Fallo ficticio de conexión.'}})}));
 await page.click('#admin-link');await page.waitForSelector('#retry');assert.equal(await page.locator('[data-admin-loading]').count(),0);
 await page.unroute('**/api/admin/dashboard?*');await page.click('#retry');await page.waitForSelector('#employee-form');
 let count=0;page.on('request',r=>{if(r.url().includes('/api/admin/dashboard'))count++;});
 await page.fill('#customer-search input','7999999999');await page.click('#customer-search button');await page.waitForSelector('#clear-search');assert.equal(count,1);assert.equal(await page.locator('.adjust-stamps').count(),0);
 await page.click('#clear-search');await page.waitForSelector('.adjust-stamps');assert.equal(count,2);
 await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.match(await page.locator('#employee-form').innerText(),/Create user/);
 assert.deepEqual(errors,[]);
});
