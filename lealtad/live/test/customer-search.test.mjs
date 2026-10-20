import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,invoke,slugs,server} from './reward-choice-fixture.mjs';

async function setup(t){
 const db=schema();t.after(()=>db.close());const tenants=[];
 for(const slug of slugs){
  const f=await fixture(db,slug);tenants.push(f);
  db.prepare('UPDATE users SET name=?,phone=? WHERE id=?').run('Ana Solis','7111111111',f.customer.data.user.id);
  const fixedCard='TEST-'+slug.toUpperCase()+'-ZERO';
  db.prepare('UPDATE loyalty_cards SET id=? WHERE id=?').run(fixedCard,f.card.id);f.card.id=fixedCard;
  f.phone='7111111111';f.people=[{id:f.customer.data.user.id,card:f.card.id,name:'Ana Solis',phone:f.phone}];
  for(const [i,name,phone] of [[1,'Bruno Perez','7222222222'],[2,'Clara Gómez','7333333333']]){
   const id=`fictional-${slug}-${i}`,card=`TEST-${slug.toUpperCase()}-${i}`;
   db.prepare(`INSERT INTO users(id,business_id,role,name,phone,secret_hash,secret_salt) VALUES(?,?,'customer',?,?,'fixture-not-a-credential','fixture-not-a-credential')`).run(id,'business_'+slug,name,phone);
   db.prepare('INSERT INTO loyalty_cards(id,business_id,customer_id,qr_token) VALUES(?,?,?,?)').run(card,'business_'+slug,id,'fictional-token-'+id);
   f.people.push({id,card,name,phone});
  }
 }
 return{db,tenants};
}

for(const slug of slugs)test(slug+': real admin and counter search UI uses the filtered response on mobile and desktop',async t=>{
 const {db,tenants}=await setup(t),f=tenants.find(x=>x.slug===slug),{app,base}=await server(db,slug);
 const browser=await chromium.launch({channel:'msedge',headless:true});
 t.after(async()=>{await browser.close();app.close();});
 const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const [name,value]=f.admin.cookie.split('=');await context.addCookies([{name,value,url:base}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const output='C:/Users/ferha/Documents/Codex/outputs/customer-search-audit-2026-10-19';await mkdir(output,{recursive:true});
 for(const [width,height] of [[360,800],[390,844],[412,915],[430,932],[1366,768]]){
  await page.setViewportSize({width,height});await page.goto(base+'/#admin');await page.waitForSelector('#customer-search');
  for(const [q,expected] of [['Ana',1],['NoSuchFictionalCustomer',0],['2222',1],['Gómez',1]]){
   await page.fill('#customer-search input',q);
   const response=page.waitForResponse(r=>r.url().includes('/api/admin/dashboard?')&&new URL(r.url()).searchParams.get('q')===q);
   await page.click('#customer-search button');assert.equal((await response).status(),200);await page.waitForSelector('#customer-search');
   assert.equal(await page.locator('.adjust-stamps').count(),expected,q);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  if(width===390){await page.waitForFunction(()=>!document.querySelector('#toast')?.textContent);await page.screenshot({path:output+'/'+slug+'-admin-search.png',fullPage:true});}
  await page.goto(base+'/#empleado');await page.waitForSelector('#lookup');
  await page.fill('#lookup input','NoSuchFictionalCustomer');const missing=page.waitForResponse(r=>r.url().includes('/api/staff/card?'));
  await page.click('#lookup button');assert.equal((await missing).status(),404);
  await page.fill('#lookup input',f.phone);const found=page.waitForResponse(r=>r.url().includes('/api/staff/card?')&&r.status()===200);
  await page.click('#lookup button');assert.equal((await found).status(),200);
  await page.waitForFunction(()=>document.querySelector('#staff-card')?.textContent.includes('Ana Solis'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390){await page.waitForFunction(()=>!document.querySelector('#toast')?.textContent);await page.screenshot({path:output+'/'+slug+'-counter-search.png',fullPage:true});}
 }
 assert.deepEqual(errors,[]);
});
const dashboard=(db,f,q='',extra='')=>invoke(db,f.slug,'/api/admin/dashboard?q='+encodeURIComponent(q)+extra,{cookie:f.admin.cookie});
const lookup=(db,f,value,cookie=f.staff.cookie)=>invoke(db,f.slug,'/api/staff/card?value='+encodeURIComponent(value),{cookie});

for(const slug of slugs){
 test(slug+': customer search names, surnames, alphabetic misses, phone fragments and literal input',async t=>{
  const {db,tenants}=await setup(t),f=tenants.find(x=>x.slug===slug);
  const cases=[['',[0,1,2]],['  ',[0,1,2]],['Ana',[0]],['aNa',[0]],['  Ana  ',[0]],['Solis',[0]],['oli',[0]],['Perez',[1]],['Gómez',[2]],['Clara Gómez',[2]],['Cl',[2]],['NoSuchFictionalCustomer',[]],['Cliente 2222',[]],['7111111111',[0]],['+52 (711) 111-1111',[0]],['2222',[1]],['7999999999',[]],['%',[]],['_',[]],["' OR 1=1 --",[]]];
  for(const [q,indices] of cases){
   const r=await dashboard(db,f,q);assert.equal(r.status,200,q);
   assert.equal(r.data.customerPage.total,indices.length,q+' total');
   assert.deepEqual(r.data.customers.map(c=>c.customer_id).sort(),indices.map(i=>f.people[i].id).sort(),q+' rows');
  }
  const card=await dashboard(db,f,f.people[1].card.toLowerCase());assert.deepEqual(card.data.customers.map(c=>c.id),[f.people[1].card]);
  for(const page of [1,2,3,4]){const r=await dashboard(db,f,'','&perPage=1&page='+page);assert.equal(r.data.customerPage.total,3);assert.equal(r.data.customers.length,page<4?1:0);}
  // SQL lower() preserves the existing accented-letter semantics; no new accent folding.
  assert.equal((await dashboard(db,f,'Gomez')).data.customerPage.total,0);
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(f.people[1].id);
  db.prepare("UPDATE users SET deleted_at='2026-01-01' WHERE id=?").run(f.people[2].id);
  assert.equal((await dashboard(db,f,'Perez')).data.customerPage.total,0);
  assert.equal((await dashboard(db,f,'Gómez')).data.customerPage.total,0);
 });

 test(slug+': search permissions and all foreign tenants stay isolated',async t=>{
  const {db,tenants}=await setup(t),f=tenants.find(x=>x.slug===slug);
  for(const [cookie,status] of [[undefined,401],[f.customer.cookie,403],[f.staff.cookie,403],...tenants.filter(x=>x!==f).map(x=>[x.admin.cookie,401])]){
   const r=await invoke(db,slug,'/api/admin/dashboard?q=Ana',{cookie});assert.equal(r.status,status);assert.equal(r.data.customers,undefined);
  }
  for(const other of tenants.filter(x=>x!==f)){
   const r=await dashboard(db,f,'Ana','&business_id=business_'+other.slug);assert.deepEqual(r.data.customers.map(c=>c.customer_id),[f.people[0].id]);
   assert.equal((await dashboard(db,f,other.people[1].card)).data.customerPage.total,0);
  }
 });

 test(slug+': counter exact phone/card/QR lookup does not perform alphabetical or partial search',async t=>{
  const {db,tenants}=await setup(t),f=tenants.find(x=>x.slug===slug);
  for(const q of ['Ana','Solis','NoSuchFictionalCustomer','2222','TEST-'])assert.equal((await lookup(db,f,q)).status,404,q);
  assert.equal((await lookup(db,f,'  ')).status,400);
  for(const q of [f.phone,'+52 (711) 111-1111',f.card.id,f.card.qrValue]){
   for(const cookie of [f.staff.cookie,f.admin.cookie]){const r=await lookup(db,f,q,cookie);assert.equal(r.status,200);assert.equal(r.data.card.customerId,f.people[0].id);}
  }
  for(const [cookie,status] of [[undefined,401],[f.customer.cookie,403]])assert.equal((await invoke(db,slug,'/api/staff/card?value='+f.phone,{cookie})).status,status);
  for(const other of tenants.filter(x=>x!==f)){
   for(const q of [other.card.id,other.card.qrValue,other.people[1].card])assert.equal((await lookup(db,f,q)).status,404);
   assert.equal((await lookup(db,f,f.phone,other.staff.cookie)).status,401);
  }
 });

 test(slug+': inconsistent cross-business card references fail closed in both search endpoints',async t=>{
  const {db,tenants}=await setup(t),f=tenants.find(x=>x.slug===slug),other=tenants.find(x=>x!==f);
  // A foreign event with a forged card reference must not contribute a timestamp.
  db.prepare(`INSERT INTO loyalty_events(id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at)
    VALUES(?,?,?,?,?,'stamp','2026-01-01','2026-01-01T18:00:00Z')`).run('fictional-foreign-event','business_'+other.slug,f.card.id,other.customer.data.user.id,other.staff.data.user.id);
  assert.equal((await dashboard(db,f,'Ana')).data.customers[0].last_stamp_at,null);
  assert.equal((await lookup(db,f,f.card.id)).data.card.lastStampAt,null);
  // Deliberately corrupt ONLY the in-memory fixture: existing simple FKs allow this.
  // This is not an API-supported operation and does not assert production corruption.
  db.prepare('UPDATE loyalty_cards SET business_id=? WHERE id=?').run('business_'+other.slug,f.card.id);
  assert.equal((await dashboard(db,f,'Ana')).data.customerPage.total,0);
  assert.equal((await lookup(db,other,f.card.id)).status,404);
 });
}
