import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,server,slugs} from './reward-choice-fixture.mjs';

const sizes=[[360,800],[390,844],[412,915],[430,932],[768,1024],[844,390],[1366,768]];
const links={public:['staff-link'],customer:['home-link','card-link','account-link'],staff:['home-link','counter-link','account-link'],admin:['home-link','counter-link','admin-link','account-link']};
const ready={public:'#auth-form',customer:'#profile-form',staff:'#profile-form',admin:'#profile-form'};

async function navigation(page,role){
 const state=await page.evaluate(()=>{
  const nav=document.querySelector('#primary-navigation'),css=getComputedStyle(nav),b=nav.getBoundingClientRect();
  const links=[...nav.querySelectorAll('a')].filter(a=>!a.hidden);
  return {tenant:document.documentElement.dataset.tenant,connected:nav.isConnected,display:css.display,visibility:css.visibility,pointerEvents:css.pointerEvents,position:css.position,top:b.top,bottom:b.bottom,height:b.height,width:innerWidth,heightViewport:innerHeight,padding:parseFloat(getComputedStyle(document.body).paddingBottom),ids:links.map(a=>a.id),clickable:links.every(a=>{const r=a.getBoundingClientRect();return a.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})};
 });
 assert.equal(state.connected,true);assert.notEqual(state.display,'none');assert.equal(state.visibility,'visible');assert.notEqual(state.pointerEvents,'none');assert.deepEqual(state.ids,links[role]);
 // Vainilla deliberately keeps its anonymous team-access link in the header.
 if(state.width<=1000&&!(state.tenant==='vainillacoffee'&&role==='public')){assert.equal(state.position,'fixed');assert.ok(Math.abs(state.bottom-state.heightViewport)<1);assert.ok(state.height>=64);assert.ok(state.padding>=state.height);assert.equal(state.clickable,true,'correct-role links remain visible and hit-testable while a field retains focus');}
 else assert.equal(state.position,'static');
 return state;
}

for(const slug of slugs)test(slug+': focus, dismissed-keyboard viewport, scroll, rotation and history cannot leave role navigation hidden',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);t.after(()=>{app.close();db.close();});
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch(engine===chromium?{channel:'msedge',headless:true}:{headless:true});
  try{for(const role of ['public','customer','staff','admin']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
   if(role!=='public'){const [name,value]=f[role].cookie.split('=');await context.addCookies([{name,value,url:base}]);}
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/#'+(role==='public'?'login':'cuenta'));await page.waitForSelector(ready[role]);await page.waitForSelector('#app-loader',{state:'detached'});
   const input=role==='public'?'#auth-form [name=login]':'#profile-form [name=name]';
   for(const [width,height]of sizes){
    await page.setViewportSize({width,height});await page.locator(input).focus();
    const focused=await page.locator(input).evaluate(el=>el===document.activeElement);assert.equal(focused,true);
    await navigation(page,role);
    // Emulate viewport shrink/restore independently of focus. No native IME is claimed.
    await page.setViewportSize({width,height:Math.max(250,height-300)});await navigation(page,role);
    await page.keyboard.press('Escape');await page.setViewportSize({width,height});
    assert.equal(await page.locator(input).evaluate(el=>el===document.activeElement),true,'restored viewport does not imply blur');
    await navigation(page,role);
    for(const direction of [1,0,1,0]){await page.evaluate(direction=>scrollTo(0,direction*document.documentElement.scrollHeight),direction);await navigation(page,role);}
   }
   await page.setViewportSize({width:390,height:844});
   for(const lang of ['en','es']){await page.locator(input).focus();await page.evaluate(lang=>LoyaltyI18n.set(lang),lang);assert.equal(await page.locator(input).evaluate(el=>el===document.activeElement),true);await navigation(page,role);}
   const route=role==='public'?'equipo':'inicio';await page.evaluate(route=>location.hash=route,route);await page.waitForSelector(role==='public'?'#auth-form':'.tenant-landing');await navigation(page,role);
   await page.goBack();await page.waitForSelector(ready[role]);await navigation(page,role);
   assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
 }
});

test('pinch zoom remains accessible and safe-area/orientation changes recover without reloading or hiding navigation',async t=>{
 const db=schema(),f=await fixture(db,'santofe'),{app,base}=await server(db,'santofe'),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const [name,value]=f.admin.cookie.split('=');await context.addCookies([{name,value,url:base}]);const page=await context.newPage();await page.goto(base+'/#cuenta');await page.waitForSelector('#app-loader',{state:'detached'});
 const meta=await page.locator('meta[name=viewport]').getAttribute('content');assert.doesNotMatch(meta,/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?:\D|$)/i);
 const cdp=await context.newCDPSession(page),marker=await page.evaluate(()=>window.__navigationTest=crypto.randomUUID());
 await page.locator('#profile-form input').focus();
 await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:34,left:0,right:0}});
 const safe=await navigation(page,'admin');assert.equal(safe.height,98);
 for(const scale of [1.25,2,1.5,1]){
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:scale});await page.waitForFunction(scale=>Math.abs(visualViewport.scale-scale)<.02,scale);
  assert.equal(await page.locator('#primary-navigation').evaluate(el=>getComputedStyle(el).visibility),'visible');
 }
 await page.setViewportSize({width:844,height:390});await navigation(page,'admin');await page.setViewportSize({width:390,height:844});await navigation(page,'admin');
 assert.equal(await page.evaluate(()=>window.__navigationTest),marker,'no document reload is required to recover navigation');
 await page.locator('#profile-form input').evaluate(el=>el.blur());await page.click('#admin-link');await page.waitForSelector('#employee-form');await navigation(page,'admin');
 await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}});await context.close();
});

for(const slug of slugs)test(slug+': installed-PWA simulation keeps navigation through focused lookup, polling, resume and real logout',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug),browser=await chromium.launch({channel:'msedge',headless:true});t.after(async()=>{await browser.close();app.close();db.close();});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});});
 const [name,value]=f.staff.cookie.split('=');await context.addCookies([{name,value,url:base}]);const page=await context.newPage();await page.goto(base+'/#empleado');await page.waitForSelector('#lookup');await page.waitForSelector('#app-loader',{state:'detached'});
 await page.evaluate(async()=>navigator.serviceWorker.ready);await page.reload();await page.waitForSelector('#lookup');await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await page.waitForSelector('#app-loader',{state:'detached'});
 await page.fill('#lookup [name=value]',f.phone);await navigation(page,'staff');await page.click('#lookup button');await page.waitForSelector('#stamp');
 await page.locator('#lookup input').focus();const nextRead=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/staff/card'&&r.request().method()==='GET');
 await page.evaluate(()=>{dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await nextRead;
 assert.equal(await page.locator('#lookup input').evaluate(el=>el===document.activeElement),true);await navigation(page,'staff');
 await page.setViewportSize({width:390,height:500});await page.setViewportSize({width:390,height:844});await navigation(page,'staff');
 const snapshot=db.prepare('SELECT COUNT(*) count FROM loyalty_events').get().count;assert.equal(snapshot,0,'read-only navigation and polling never create commercial events');
 await page.click('#account-link');await page.waitForSelector('#profile-form');await page.locator('#profile-form input').focus();await navigation(page,'staff');
 await page.click('#logout');await page.waitForSelector('.tenant-landing');await navigation(page,'public');assert.equal(await page.locator('#admin-link').isVisible(),false);await context.close();
});
