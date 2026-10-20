import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,server,slugs} from './reward-choice-fixture.mjs';

const logos={renace:'/assets/logo-renace.png',mooncoffee:'/assets/moon/logo-moon.png',santofe:'/assets/santofe/logo-santofe.png',vainillacoffee:'/assets/vainilla/logo.svg'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
for(const slug of slugs)test(slug+': branded loading delays only presentation, reserves metric geometry, respects motion and uses no private placeholders',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);
 t.after(()=>{app.close();db.close();});
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch(engine===chromium?{channel:'msedge',headless:true}:{headless:true});
  try{for(const role of ['customer','admin']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
   const [name,value]=f[role].cookie.split('=');await context.addCookies([{name,value,url:base}]);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/#cuenta');await page.waitForSelector('#app-loader',{state:'detached'});
   const link=role==='customer'?'#card-link':'#admin-link',ready=role==='customer'?'#qr svg':'#employee-form',pattern=role==='customer'?'**/api/card':'**/api/admin/dashboard?*';
   let requests=0;const logoRequests=[];
   page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/'))requests++;if(path===logos[slug])logoRequests.push(path);});
   for(const reduced of [false,true])for(const lang of ['es','en']){
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    await page.evaluate(lang=>window.LoyaltyI18n.set(lang),lang);
    const hold=deferred(),received=deferred();let reads=0;
    const handler=async route=>{reads++;const response=await route.fetch();received.resolve();await hold.promise;await route.fulfill({response});};
    await page.route(pattern,handler);let boxes;
    try{
     await page.click(link);await received.promise;
     const shell=page.locator('[data-card-loading],[data-admin-loading]');
     assert.equal(await shell.getAttribute('aria-busy'),'true');
     assert.equal(await page.locator('.loading-brand-logo').getAttribute('src'),logos[slug]);
     await page.waitForFunction(()=>document.querySelector('.loading-brand-logo')?.complete);
     assert.ok(await page.locator('.loading-brand-logo').evaluate(i=>i.naturalWidth>0));
     const timing=await page.locator('.loading-brand-logo').evaluate(image=>{
      const el=image.parentElement;
      const a=el.getAnimations()[0];a.pause();a.currentTime=149;
      const early=getComputedStyle(el).opacity;a.currentTime=400;
      return {delay:a.effect.getTiming().delay,early,late:getComputedStyle(el).opacity};
     });
     assert.equal(timing.delay,150);assert.equal(timing.early,'0');assert.equal(timing.late,'1','the status appears during a long wait even with reduced motion');
     assert.equal(await page.locator('.loading-brand-logo').evaluate(el=>getComputedStyle(el).animationName),reduced?'none':'loading-brand-breathe');
     const status=await shell.locator('[role=status]').innerText();
     assert.equal(status,role==='customer'?(lang==='es'?'Cargando tu tarjeta…':'Loading your card…'):(lang==='es'?'Cargando administración…':'Loading administration…'));
     assert.equal(await page.locator('.loading-brand-caption').innerText(),status);
     if(role==='admin'){
      const position=await page.locator('.loading-brand-caption').evaluate(el=>{
       const b=el.getBoundingClientRect(),stats=document.querySelector('.stats').getBoundingClientRect(),panel=document.querySelector('.customers-panel').getBoundingClientRect();
       return {belowStatistics:b.top>=stats.bottom,insidePanel:b.top>=panel.top&&b.bottom<=panel.bottom,insideViewport:b.top>=0&&b.bottom<innerHeight-70,fontSize:getComputedStyle(el).fontSize};
      });
      assert.deepEqual(position,{belowStatistics:true,insidePanel:true,insideViewport:true,fontSize:'14px'},'readable brand status stays in Customers, clear of statistics and bottom navigation');
      const indicators=await page.locator('.admin-loading-value').evaluateAll(xs=>xs.map(el=>{
       const animation=el.getAnimations()[0];animation.pause();animation.currentTime=149;
       const early=getComputedStyle(el).opacity;animation.currentTime=400;
       return {points:el.children.length,early,late:getComputedStyle(el).opacity,delay:animation.effect.getTiming().delay,motion:getComputedStyle(el.firstElementChild).animationName};
      }));
      assert.equal(indicators.length,4);
      for(const indicator of indicators)assert.deepEqual(indicator,{points:3,early:'0',late:'1',delay:150,motion:reduced?'none':'admin-value-breathe'},'metric indicators have the same delayed, reduced-motion-safe lifecycle without numeric placeholders');
     }
     assert.equal(await page.locator('#qr svg,.premium-customer,#employee-form,#profile-form').count(),0);
     assert.equal(await page.locator('.card-loading-placeholder,.admin-loading-bar').count(),0);
     assert.equal(await page.locator('.loading-stat').evaluateAll(xs=>xs.every(x=>x.textContent.trim()==='')),true,'no fabricated balances');
     boxes=await page.locator('.stats .panel').evaluateAll(xs=>xs.map(x=>{const b=x.getBoundingClientRect();return [b.y,b.height];}));
    }finally{hold.resolve();}
    await page.waitForSelector(ready,{state:'attached'});
    assert.equal(await page.locator('.loading-reveal').count(),0,'no minimum display time or leftover loader');
    const loaded=await page.locator('.stats .panel').evaluateAll(xs=>xs.map(x=>{const b=x.getBoundingClientRect();return [b.y,b.height];}));
    assert.deepEqual(loaded,boxes,'real statistic line boxes reserve identical geometry');
    assert.equal(reads,1);await page.unroute(pattern,handler);
    await page.click('#account-link');await page.waitForSelector('#profile-form');
   }
   assert.equal(requests,4,'one API per entry; no prefetched or repeated session data');
   assert.deepEqual(logoRequests,[],'loading reuses the real logo already loaded by the header');
   assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
 }
});

test('fast responses remove the loading view before its visual delay; leaving and logout discard pending brand animations',async t=>{
 const db=schema(),f=await fixture(db,'santofe'),{app,base}=await server(db,'santofe'),browser=await chromium.launch({channel:'msedge',headless:true});
 t.after(async()=>{await browser.close();app.close();db.close();});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const [name,value]=f.customer.cookie.split('=');await context.addCookies([{name,value,url:base}]);
 const page=await context.newPage();await page.goto(base+'/#cuenta');await page.waitForSelector('#app-loader',{state:'detached'});
 // Capture the actual authorized response once; instant transport still uses the real renderer.
 const response=await page.request.get(base+'/api/card'),body=await response.text();
 await page.route('**/api/card',r=>r.fulfill({status:200,contentType:'application/json',body}));
 await page.evaluate(()=>{
  window.loadingFrames=[];
  const observe=()=>{const el=document.querySelector('.loading-reveal');if(el)window.loadingFrames.push({time:el.getAnimations()[0]?.currentTime,opacity:getComputedStyle(el).opacity});requestAnimationFrame(observe);};requestAnimationFrame(observe);
 });
 await page.click('#card-link');await page.waitForSelector('#qr svg',{state:'attached'});
 const frames=await page.evaluate(()=>window.loadingFrames);
 assert.ok(frames.every(x=>x.time>=150||x.opacity==='0'),'no flash before the threshold');
 assert.equal(await page.locator('.loading-reveal').count(),0);
 await page.unroute('**/api/card');
 await page.click('#account-link');await page.waitForSelector('#profile-form');
 const hold=deferred(),received=deferred();
 await page.route('**/api/card',async r=>{received.resolve();await hold.promise;await r.fulfill({status:200,contentType:'application/json',body}).catch(()=>{});});
 await page.click('#card-link');await received.promise;
 await page.click('#account-link');await page.waitForSelector('#profile-form');
 hold.resolve();await page.waitForTimeout(450);
 assert.equal(await page.locator('.loading-reveal,#qr svg').count(),0);
 assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.animationName?.startsWith('loading-brand')).length),0);
 await page.click('#logout');await page.waitForFunction(()=>document.querySelector('#logout').hidden);
 assert.equal(await page.locator('.loading-reveal,#qr svg').count(),0);
 await context.close();
});
