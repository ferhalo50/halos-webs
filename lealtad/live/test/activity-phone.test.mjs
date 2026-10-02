import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {activitySource} from '../worker/activity.js';

test('Activity resolves current customer phone by ID and tenant, including absent and administrative targets',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE businesses(id TEXT,reward_goal INTEGER); CREATE TABLE reward_choice_operations(id TEXT,created_at TEXT,decision TEXT,card_id TEXT,customer_id TEXT,employee_id TEXT,business_id TEXT,before_stamps INTEGER,before_rewards INTEGER,before_choices INTEGER);
 CREATE TABLE users(id TEXT,business_id TEXT,role TEXT,name TEXT,phone TEXT);
 CREATE TABLE loyalty_cards(id TEXT,customer_id TEXT,business_id TEXT);
 CREATE TABLE loyalty_events(id TEXT,created_at TEXT,event_type TEXT,voided INTEGER,card_id TEXT,customer_id TEXT,employee_id TEXT,business_id TEXT,metadata TEXT,quantity INTEGER);
 CREATE TABLE admin_audit_log(id TEXT,created_at TEXT,action TEXT,metadata TEXT,target_user_id TEXT,actor_id TEXT,admin_id TEXT,business_id TEXT);
 CREATE TABLE stamp_adjustments(id TEXT,created_at TEXT,after_stamps INTEGER,before_stamps INTEGER,card_id TEXT,customer_id TEXT,admin_id TEXT,business_id TEXT,reason TEXT);
 INSERT INTO users VALUES ('c1','a','customer','Same name','0001234567'),('c2','b','customer','Same name','9991234567'),('staff','a','admin','Admin',NULL);
 INSERT INTO loyalty_events VALUES ('purchase','2026-10-01','stamp',0,'card','c1','staff','a','{}',4),('foreign','2026-10-01','stamp',0,'other','c2','staff','a','{}',1);
 INSERT INTO admin_audit_log VALUES ('team','2026-10-01','employee_updated','{}','staff','staff','staff','a'),('missing','2026-10-01','employee_deleted','{}','gone','staff','staff','a');
 INSERT INTO stamp_adjustments VALUES ('adjust','2026-10-01',2,1,'card','c1','staff','a','Reason');`);
 const rows=()=>db.prepare(activitySource()).all('a','a','a','a'),byId=id=>rows().find(r=>r.id===id);
 assert.equal(byId('purchase').customer_phone,'0001234567');assert.equal(byId('adjust').customer_phone,'0001234567');
 for(const id of ['foreign','team','missing'])assert.equal(byId(id).customer_phone,null);
 db.exec("UPDATE users SET phone='0007654321',name='New name' WHERE id='c1'");
 assert.equal(byId('purchase').customer_phone,'0007654321');assert.equal(byId('purchase').customer,'New name');
 db.exec("UPDATE users SET phone=NULL,name='Cliente eliminado' WHERE id='c1'");assert.equal(byId('purchase').customer_phone,null);
 }finally{db.close();}
});

test('Four tenants expose associated activity phones; mobile and real XLSX preserve columns, strings and ES/EN',async t=>{
 const cases=[['renace',8787,'admin_local','Admin-test-928!','mostrador_local','Staff-test-928!'],['mooncoffee',8788,'admin_moon_local','Moon-admin-local928!','moon_staff_local','Moon-staff-local928!'],['santofe',8789,'admin_santofe_local','Santofe-admin-local928!','santofe_staff_local','Santofe-staff-local928!'],['vainillacoffee',8790,'admin_vainilla_local','Vainilla-admin-local928!','vainilla_staff_local','Vainilla-staff-local928!']];
 const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());let serial=0;
 for(const [slug,port,adminName,adminPass,staffName,staffPass] of cases){
 const base=`http://127.0.0.1:${port}`,request=async(path,cookie,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,`${slug} ${path}: ${r.status}`);return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const phone='000'+String(Date.now()+serial++).slice(-7),name='Actividad celular local '+phone+' '+slug;
 const customer=await request('/api/register',null,{phone,name,pin:'4826'}),card=(await request('/api/card',customer.cookie)).data.card;
 const staff=await request('/api/login/staff',null,{username:staffName,password:staffPass}),admin=await request('/api/login/staff',null,{username:adminName,password:adminPass});
 await request('/api/staff/stamp',staff.cookie,{cardId:card.id,quantity:1,...(card.rewardVersion!==undefined?{expectedVersion:card.rewardVersion,operationId:crypto.randomUUID()}: {})});
 const dashboard=(await request('/api/admin/dashboard?eventCustomer='+encodeURIComponent(name),admin.cookie)).data;
 assert.equal(dashboard.events.length,1);assert.equal(dashboard.events[0].customer_phone,phone);assert.equal(dashboard.events[0].customer,name);
 const exported=(await request('/api/admin/export/activity',admin.cookie)).data;let offset=exported.nextOffset;while(offset!==null){const next=(await request('/api/admin/export/activity?offset='+offset,admin.cookie)).data;exported.rows.push(...next.rows);offset=next.nextOffset;}
 assert.ok(exported.rows.some(r=>r.customer===name&&r.customer_phone===phone));
 assert.ok(exported.rows.every(r=>!r.customer?.startsWith('Actividad celular local ')||r.customer.endsWith(slug)));
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addCookies([{name:admin.cookie.split('=')[0],value:admin.cookie.slice(admin.cookie.indexOf('=')+1),url:base}]);
 const page=await context.newPage();await page.goto(base+'/#admin');
 const row=page.locator('.activity-table tr').filter({hasText:name});await row.waitFor();await page.locator('#app-loader').waitFor({state:'detached'});assert.match(await row.innerText(),new RegExp(phone.slice(0,3)+' '+phone.slice(3,6)+' '+phone.slice(6)));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(process.env.ACTIVITY_PHONE_EVIDENCE&&['santofe','vainillacoffee'].includes(slug)){mkdirSync(process.env.ACTIVITY_PHONE_EVIDENCE,{recursive:true});await row.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.ACTIVITY_PHONE_EVIDENCE+'/'+slug+'-activity-mobile.png'});}
 if(slug==='vainillacoffee')for(const locale of ['es','en']){
 const bytes=await page.evaluate(async({rows,business,locale})=>{const worker=new Worker('/assets/xlsx-worker.js');try{return await new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(Array.from(new Uint8Array(data.buffer)));worker.onerror=e=>reject(Error(e.message));worker.postMessage({kind:'activity',rows,business,locale,generatedAt:new Date().toISOString()});});}finally{worker.terminate();}},{rows:[dashboard.events[0],{created_at:dashboard.events[0].created_at,event_type:'employee_updated',customer:'Team',customer_phone:null,employee:'Admin',reason:''}],business:dashboard.business,locale});
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(bytes));const ws=wb.worksheets.find(w=>w.rowCount>4);
 assert.deepEqual(ws.getRow(4).values.slice(1),['Fecha','Hora','Cliente',locale==='es'?'Celular del cliente':'Customer phone','Movimiento','Motivo','Registrado por']);
 assert.equal(ws.getCell('D5').value,phone);assert.equal(ws.getCell('D5').type,ExcelJS.ValueType.String);assert.equal(ws.getCell('C5').value,name);assert.equal(ws.getCell('G5').value,dashboard.events[0].employee);assert.equal(ws.getCell('D6').value,'');
 if(process.env.ACTIVITY_PHONE_EVIDENCE&&locale==='es'){writeFileSync(process.env.ACTIVITY_PHONE_EVIDENCE+'/activity-phone.xlsx',Buffer.from(bytes));writeFileSync(process.env.ACTIVITY_PHONE_EVIDENCE+'/xlsx-verification.json',JSON.stringify({headers:ws.getRow(4).values.slice(1),customer:ws.getCell('C5').value,phone:ws.getCell('D5').value,phoneType:'String'},null,2));}
 }
 await context.close();
 }
});
