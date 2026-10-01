import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

test('closed mobile client views fit the viewport without covering the footer or reducing touch targets',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 for(const [slug,port,goal] of [['renace',8787,9],['mooncoffee',8788,8],['santofe',8789,10]]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
  // Browser-only fixtures: no login, preference writes or real customer data.
  await context.route('**/api/**',async route=>{assert.equal(route.request().method(),'GET');const path=new URL(route.request().url()).pathname;assert.ok(['/api/me','/api/card'].includes(path));await route.fulfill({json:path==='/api/me'?{ok:true,user:{id:'LOCAL-HEIGHT',name:'Fer',role:'customer',mustChangeSecret:false}}:{ok:true,card:{id:'LOCAL-HEIGHT',name:'Fer',phone:'0000000000',stamps:1,goal,reward:'Café gratis',stampStyle:slug==='mooncoffee'?'moon':slug==='renace'?'cowboy':'santofe',qrValue:slug+':LOCAL-HEIGHT',stampPolicy:slug==='santofe'?'per_item':'daily',canStampToday:false,lastStampAt:null}}});});
  await page.goto(`http://127.0.0.1:${port}/#tarjeta`);await page.waitForSelector('#qr svg',{state:'attached'});await page.waitForSelector('#app-loader',{state:'detached'});
  for(const [width,height] of [[360,800],[390,844],[393,852],[412,915]]){
   await page.setViewportSize({width,height});
   for(const lang of ['es','en']){
    await page.evaluate(lang=>window.LoyaltyI18n.set(lang),lang);
    const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollHeight-innerHeight,horizontal:document.documentElement.scrollWidth-innerWidth,footerBottom:document.querySelector('body>footer').getBoundingClientRect().bottom,navTop:document.querySelector('#primary-navigation').getBoundingClientRect().top,targets:[...document.querySelectorAll('.loyalty-quick-actions button,.help-actions button,.loyalty-card-details summary,#flip-card')].map(n=>n.getBoundingClientRect().height)}));
    assert.equal(geometry.overflow,0,`${slug} ${width} ${lang}`);assert.equal(geometry.horizontal,0);assert.ok(geometry.footerBottom<=geometry.navTop+.5);assert.ok(geometry.targets.every(h=>h>=44));
   }
  }
  // An extra bottom inset must be reserved only once; expanded details may scroll normally.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.setProperty('--bottom-navigation-space','88px'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight),0);
  await page.locator('.loyalty-card-details summary').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight));
  assert.ok(await page.locator('.loyalty-card-details .social').isVisible());await context.close();
 }
});
