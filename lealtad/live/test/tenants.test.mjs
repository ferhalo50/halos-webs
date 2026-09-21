import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTenant} from '../worker/tenants.js';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import ExcelJS from 'exceljs';
const bases=['http://127.0.0.1:8787','http://127.0.0.1:8788'];
async function req(i,path,{cookie,body,method=body?'POST':'GET',headers={}}={}){const r=await fetch(bases[i]+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function all(i,kind,cookie){const rows=[];let offset=0;do{const r=await req(i,'/api/admin/export/'+kind+'?offset='+offset,{cookie});assert.equal(r.status,200);rows.push(...r.data.rows);offset=r.data.nextOffset;}while(offset!==null);return rows;}
test('hostname allowlist cannot be switched by client business id or a foreign cookie',()=>{
 assert.equal(resolveTenant(new URL('https://mooncoffee.haloswebs.com/?business=renace'),{}).slug,'mooncoffee');assert.equal(resolveTenant(new URL('https://renacecafe.haloswebs.com/'),{DEV_TENANT:'mooncoffee',ALLOW_DEMO:'true'}).slug,'renace');assert.equal(resolveTenant(new URL('https://renacecafe.haloswebs.com/'),{ALLOW_DEMO:'true'}).demo,false);assert.equal(resolveTenant(new URL('https://unknown.example/'),{}),null);
});
test('two tenants: independent identities, QR, PIN, exports, updates, daily visits and rewards',async()=>{
 const set=await req(1,'/api/setup',{body:{adminUsername:'admin_moon_local',adminPassword:'Moon-admin-local928!',employeeUsername:'moon_staff_local',employeePassword:'Moon-staff-local928!'},headers:{'x-bootstrap-secret':'local-test-bootstrap'}});assert.ok([201,409].includes(set.status));
 const admin=[],staff=[],customers=[],cards=[],phone='669'+String(Date.now()).slice(-7);
 for(let i=0;i<2;i++){
  admin[i]=await req(i,'/api/login/staff',{body:{username:i?'admin_moon_local':'admin_local',password:i?'Moon-admin-local928!':'Admin-test-928!'}});staff[i]=await req(i,'/api/login/staff',{body:{username:i?'moon_staff_local':'mostrador_local',password:i?'Moon-staff-local928!':'Staff-test-928!'}});assert.equal(admin[i].status,200);assert.equal(staff[i].status,200);
  assert.equal((await req(i,'/api/login/customer',{body:{phone,pin:'4826'}})).status,401);
  customers[i]=await req(i,'/api/register',{body:{name:(i?'Moon':'Renace')+' aislamiento',phone,pin:'4826',business:i?'renace':'mooncoffee',business_id:i?'business_renace':'business_mooncoffee'}});assert.equal(customers[i].status,201);
  assert.equal((await req(i,'/api/register',{body:{name:'Duplicado',phone,pin:'4826'}})).status,409);
  cards[i]=(await req(i,'/api/card',{cookie:customers[i].cookie})).data.card;assert.equal(cards[i].goal,i?8:9);assert.equal(cards[i].stamps,0);assert.ok(cards[i].qrValue.startsWith(i?'mooncoffee:':'renace:'));
 }
 assert.notEqual(customers[0].data.user.id,customers[1].data.user.id);
 for(let i=0;i<2;i++){
  const j=1-i,cookie=staff[i].cookie,foreign=cards[j];
  for(const path of ['/api/card','/api/me'])assert.equal((await req(i,path,{cookie:customers[j].cookie})).status,401);
  assert.equal((await req(i,'/api/admin/dashboard',{cookie:admin[j].cookie})).status,401);
  assert.equal((await req(i,'/api/login/staff',{body:{username:j?'admin_moon_local':'admin_local',password:j?'Moon-admin-local928!':'Admin-test-928!'}})).status,401);
  for(const value of [foreign.id,foreign.qrValue])assert.equal((await req(i,'/api/staff/card?value='+encodeURIComponent(value),{cookie})).status,404);
  for(const action of ['stamp','redeem'])assert.equal((await req(i,'/api/staff/'+action,{cookie,body:{cardId:foreign.id}})).status,404);
  for(const role of ['staff','admin'])assert.equal((await req(i,`/api/${role}/customers/${customers[j].data.user.id}/pin`,{cookie:role==='admin'?admin[i].cookie:cookie,method:'PATCH',body:{}})).status,404);
  assert.equal((await req(i,`/api/admin/customers/${customers[j].data.user.id}`,{cookie:admin[i].cookie,method:'PUT',body:{name:'Intruso',phone}})).status,404);
  const exported=await all(i,'clients',admin[i].cookie);assert.ok(exported.some(r=>r.id===cards[i].id));assert.ok(!exported.some(r=>r.id===foreign.id));
  const dashboard=await req(i,'/api/admin/dashboard?q='+phone,{cookie:admin[i].cookie});assert.equal(dashboard.data.customers.length,1);assert.equal(dashboard.data.customers[0].id,cards[i].id);
  assert.equal((await req(i,'/api/staff/card?value='+encodeURIComponent(cards[i].qrValue),{cookie})).status,200);
  const style=i?'moon':'bow';assert.equal((await req(i,'/api/card/style',{cookie:customers[i].cookie,method:'PATCH',body:{stampStyle:style}})).status,200);
  assert.equal((await req(i,'/api/card/style',{cookie:customers[i].cookie,method:'PATCH',body:{stampStyle:i?'cowboy':'moon'}})).status,400);
  assert.equal((await req(i,'/api/card',{cookie:customers[i].cookie})).data.card.stampStyle,style);
  for(let n=0;n<cards[i].goal-1;n++)assert.equal((await req(i,`/api/admin/customers/${customers[i].data.user.id}/stamps`,{cookie:admin[i].cookie,body:{expectedStamps:n,delta:1,reason:'Prueba local recompensa'}})).status,200);
  assert.equal((await req(i,'/api/card',{cookie:customers[i].cookie})).data.card.stamps,cards[i].goal-1);
  const filled=await req(i,'/api/staff/stamp',{cookie,body:{cardId:cards[i].id}});assert.equal(filled.data.card.stamps,cards[i].goal);
  assert.equal((await req(i,'/api/staff/stamp',{cookie,body:{cardId:cards[i].id}})).status,409);
  const redeem=await req(i,'/api/staff/redeem',{cookie,body:{cardId:cards[i].id}});assert.equal(redeem.data.card.stamps,0);assert.equal(redeem.data.card.redeemed,1);
  assert.equal((await req(i,'/api/staff/stamp',{cookie,body:{cardId:cards[i].id}})).status,409);
  const reset=await req(i,`/api/staff/customers/${customers[i].data.user.id}/pin`,{cookie,method:'PATCH',body:{}});assert.equal(reset.status,200);assert.equal((await req(i,'/api/card',{cookie:customers[i].cookie})).status,401);
  const login=await req(i,'/api/login/customer',{body:{phone,pin:reset.data.customer.temporaryPin}});assert.equal(login.data.user.mustChangeSecret,true);
  assert.equal((await req(i,'/api/account/secret',{cookie:login.cookie,body:{currentSecret:reset.data.customer.temporaryPin,newSecret:'123456'}})).status,200);
  assert.equal((await req(i,'/api/card',{cookie:login.cookie})).data.card.stampStyle,style);
  const activity=await all(i,'activity',admin[i].cookie);assert.ok(activity.some(r=>r.card_id===cards[i].id));assert.ok(!activity.some(r=>r.card_id===foreign.id));
 }
});
test('MOON browser: eight stamps, identity, social links, PNG QR, styles, guides, XLSX and installation',async t=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const phone='668'+String(Date.now()).slice(-7),registration=await ctx.request.post(bases[1]+'/api/register',{data:{name:'Renace es mi nombre',phone,pin:'4826'}});assert.equal(registration.status(),201);const user=(await registration.json()).user;
 await ctx.addCookies((await ctx.cookies()).map(c=>({...c,secure:false})));
 const admin=await req(1,'/api/login/staff',{body:{username:'admin_moon_local',password:'Moon-admin-local928!'}});
 for(let n=0;n<7;n++)await req(1,`/api/admin/customers/${user.id}/stamps`,{cookie:admin.cookie,body:{delta:1,expectedStamps:n,reason:'Moon PNG local'}});
 await page.goto(bases[1]+'/#tarjeta');await page.waitForSelector('#qr svg');await page.waitForSelector('#app-loader',{state:'detached'});
 assert.equal(await page.locator('.stamps .stamp').count(),8);assert.equal(await page.locator('.stamp.filled').count(),7);assert.match(await page.locator('.welcome h1').innerText(),/Renace es mi nombre/);assert.doesNotMatch(await page.locator('footer').innerText(),/renace/i);
 assert.equal(await page.locator('.social a').count(),3);assert.equal(await page.locator('.social a').first().getAttribute('href'),'https://www.facebook.com/profile.php?id=61592504380202');
 await page.click('[data-stamp-style="moon"]');await page.waitForSelector('[data-stamp-style="moon"]:not(:disabled)');await page.reload();await page.waitForSelector('.stamp.filled img');
 const card=(await(await ctx.request.get(bases[1]+'/api/card')).json()).card;assert.equal(card.stampStyle,'moon');
 const download=page.waitForEvent('download');await page.click('#download-card');const d=await download;const chunks=[];for await(const ch of await d.createReadStream())chunks.push(ch);const encoded=Buffer.concat(chunks).toString('base64');
 const decoded=await page.evaluate(async data=>{const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const pixels=x.getImageData(216,565,648,648);return jsQR(pixels.data,648,648)?.data;},encoded);assert.equal(decoded,card.qrValue);
 await page.click('#role-guide');assert.match(await page.locator('dialog').innerText(),/8 sellos/);assert.match(await page.locator('dialog').innerText(),/Clásico o Luna/);assert.doesNotMatch(await page.locator('dialog').innerText(),/9\/9|Renace|Vaquero/);await page.keyboard.press('Escape');
 await page.click('#install-app');assert.match(await page.locator('dialog').innerText(),/MOON/);await page.keyboard.press('Escape');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(process.env.MOON_SCREENSHOTS){await page.screenshot({path:process.env.MOON_SCREENSHOTS+'/moon-card.png',fullPage:true});await d.saveAs(process.env.MOON_SCREENSHOTS+'/moon-qr.png');}
 const manifest=await(await fetch(bases[1]+'/manifest.webmanifest')).json();assert.match(manifest.name,/MOON/);assert.equal(manifest.start_url,'/');assert.equal(manifest.icons[1].sizes,'192x192');
 const a=await browser.newContext();await a.request.post(bases[1]+'/api/login/staff',{data:{username:'admin_moon_local',password:'Moon-admin-local928!'}});const ap=await a.newPage();await ap.goto(bases[1]+'/#admin');await ap.waitForSelector('#export-customers');await ap.fill('#customer-search input',phone);await ap.click('#customer-search button');await ap.waitForFunction(()=>document.querySelector('tbody')?.innerText.includes('Renace es mi nombre'));
 const promise=ap.waitForEvent('download');await ap.click('#export-customers');const dl=await promise,bytes=[];for await(const chunk of await dl.createReadStream())bytes.push(chunk);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.concat(bytes));assert.equal(wb.worksheets[0].getCell('E5').value,8);assert.equal(wb.worksheets[0].getCell('A5').value,'Renace es mi nombre');assert.match(wb.worksheets[0].getCell('A1').value,/MOON/);
 assert.deepEqual(errors,[]);
});
