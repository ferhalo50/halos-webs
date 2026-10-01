import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import ExcelJS from 'exceljs';
import { resolveTenant } from '../worker/tenants.js';

const renace='http://127.0.0.1:8787';
const moon='http://127.0.0.1:8788';
const santofe='http://127.0.0.1:8789';
const credentials={
  admin:{username:'admin_santofe_local',password:'Santofe-admin-local928!'},
  staff:{username:'santofe_staff_local',password:'Santofe-staff-local928!'}
};

async function request(base,path,{cookie,body,method=body?'POST':'GET',headers={}}={}){
  if(base===santofe&&['/api/staff/stamp','/api/staff/redeem'].includes(path)&&body&&body.expectedVersion===undefined){const snapshot=await request(base,'/api/staff/card?value='+body.cardId,{cookie});if(snapshot.status===200)body={...body,expectedVersion:snapshot.data.card.rewardVersion,operationId:crypto.randomUUID()};}
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}

async function exportAll(kind,cookie){
  const rows=[];let offset=0;
  do{
    const result=await request(santofe,`/api/admin/export/${kind}?offset=${offset}`,{cookie});
    assert.equal(result.status,200);rows.push(...result.data.rows);offset=result.data.nextOffset;
  }while(offset!==null);
  return rows;
}

test('Santofé is resolved only from its approved hostname',()=>{
  assert.equal(resolveTenant(new URL('https://santofe.haloswebs.com/'),{}).slug,'santofe');
  assert.equal(resolveTenant(new URL('https://santofe.haloswebs.com/?business=renace'),{}).slug,'santofe');
  assert.equal(resolveTenant(new URL('http://127.0.0.1:8789/'),{DEV_TENANT:'santofe'}).slug,'santofe');
});

test('Santofé: isolated accounts, multiple stamps per purchase and reward lifecycle',async()=>{
  const setup=await request(santofe,'/api/setup',{headers:{'x-bootstrap-secret':'local-test-bootstrap'},body:{adminUsername:credentials.admin.username,adminPassword:credentials.admin.password,employeeUsername:credentials.staff.username,employeePassword:credentials.staff.password}});
  assert.ok([201,409].includes(setup.status));
  const admin=await request(santofe,'/api/login/staff',{body:credentials.admin});
  const staff=await request(santofe,'/api/login/staff',{body:credentials.staff});
  assert.equal(admin.status,200);assert.equal(staff.status,200);

  const phone='663'+String(Date.now()).slice(-7);
  const customer=await request(santofe,'/api/register',{body:{name:'Cliente Santofé',phone,pin:'4826'}});
  assert.equal(customer.status,201);
  const card=(await request(santofe,'/api/card',{cookie:customer.cookie})).data.card;
  assert.equal(card.goal,10);assert.equal(card.stampPolicy,'per_item');assert.equal(card.maxStampsPerTransaction,99);
  assert.equal(card.stampStyle,'santofe');assert.ok(card.qrValue.startsWith('santofe:'));

  const samePhoneRenace=await request(renace,'/api/register',{body:{name:'Mismo teléfono otra cafetería',phone,pin:'4826'}});
  assert.equal(samePhoneRenace.status,201);
  const renaceCard=(await request(renace,'/api/card',{cookie:samePhoneRenace.cookie})).data.card;
  assert.ok(renaceCard.qrValue.startsWith('renace:'));
  const moonSetup=await request(moon,'/api/setup',{headers:{'x-bootstrap-secret':'local-test-bootstrap'},body:{adminUsername:'admin_moon_local',adminPassword:'Moon-admin-local928!',employeeUsername:'moon_staff_local',employeePassword:'Moon-staff-local928!'}});
  assert.ok([201,409].includes(moonSetup.status));
  const samePhoneMoon=await request(moon,'/api/register',{body:{name:'Mismo teléfono en MOON',phone,pin:'4826'}});
  assert.equal(samePhoneMoon.status,201);
  const moonCard=(await request(moon,'/api/card',{cookie:samePhoneMoon.cookie})).data.card;
  assert.ok(moonCard.qrValue.startsWith('mooncoffee:'));
  assert.equal((await request(renace,'/api/me',{cookie:customer.cookie})).status,401);
  assert.equal((await request(moon,'/api/me',{cookie:customer.cookie})).status,401);
  assert.equal((await request(santofe,'/api/me',{cookie:samePhoneRenace.cookie})).status,401);
  assert.equal((await request(santofe,'/api/me',{cookie:samePhoneMoon.cookie})).status,401);
  assert.equal((await request(santofe,'/api/staff/card?value='+encodeURIComponent(renaceCard.qrValue),{cookie:staff.cookie})).status,404);
  assert.equal((await request(santofe,'/api/staff/card?value='+encodeURIComponent(moonCard.qrValue),{cookie:staff.cookie})).status,404);
  const renaceStaff=await request(renace,'/api/login/staff',{body:{username:'mostrador_local',password:'Staff-test-928!'}});
  const moonStaff=await request(moon,'/api/login/staff',{body:{username:'moon_staff_local',password:'Moon-staff-local928!'}});
  assert.equal((await request(renace,'/api/staff/stamp',{cookie:renaceStaff.cookie,body:{cardId:renaceCard.id,quantity:2}})).status,400);
  assert.equal((await request(moon,'/api/staff/stamp',{cookie:moonStaff.cookie,body:{cardId:moonCard.id,quantity:2}})).status,400);

  let result=await request(santofe,'/api/staff/stamp',{cookie:staff.cookie,body:{cardId:card.id,quantity:1}});
  assert.equal(result.status,200);assert.equal(result.data.card.stamps,1);assert.equal(result.data.operation.paidCoffees,1);
  result=await request(santofe,'/api/staff/stamp',{cookie:staff.cookie,body:{cardId:card.id,quantity:3}});
  assert.equal(result.status,200);assert.equal(result.data.card.stamps,4);
  result=await request(santofe,'/api/staff/stamp',{cookie:staff.cookie,body:{cardId:card.id,quantity:6}});
  assert.equal(result.status,200);assert.equal(result.data.card.stamps,0);assert.ok(result.data.card.rewardsPending>=1);
  result=await request(santofe,'/api/staff/stamp',{cookie:staff.cookie,body:{cardId:card.id,quantity:1}});
  assert.equal(result.status,200);assert.equal(result.data.card.stamps,1);assert.equal(result.data.card.redeemed,0);
  assert.equal(result.data.operation.paidCoffees,1);assert.equal(result.data.operation.freeCoffees,0);assert.equal(result.data.operation.rewardsGenerated,0);
  result=await request(santofe,'/api/staff/stamp',{cookie:staff.cookie,body:{cardId:card.id,quantity:10}});
  assert.equal(result.status,200);assert.equal(result.data.card.stamps,1);assert.equal(result.data.card.rewardsPending,2);

  const crossingCases=[
    {before:8,order:3,after:1,paid:3,label:'8 más 3'},
    {before:8,order:4,after:2,paid:4,label:'8 más 4'},
    {before:9,order:2,after:1,paid:2,label:'9 más 2'}
  ];
  let caseIndex=0;
  for(const scenario of crossingCases){
    const casePhone=`667${String(Number(String(Date.now()).slice(-7))+caseIndex++).padStart(7,'0').slice(-7)}`;
    const account=await request(santofe,'/api/register',{body:{name:`Cruce ${scenario.label}`,phone:casePhone,pin:'4826'}});assert.equal(account.status,201);
    const caseCard=(await request(santofe,'/api/card',{cookie:account.cookie})).data.card;
    const prepared=await request(santofe,'/api/staff/stamp',{cookie:staff.cookie,body:{cardId:caseCard.id,quantity:scenario.before}});assert.equal(prepared.data.card.stamps,scenario.before);
    const crossed=await request(santofe,'/api/staff/stamp',{cookie:staff.cookie,body:{cardId:caseCard.id,quantity:scenario.order}});
    assert.equal(crossed.status,200);assert.equal(crossed.data.card.stamps,scenario.after);assert.equal(crossed.data.card.redeemed,0);assert.equal(crossed.data.card.rewardsPending,1);
    assert.equal(crossed.data.operation.paidCoffees,scenario.paid);assert.equal(crossed.data.operation.freeCoffees,0);assert.equal(crossed.data.operation.stampsAfter,scenario.after);assert.equal(crossed.data.operation.rewardsGenerated,1);
  }

  const dashboard=await request(santofe,'/api/admin/dashboard?q='+phone,{cookie:admin.cookie});
  assert.equal(dashboard.status,200);assert.equal(dashboard.data.business.stamp_policy,'per_item');
  assert.equal(dashboard.data.customers.length,1);assert.equal(dashboard.data.customers[0].id,card.id);
  assert.ok(Number(dashboard.data.metrics.stamps_today)>=20);
  const activity=await exportAll('activity',admin.cookie);
  const quantities=activity.filter(item=>item.card_id===card.id&&item.event_type==='stamp').map(item=>Number(item.quantity));
  assert.deepEqual(quantities.sort((a,b)=>a-b),[1,1,3,6,10]);
  assert.ok(activity.some(item=>item.card_id===card.id&&item.event_type==='stamp'&&/recompensas generadas: 1/.test(item.reason)));assert.ok(!activity.some(item=>item.card_id===card.id&&item.event_type==='redeem'));
  const clients=await exportAll('clients',admin.cookie);
  assert.ok(clients.some(item=>item.id===card.id));assert.ok(!clients.some(item=>item.id===renaceCard.id));

  const suffix=String(Date.now()).slice(-6),newEmployee=await request(santofe,'/api/admin/employees',{cookie:admin.cookie,body:{name:'Apoyo Santofé',username:`apoyo_${suffix}`,password:'Apoyo-local-928!'}});
  assert.equal(newEmployee.status,201);
  assert.equal((await request(santofe,'/api/login/staff',{body:{username:`apoyo_${suffix}`,password:'Apoyo-local-928!'}})).status,200);
});

test('Santofé responsive UI carries its own identity and per-coffee controls',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const phone='661'+String(Date.now()).slice(-7);
  const registration=await context.request.post(santofe+'/api/register',{data:{name:'Prueba visual Santofé',phone,pin:'4826'}});
  assert.equal(registration.status(),201);
  await page.goto(santofe+'/#tarjeta');await page.waitForSelector('#app-loader',{state:'detached'});await page.waitForSelector('#qr svg',{state:'attached'});
  assert.equal(await page.locator('.santofe-flip-card').count(),1);
  assert.equal(await page.locator('.santofe-card-pattern').count(),1);
  assert.equal(await page.locator('.santofe-card-pattern span').count(),0);
  assert.ok(await page.locator('.santofe-card-pattern').evaluate(node=>getComputedStyle(node).backgroundImage.includes('logo-santofe.png')));
  assert.ok((await page.locator('.santofe-card-head .renace-logo').getAttribute('src')).endsWith('/assets/santofe/logo-santofe.png'));
  assert.ok((await page.locator('.santofe-back-brand img').getAttribute('src')).endsWith('/assets/santofe/logo-santofe.png'));
  assert.equal(await page.locator('#santofe-flip-card').getAttribute('aria-pressed'),'false');
  await page.click('#flip-card');assert.equal(await page.locator('#santofe-flip-card').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#flip-card').innerText(),/Ver frente/);
  await page.locator('#santofe-flip-card').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#santofe-flip-card').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('.stamps .stamp').count(),10);
  assert.equal(await page.locator('.stamp-picker').count(),0);
  assert.equal(await page.locator('.social a').count(),5);
  assert.deepEqual(await page.locator('.social a').evaluateAll(nodes=>nodes.map(node=>node.href)),[
    'https://www.facebook.com/profile.php?id=61578395980108',
    'https://www.instagram.com/santofe_mx/',
    'https://www.tiktok.com/@santofecafe',
    'https://maps.app.goo.gl/rdBsjChh92f7uXsj9',
    'https://maps.app.goo.gl/1hbD3RYi4vcQUjVB8'
  ]);
  assert.match(await page.locator('body').innerText(),/Pet friendly/i);
  assert.doesNotMatch(await page.locator('body').innerText(),/Renace|MOON Coffee/i);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight*1.3));
  await page.click('#role-guide');assert.match(await page.locator('dialog').innerText(),/X\/10/);assert.match(await page.locator('dialog').innerText(),/cada café/i);await page.keyboard.press('Escape');

  const manifest=await(await fetch(santofe+'/manifest.webmanifest')).json();
  assert.match(manifest.name,/Santofé/);assert.ok(manifest.icons.every(icon=>icon.src.includes('/assets/santofe/')));
  const staffContext=await browser.newContext({viewport:{width:390,height:844}});
  const staffLogin=await request(santofe,'/api/login/staff',{body:credentials.staff});assert.equal(staffLogin.status,200);const [staffCookieName,staffCookieValue]=staffLogin.cookie.split('=');await staffContext.addCookies([{name:staffCookieName,value:staffCookieValue,url:santofe}]);
  const cardId=(await page.locator('code').innerText()).trim();
  const prepared=await staffContext.request.post(santofe+'/api/staff/stamp',{data:{cardId,quantity:8,expectedVersion:0,operationId:crypto.randomUUID()}});assert.equal(prepared.status(),200);
  const staffPage=await staffContext.newPage();await staffPage.goto(santofe+'/#empleado');await staffPage.waitForSelector('#lookup');
  await staffPage.fill('#lookup input',cardId);await staffPage.click('#lookup button');await staffPage.waitForSelector('#stamp-quantity');
  assert.match(await staffPage.locator('#stamp-operation').innerText(),/Progreso resultante: 9\/10/);
  await staffPage.click('#stamp-plus');await staffPage.click('#stamp-plus');
  assert.equal(await staffPage.locator('#stamp-quantity').innerText(),'3');
  const operationText=await staffPage.locator('#stamp-operation').innerText();assert.match(operationText,/Cafés pagados: 3/i);assert.match(operationText,/Recompensas generadas: 1/i);assert.match(operationText,/Progreso resultante: 1\/10/i);
  assert.ok(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const adminContext=await browser.newContext({viewport:{width:1280,height:900}});
  const adminLogin=await request(santofe,'/api/login/staff',{body:credentials.admin});assert.equal(adminLogin.status,200);const [adminCookieName,adminCookieValue]=adminLogin.cookie.split('=');await adminContext.addCookies([{name:adminCookieName,value:adminCookieValue,url:santofe}]);
  const adminPage=await adminContext.newPage();await adminPage.goto(santofe+'/#admin');await adminPage.waitForSelector('.stats');
  const adminText=await adminPage.locator('body').innerText();assert.match(adminText,/COMUNIDAD SANTOFÉ/);assert.match(adminText,/8\/10/);assert.doesNotMatch(adminText,/COMUNIDAD RENACE|8\/9/);
  const download=adminPage.waitForEvent('download');await adminPage.click('#export-all-customers');const file=await download,parts=[];for await(const chunk of await file.createReadStream())parts.push(chunk);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.concat(parts));const sheet=workbook.worksheets[0];assert.equal(sheet.getCell('A1').value,'Santofé');assert.ok(sheet.getColumn(2).values.some(value=>String(value)===phone));
  assert.deepEqual(errors,[]);
});
