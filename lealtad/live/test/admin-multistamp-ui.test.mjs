import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,server,invoke} from './reward-choice-fixture.mjs';
const sizes=[[360,800],[390,844],[412,915],[430,932],[768,1024],[1366,768],[1440,900]];
for(const slug of ['renace','mooncoffee','santofe','vainillacoffee'])test(slug+': accessible quantity/reason, server preview, confirmation and one POST on mobile/desktop ES/EN',async t=>{
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);t.after(()=>{app.close();db.close();});
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const cookie=f.admin.cookie;await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base}]);
 await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 await page.goto(base+'/#admin');await page.waitForSelector('.adjust-stamps');await page.waitForSelector('#app-loader',{state:'detached'});
 for(const locale of ['es','en'])for(const [width,height] of sizes){
  await page.setViewportSize({width,height});await page.evaluate(locale=>window.LoyaltyI18n.set(locale),locale);
  await page.click('.adjust-stamps');await page.waitForSelector('#adjust-quantity');assert.equal(await page.locator('#adjust-quantity').getAttribute('inputmode'),'numeric');
  await page.fill('#adjust-quantity','2');await page.fill('#adjust-form textarea','Corrección local <sin HTML>');await page.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);
  assert.match(await page.locator('#adjust-preview').innerText(),/0 → 2/);
  const layout=await page.locator('dialog').evaluate(d=>{const r=d.getBoundingClientRect(),control=d.querySelector('.admin-quantity-control');return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:d.scrollWidth>d.clientWidth,controls:[...control.children].map(e=>e.getBoundingClientRect().height)};});
  assert.ok(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height);assert.equal(layout.overflow,false);assert.ok(layout.controls.every(h=>h>=44));
  if(process.env.ADMIN_MULTI_EVIDENCE&&locale==='es'&&width===390){await mkdir(process.env.ADMIN_MULTI_EVIDENCE,{recursive:true});await page.screenshot({path:path.join(process.env.ADMIN_MULTI_EVIDENCE,slug+'-quantity-mobile.png')});}
  await page.click('#confirm-adjust');await page.waitForFunction(()=>document.querySelector('#confirm-adjust').textContent.includes('+2'));
  const copy=await page.locator('#adjust-preview').innerText();assert.match(copy,new RegExp(locale==='en'?(slug==='vainillacoffee'?'2 flowers':'2 stamps'):(slug==='vainillacoffee'?'2 flores':'2 sellos')));assert.equal(await page.locator('#adjust-form textarea').inputValue(),'Corrección local <sin HTML>');
  if(process.env.ADMIN_MULTI_EVIDENCE&&locale==='es'&&width===390)await page.screenshot({path:path.join(process.env.ADMIN_MULTI_EVIDENCE,slug+'-confirmation-mobile.png')});
  await page.click('#cancel-adjust');await page.click('#cancel-adjust');await page.waitForSelector('dialog',{state:'detached'});
 }
 await page.evaluate(()=>window.LoyaltyI18n.set('es'));await page.setViewportSize({width:390,height:844});await page.click('.adjust-stamps');await page.fill('#adjust-quantity','5');await page.fill('dialog textarea','Corrección administrativa local');await page.waitForFunction(()=>!document.querySelector('#confirm-adjust').disabled);await page.click('#confirm-adjust');await page.waitForFunction(()=>document.querySelector('#confirm-adjust').textContent.includes('+5'));
 let posts=0,release;const held=new Promise(resolve=>release=resolve);
 await page.route('**/api/admin/customers/*/stamps',async route=>{if(route.request().method()==='POST'){posts++;await held;}await route.continue();});
 await page.click('#confirm-adjust');assert.equal(await page.locator('#confirm-adjust').isDisabled(),true);assert.equal(await page.locator('#cancel-adjust').isDisabled(),true);await page.evaluate(()=>document.querySelector('#confirm-adjust').click());assert.equal(posts,1);release();
 await page.waitForSelector('dialog',{state:'detached'});assert.equal(db.prepare('SELECT stamps FROM loyalty_cards WHERE id=?').get(f.card.id).stamps,5);assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE json_extract(metadata,'$.kind')='stamp_added'").get().n,1);
 const dashboard=(await invoke(db,slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data;
 const event=dashboard.events.find(e=>e.event_type==='stamp_added');assert.equal(event.quantity,5);
 for(const locale of ['es','en']){
  const bytes=await page.evaluate(async data=>{const worker=new Worker('/assets/xlsx-worker.js');try{return await new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve([...new Uint8Array(data.buffer)]);worker.onerror=e=>reject(Error(e.message));worker.postMessage(data);});}finally{worker.terminate();}},{kind:'activity',rows:[event],business:dashboard.business,locale,generatedAt:new Date().toISOString()});
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(bytes));const sheet=workbook.worksheets.find(s=>s.rowCount>4);
  assert.equal(sheet.getCell('E5').value,'+5 '+(slug==='vainillacoffee'?(locale==='es'?'flores':'flowers'):(locale==='es'?'sellos':'stamps')));assert.equal(sheet.getCell('F5').value,'Corrección administrativa local');assert.equal(sheet.getCell('G5').value,event.employee);
 }
 assert.deepEqual(errors,[]);
});
