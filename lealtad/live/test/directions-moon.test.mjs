import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const cases=[
 {slug:'mooncoffee',port:8788,goal:8,links:[['Cómo llegar','https://maps.app.goo.gl/CXaEb4hZ4nK5ctQ17']]},
 {slug:'santofe',port:8789,goal:10,links:[['Cómo llegar · Pinos','https://maps.app.goo.gl/rdBsjChh92f7uXsj9'],['Cómo llegar · Otay','https://maps.app.goo.gl/1hbD3RYi4vcQUjVB8']]}
];
test('directions translate on public/client views and earned Moon stamps stay nocturnal in the app and backup PNG retains the QR',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 for(const item of cases){
  const base=`http://127.0.0.1:${item.port}`,context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
  let authenticated=false;const unexpected=[],card={id:'LOCAL-VISUAL-'+item.slug,name:'Vista local',phone:'0000000000',stamps:1,goal:item.goal,reward:item.slug==='mooncoffee'?'Bebida gratis':'Café gratis',stampStyle:item.slug==='mooncoffee'?'moon':'santofe',qrValue:item.slug+':LOCAL-VISUAL',stampPolicy:item.slug==='mooncoffee'?'daily':'per_item',canStampToday:true,lastStampAt:null};
  // Pure browser fixtures: this test never logs in, changes preferences or touches D1.
  await context.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let json,status=200;if(req.method()!=='GET'){unexpected.push(req.method()+path);await route.abort();return;}if(path==='/api/me'){status=authenticated?200:401;json={ok:authenticated,user:authenticated?{id:'LOCAL-VISUAL',name:card.name,role:'customer',mustChangeSecret:false}:null};}else if(path==='/api/card')json={ok:true,card};else{unexpected.push(path);await route.abort();return;}await route.fulfill({status,json});});
  for(const view of ['public','customer']){
   authenticated=view==='customer';await page.goto(base+(authenticated?'/?visual=customer#tarjeta':'/'));await page.waitForSelector('#app-loader',{state:'detached'});
   if(authenticated){await page.waitForSelector('#qr svg',{state:'attached'});await page.locator('.loyalty-card-details').evaluate(n=>n.open=true);}
   const container=page.locator(authenticated?'.loyalty-card-details':'.visit-us');
   for(const lang of ['es','en','es']){
    await page.evaluate(lang=>window.LoyaltyI18n.set(lang),lang);
    for(const [label,url] of item.links){const link=container.locator(`a[href="${url}"]`);assert.equal(await link.count(),1);assert.equal(await link.innerText(),(lang==='en'?label.replace('Cómo llegar','Directions'):label)+' ↗');assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');}
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(authenticated&&item.slug==='mooncoffee'){
    assert.equal(await page.locator('.personal-card .stamp.filled').count(),1);assert.equal(await page.locator('.moon-stamp-cup').count(),7);assert.equal(await page.locator('[data-stamp-style="moon"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-stamp-style="classic"]').getAttribute('aria-pressed'),'false');
    const filled=await page.locator('.stamp.filled').evaluate(n=>getComputedStyle(n).backgroundImage),empty=await page.locator('.moon-card-stamps .stamp:not(.filled)').first().evaluate(n=>getComputedStyle(n).backgroundImage);assert.match(filled,/radial-gradient/);assert.equal(empty,'none');
    assert.equal(await page.locator('[data-stamp-style="moon"] img').getAttribute('src'),await page.locator('.stamp.filled img').getAttribute('src'));
    const pending=page.waitForEvent('download');await page.click('#download-card');const download=await pending,chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
    const pixels=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const qr=ctx.getImageData(216,565,648,648);return{qr:jsQR(qr.data,648,648)?.data};},Buffer.concat(chunks).toString('base64'));
    assert.equal(pixels.qr,card.qrValue);
   }
  }
  assert.deepEqual(unexpected,[]);await context.close();
 }
});
