import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:8787';
// APIRequestContext does not send Secure cookies to plain HTTP; only adapt the local test cookie jar.
const localCookies=async ctx=>ctx.addCookies((await ctx.cookies()).map(c=>({...c,secure:false})));
test('stamp styles: owned account, strict API, instant update, D1 persistence and PNG QR',async t=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>b.close());
 const c=await b.newContext({viewport:{width:390,height:844}}),admin=await b.newContext(),staff=await b.newContext();
 const phone='662'+String(Date.now()).slice(-7),reg=await c.request.post(base+'/api/register',{data:{name:'Diseños prueba',phone,pin:'4826'}});assert.equal(reg.status(),201);const user=(await reg.json()).user;
 await admin.request.post(base+'/api/login/staff',{data:{username:'admin_local',password:'Admin-test-928!'}});
 await staff.request.post(base+'/api/login/staff',{data:{username:'mostrador_local',password:'Staff-test-928!'}});
 await Promise.all([localCookies(c),localCookies(admin),localCookies(staff)]);
 for(let i=0;i<5;i++){const r=await admin.request.post(base+`/api/admin/customers/${user.id}/stamps`,{data:{expectedStamps:i,delta:1,reason:'Prueba local diseño'}});assert.equal(r.status(),200);}
 const card=async ctx=>(await(await ctx.request.get(base+'/api/card')).json()).card;
 const before=await card(c);assert.equal(before.stampStyle,'classic');assert.equal(before.stamps,5);
 const events=async()=>(await(await admin.request.get(base+'/api/admin/dashboard?eventCustomer=Dise%C3%B1os%20prueba')).json()).events;
 const previousEvents=await events();
 assert.equal((await staff.request.patch(base+'/api/card/style',{data:{stampStyle:'bow'}})).status(),403);
 const other=await b.newContext();assert.equal((await other.request.patch(base+'/api/card/style',{data:{stampStyle:'bow'}})).status(),401);
 await other.request.post(base+'/api/register',{data:{name:'Otro diseño',phone:'665'+String(Date.now()).slice(-7),pin:'4826'}});
 await localCookies(other);
 for(const value of ['evil','/assets/custom.png','__proto__',null,{},1])assert.equal((await c.request.patch(base+'/api/card/style',{data:{stampStyle:value}})).status(),400);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/#tarjeta');await p.waitForSelector('#qr svg');await p.waitForSelector('#app-loader',{state:'detached'});
 await p.evaluate(()=>window.samePage='yes');
 const snapshots=[];
 for(const style of ['cowboy','bow','classic']){
  let release;const held=new Promise(r=>release=r);
  await p.route('**/api/card/style',async route=>{await held;await route.continue();});
  await p.click(`[data-stamp-style="${style}"]`);
  assert.equal(await p.locator('.stamp.filled img').count(),style==='classic'?0:5);assert.equal(await p.locator('.stamp.filled').count(),5);
  assert.equal(await p.evaluate(()=>window.samePage),'yes');release();
  await p.waitForSelector('[data-stamp-style]:not(:disabled)');await p.unroute('**/api/card/style');
  assert.equal((await card(c)).stampStyle,style);assert.equal((await card(other)).stampStyle,'classic');
  const promise=p.waitForEvent('download');await p.click('#download-card');const download=await promise;
  const chunks=[];for await(const ch of await download.createReadStream())chunks.push(ch);
  if(process.env.RENACE_SCREENSHOTS&&style==='bow')await download.saveAs(process.env.RENACE_SCREENSHOTS+'/saved-card-bow.png');
  const encoded=Buffer.concat(chunks).toString('base64');
  const png=await p.evaluate(async data=>{const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const qr=x.getImageData(216,565,648,648),stamps=x.getImageData(75,1270,930,100);let hash=0;for(const v of stamps.data)hash=(hash*31+v)>>>0;return {qr:jsQR(qr.data,648,648)?.data,hash};},encoded);
  assert.equal(png.qr,before.qrValue);snapshots.push(png.hash);
 }
 assert.equal(new Set(snapshots).size,3);
 const after=await card(c);assert.deepEqual({...after,stampStyle:before.stampStyle},before);assert.deepEqual(await events(),previousEvents);
 await c.request.patch(base+'/api/card/style',{data:{stampStyle:'bow',customerId:(await card(other)).id}});assert.equal((await card(other)).stampStyle,'classic');
 await c.request.post(base+'/api/logout');await c.request.post(base+'/api/login/customer',{data:{phone,pin:'4826'}});await localCookies(c);assert.equal((await card(c)).stampStyle,'bow');
 const second=await b.newContext();await second.request.post(base+'/api/login/customer',{data:{phone,pin:'4826'}});await localCookies(second);assert.equal((await card(second)).stampStyle,'bow');
 await p.reload();await p.waitForSelector('.stamp.filled img');assert.equal(await p.locator('[data-stamp-style="bow"]').getAttribute('aria-pressed'),'true');
 await p.waitForSelector('#app-loader',{state:'detached'});
 if(process.env.RENACE_SCREENSHOTS)await p.screenshot({path:process.env.RENACE_SCREENSHOTS+'/stamp-picker-mobile.png',fullPage:true});
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.route('**/api/card/style',route=>route.fulfill({status:503,json:{error:{message:'Prueba: sin conexión'}}}));await p.click('[data-stamp-style="cowboy"]');await p.waitForSelector('[data-stamp-style="bow"][aria-pressed="true"]');assert.equal((await card(c)).stampStyle,'bow');await p.unroute('**/api/card/style');
 // Simulate an old invalid stored value at the API boundary: rendering always falls back to classic.
 await p.route('**/api/card',async route=>route.fulfill({json:{ok:true,card:{...before,stampStyle:'old-unknown'}}}));await p.reload();await p.waitForSelector('#qr svg');assert.equal(await p.locator('[data-stamp-style="classic"]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('.stamp.filled img').count(),0);
 assert.deepEqual(errors,[]);
});
test('public printed QR decodes to the exact entry URL',async t=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>b.close());const p=await b.newPage();await p.goto(base);
 const url=await p.evaluate(async()=>{const i=new Image();i.src='/print/renace-acceso.png';await i.decode();const c=document.createElement('canvas');c.width=874;c.height=1240;const ctx=c.getContext('2d');ctx.drawImage(i,0,0,874,1240);const d=ctx.getImageData(0,0,874,1240);return jsQR(d.data,d.width,d.height)?.data;});
 assert.equal(url,'https://renacecafe.haloswebs.com/');
 const migration=await readFile(new URL('../migrations/0007_stamp_style.sql',import.meta.url),'utf8');assert.match(migration,/DEFAULT 'classic'.*CHECK/s);
});
