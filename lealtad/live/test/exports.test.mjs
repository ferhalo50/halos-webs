import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:8787';
async function req(path,cookie,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
test('employee PIN reuses reset, revokes sessions and appears with actor in full export',async()=>{
 const admin=await req('/api/login/staff',null,{username:'admin_local',password:'Admin-test-928!'}),staff=await req('/api/login/staff',null,{username:'mostrador_local',password:'Staff-test-928!'});
 const phone='667'+String(Date.now()).slice(-7),c=await req('/api/register',null,{phone,name:'=SUM(1,2)',pin:'4826'});
 assert.equal(c.status,201);const card=(await req('/api/card',c.cookie)).data.card;assert.equal(card.customerId,c.data.user.id);
 assert.equal((await req('/api/admin/export/clients',staff.cookie)).status,403);
 assert.equal((await req(`/api/staff/customers/${staff.data.user.id}/pin`,staff.cookie,{},'PATCH')).status,404);
 const reset=await req(`/api/staff/customers/${c.data.user.id}/pin`,staff.cookie,{},'PATCH');assert.equal(reset.status,200);assert.match(reset.data.customer.temporaryPin,/^\d{6}$/);
 assert.equal((await req('/api/card',c.cookie)).status,401);
 const login=await req('/api/login/customer',null,{phone,pin:reset.data.customer.temporaryPin});assert.equal(login.data.user.mustChangeSecret,true);assert.equal((await req('/api/card',login.cookie)).status,403);
 assert.equal((await req('/api/account/secret',login.cookie,{currentSecret:reset.data.customer.temporaryPin,newSecret:'8372'})).status,200);
 const activity=await req('/api/admin/export/activity',admin.cookie);let offset=activity.data.nextOffset;while(offset!==null){const next=await req('/api/admin/export/activity?offset='+offset,admin.cookie);activity.data.rows.push(...next.data.rows);offset=next.data.nextOffset;}assert.equal(activity.status,200);assert.ok(activity.data.rows.some(r=>r.event_type==='pin_reset'&&r.customer==='=SUM(1,2)'&&r.employee===staff.data.user.name));
 const clients=await req('/api/admin/export/clients',admin.cookie);offset=clients.data.nextOffset;while(offset!==null){const next=await req('/api/admin/export/clients?offset='+offset,admin.cookie);clients.data.rows.push(...next.data.rows);offset=next.data.nextOffset;}assert.equal(clients.status,200);assert.ok(clients.data.rows.some(r=>r.id===card.id));assert.doesNotMatch(JSON.stringify(clients.data),/secret_hash|secret_salt|qr_token|token_hash|temporaryPin/);
});
test('actual browser XLSX worker: months, empty month, dates, strings and professional styles',async t=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());const p=await browser.newPage();await p.goto(base);
 async function workbook(kind,rows){const data=await p.evaluate(async ({kind,rows})=>{const worker=new Worker('/assets/xlsx-worker.js');try{return await new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(Array.from(new Uint8Array(data.buffer)));worker.onerror=e=>reject(Error(e.message));worker.postMessage({kind,rows,business:{name:'Negocio prueba',timezone:'America/Tijuana',reward_goal:9},generatedAt:'2026-10-01T08:00:00Z'});});}finally{worker.terminate();}},{kind,rows});const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(data));return wb;}
 const wb=await workbook('clients',['=1+1','+123','-123','@SUM(A1)'].map(name=>({name,phone:'0001234567',id:'CARD',stamps:2,redeemed_count:1,created_at:'2026-08-21T08:00:00Z'}))),s=wb.worksheets[0];
 assert.equal(s.getCell('A5').value,'=1+1');assert.equal(s.getCell('B5').value,'0001234567');assert.equal(s.getCell('D5').value,2);assert.ok(s.getCell('I5').value instanceof Date);assert.equal(s.getCell('A4').font.bold,true);assert.equal(s.getCell('A5').border.bottom.style,'thin');assert.equal(s.views[0].ySplit,4);assert.ok(s.autoFilter);for(let i=5;i<=8;i++)assert.equal(s.getCell('A'+i).type,ExcelJS.ValueType.String);
 const events=await workbook('activity',[{created_at:'2026-08-01T08:00:00Z',event_type:'stamp',customer:'=1+1',reason:'@SUM(A1)',employee:'Staff'}]);assert.deepEqual(events.worksheets.map(s=>s.name),['Agosto 2026','Septiembre 2026','Octubre 2026']);assert.equal(events.worksheets[1].rowCount,4);assert.equal(events.worksheets[0].getCell('C5').value,'=1+1');assert.ok(events.worksheets[0].getCell('B5').value instanceof Date);assert.equal((await workbook('activity',[])).worksheets[0].name,'Octubre 2026');
});
