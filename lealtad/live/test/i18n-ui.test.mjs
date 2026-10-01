import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const tenants=[
  {base:'http://127.0.0.1:8787',name:'Renace',admin:['admin_local','Admin-test-928!'],staff:['mostrador_local','Staff-test-928!']},
  {base:'http://127.0.0.1:8788',name:'MOON',admin:['admin_moon_local','Moon-admin-local928!'],staff:['moon_staff_local','Moon-staff-local928!']},
  {base:'http://127.0.0.1:8789',name:'Santofé',admin:['admin_santofe_local','Santofe-admin-local928!'],staff:['santofe_staff_local','Santofe-staff-local928!']}
];

async function setup(tenant){
  const response=await fetch(tenant.base+'/api/setup',{method:'POST',headers:{'content-type':'application/json','x-bootstrap-secret':'local-test-bootstrap'},body:JSON.stringify({adminUsername:tenant.admin[0],adminPassword:tenant.admin[1],employeeUsername:tenant.staff[0],employeePassword:tenant.staff[1]})});
  assert.ok([201,409].includes(response.status),`${tenant.name} setup: ${response.status}`);
}

test('shared bilingual UI persists and install controls are available to every role',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  for(const tenant of tenants){
    await setup(tenant);
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(8000);
    await page.goto(tenant.base+'/');await page.waitForSelector('#app-loader',{state:'detached'});
    assert.equal(await page.getAttribute('html','lang'),'es');
    assert.equal(await page.locator('[data-language-toggle]').count(),1);
    assert.equal(await page.locator('[data-language-toggle]').getAttribute('data-language-current'),'es');
    await page.click('[data-language-toggle]');
    assert.equal(await page.getAttribute('html','lang'),'en');
    assert.match(await page.locator('#primary-navigation').innerText(),/Team access/);
    await page.reload();await page.waitForSelector('#app-loader',{state:'detached'});
    assert.equal(await page.getAttribute('html','lang'),'en');
    await page.goto(tenant.base+'/#equipo');await page.waitForSelector('#auth-form');
    assert.match(await page.locator('#auth-form').innerText(),/Username/);assert.match(await page.locator('#auth-form').innerText(),/Password/);
    await page.fill('input[name="login"]',tenant.staff[0]);await page.fill('input[name="secret"]',tenant.staff[1]);await page.click('#auth-form button');await page.waitForSelector('[data-renace-install]');
    assert.equal(await page.locator('[data-renace-install]').count(),1);assert.equal(await page.locator('[data-renace-guide]').count(),1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.click('#logout');await page.waitForURL(/#inicio$/);await page.goto(tenant.base+'/#equipo');await page.waitForSelector('#auth-form');
    await page.click('[data-language-toggle]');assert.equal(await page.getAttribute('html','lang'),'es');assert.match(await page.locator('#auth-form').innerText(),/Usuario/);
    await context.close();

    const customerContext=await browser.newContext({viewport:{width:390,height:844}});
    const phone='667'+String(Date.now()+tenants.indexOf(tenant)).slice(-7);
    const registration=await customerContext.request.post(tenant.base+'/api/register',{data:{name:'Cliente idioma',phone,pin:'4826'}});assert.equal(registration.status(),201);
    const customerPage=await customerContext.newPage();customerPage.setDefaultTimeout(8000);await customerPage.goto(tenant.base+'/#tarjeta');await customerPage.waitForSelector('#qr svg',{state:'attached'});await customerPage.waitForSelector('#app-loader',{state:'detached'});
    assert.equal(await customerPage.locator('[data-loyalty-flip]').count(),1);
    const touchStyles=await customerPage.locator('[data-loyalty-flip]').evaluate(card=>{const styles=getComputedStyle(card);return {tap:styles.webkitTapHighlightColor,userSelect:styles.userSelect}});
    assert.equal(touchStyles.tap,'rgba(0, 0, 0, 0)');assert.equal(touchStyles.userSelect,'none');
    await customerPage.click('#flip-card');assert.equal(await customerPage.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'true');
    await customerPage.keyboard.press('Tab');await customerPage.click('[data-language-toggle]');assert.match(await customerPage.locator('.compact-customer-head h1,.santofe-customer-intro').first().innerText(),/Hello|SANTOFÉ CARD/);
    assert.equal(await customerPage.locator('[data-renace-install]').count(),1);
    for(const viewport of [{width:390,height:844},{width:360,height:800},{width:393,height:852}]){
      await customerPage.setViewportSize(viewport);
      const layout=await customerPage.evaluate(()=>{const footer=document.querySelector('footer').getBoundingClientRect();return {fits:document.documentElement.scrollWidth<=innerWidth,footerBottom:Math.round(footer.bottom),height:innerHeight}});
      assert.ok(layout.fits,`${tenant.name} overflows at ${viewport.width}x${viewport.height}`);
      assert.ok(layout.footerBottom<=layout.height,`${tenant.name} footer falls below the viewport at ${viewport.width}x${viewport.height}`);
    }
    await customerContext.close();
  }
});

test('language changes preserve unsent forms, selections, open details and user data across tenants',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  const evidence=process.env.LOYALTY_UX_EVIDENCE_DIR;
  if(evidence)await (await import('node:fs/promises')).mkdir(evidence,{recursive:true});
  const snapshot=page=>page.locator('input,textarea,select').evaluateAll(nodes=>nodes.map(el=>({name:el.name,value:el.value,checked:el.checked})));
  async function roundTrip(page){
    const before=await snapshot(page);
    await page.click('[data-language-toggle]');assert.equal(await page.getAttribute('html','lang'),'en');
    assert.deepEqual(await snapshot(page),before);
    await page.click('[data-language-toggle]');assert.equal(await page.getAttribute('html','lang'),'es');
    assert.deepEqual(await snapshot(page),before);
  }
  for(const tenant of tenants){
    await setup(tenant);
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(8000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(tenant.base+'/#registro');await page.waitForSelector('#app-loader',{state:'detached'});
    await page.fill('[name="name"]','Luna');await page.fill('[name="login"]','6651234567');await page.fill('[name="secret"]','4826');
    if(evidence&&tenant.name==='MOON')await page.screenshot({path:evidence+'/formulario-antes-es.png'});
    await page.click('[data-language-toggle]');assert.equal(await page.inputValue('[name="name"]'),'Luna');assert.equal(await page.inputValue('[name="secret"]'),'4826');
    if(evidence&&tenant.name==='MOON')await page.screenshot({path:evidence+'/formulario-despues-en.png'});
    await page.click('[data-language-toggle]');await roundTrip(page);
    assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['loyalty-language']);
    await page.goto(tenant.base+'/#login');await page.fill('[name="login"]','6651234567');await page.fill('[name="secret"]','4826');await roundTrip(page);
    await page.goto(tenant.base+'/#equipo');await page.fill('[name="login"]',tenant.staff[0]);await page.fill('[name="secret"]',tenant.staff[1]);await roundTrip(page);
    await page.click('#auth-form button');await page.waitForSelector('#lookup');await page.fill('#lookup input','Luna');await roundTrip(page);
    await page.goto(tenant.base+'/#cuenta');await page.fill('[name="currentSecret"]','not-submitted-current');await page.fill('[name="newSecret"]','not-submitted-next');await page.fill('[name="confirmSecret"]','not-submitted-next');await roundTrip(page);
    await context.close();

    const customer=await browser.newContext({viewport:{width:390,height:844}}),client=await customer.newPage();client.setDefaultTimeout(8000);
    const phone='659'+String(Date.now()+tenants.indexOf(tenant)).slice(-7);
    assert.equal((await customer.request.post(tenant.base+'/api/register',{data:{name:'Luna',phone,pin:'4826'}})).status(),201);
    await client.goto(tenant.base+'/#tarjeta');await client.waitForSelector('#qr svg',{state:'attached'});await client.waitForSelector('#app-loader',{state:'detached'});
    await client.click('.loyalty-card-details summary');await client.click('#flip-card');
    await roundTrip(client);
    assert.equal(await client.locator('.loyalty-card-details').getAttribute('open'),'');
    assert.equal(await client.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'true');
    assert.equal(await client.locator('.personal-card [data-i18n-ignore]').first().innerText(),'Luna');
    await client.click('[data-language-toggle]');
    const rule=await client.locator('.loyalty-detail-grid>div').nth(2).innerText();
    assert.match(rule,tenant.name==='MOON'?/8 stamps · your next drink is on us/:tenant.name==='Renace'?/9 stamps · your next coffee is free/:/10 paid coffees · number 11 is free/);
    await client.click('[data-language-toggle]');
    if(evidence&&tenant.name==='MOON'){
      await client.setViewportSize({width:1440,height:1000});await client.click('#flip-card');
      await client.locator('.loyalty-flip-inner').evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished));});
      await client.screenshot({path:evidence+'/moon-escritorio-detalles.png',fullPage:true});
      await client.click('[data-language-toggle]');await client.screenshot({path:evidence+'/moon-escritorio-idioma-en.png',fullPage:true});
    }
    await customer.close();
    const counter=await browser.newContext({viewport:{width:390,height:844}}),counterPage=await counter.newPage();counterPage.setDefaultTimeout(8000);
    assert.equal((await counter.request.post(tenant.base+'/api/login/staff',{data:{username:tenant.staff[0],password:tenant.staff[1]}})).status(),200);
    await counterPage.goto(tenant.base+'/#empleado');await counterPage.waitForSelector('#lookup');await counterPage.waitForSelector('#app-loader',{state:'detached'});
    await counterPage.fill('#lookup input',phone);await counterPage.click('#lookup button');await counterPage.waitForSelector('#staff-card .customer-summary');
    if(tenant.name==='Santofé')await counterPage.click('#stamp-plus');
    await roundTrip(counterPage);await counterPage.click('[data-language-toggle]');
    assert.match(await counterPage.locator('.customer-summary').innerText(),/Luna/);
    if(tenant.name==='Santofé'){
      assert.equal(await counterPage.locator('#stamp-quantity').innerText(),'2');
      assert.equal(await counterPage.locator('#stamp-operation').innerText(),'This operation will add 2 stamps. It will end at 2/10.');
    }
    await counter.close();

    const admin=await browser.newContext({viewport:{width:1440,height:1000}}),adminPage=await admin.newPage();adminPage.setDefaultTimeout(8000);
    assert.equal((await admin.request.post(tenant.base+'/api/login/staff',{data:{username:tenant.admin[0],password:tenant.admin[1]}})).status(),200);
    await adminPage.goto(tenant.base+'/#admin');await adminPage.waitForSelector('#employee-form');await adminPage.waitForSelector('#app-loader',{state:'detached'});
    await adminPage.fill('#employee-form [name="name"]','Moño');await adminPage.fill('#employee-form [name="username"]','luna');await adminPage.fill('#employee-form [name="password"]','not-submitted-password');
    await adminPage.fill('#customer-search [name="q"]','Luna');await adminPage.fill('#event-filters [name="eventCustomer"]','Luna');await adminPage.selectOption('#event-filters [name="eventType"]','redeem');
    await roundTrip(adminPage);
    await adminPage.locator('.adjust-stamps').first().click();await adminPage.fill('#adjust-form [name="reason"]','Motivo sin enviar');
    const unsent=await snapshot(adminPage);
    // The native modal makes the header inert; exercise the same language API here.
    await adminPage.evaluate(()=>window.LoyaltyI18n.set('en'));assert.deepEqual(await snapshot(adminPage),unsent);
    await adminPage.evaluate(()=>window.LoyaltyI18n.set('es'));assert.deepEqual(await snapshot(adminPage),unsent);
    assert.equal(await adminPage.locator('.adjust-dialog').getAttribute('open'),'');
    await adminPage.click('#cancel-adjust');await adminPage.click('[data-language-toggle]');
    for(const [selector,message] of [['.edit-customer','Customer name:'],['.edit-employee','Employee name:']]){
      const opened=adminPage.waitForEvent('dialog'),clicked=adminPage.locator(selector).first().click();const dialog=await opened;
      assert.equal(dialog.message(),message);await dialog.dismiss();await clicked;
    }
    assert.deepEqual(errors,[]);
    await admin.close();
  }
});

test('public tenant copy translates completely while official branding stays fixed',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  for(const tenant of tenants){
    const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage();
    await page.goto(tenant.base+'/');await page.waitForSelector('#app-loader',{state:'detached'});await page.click('[data-language-toggle]');
    assert.match(await page.locator('main').innerText(),/Your next favorite break/);
    const text=await page.locator('body').innerText();assert.doesNotMatch(text,/Tu próxima|va por nuestra cuenta|Tu lealtad|Tu momento favorito|Tu pausa favorita/);
    for(const size of [{width:360,height:800},{width:390,height:844},{width:393,height:852},{width:768,height:1024},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}]){
      await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${tenant.name} public overflow at ${size.width}`);
    }
    if(tenant.name==='Santofé'){
      assert.equal(await page.locator('.santofe-public-card [data-stamp-number]').count(),10);
      assert.equal(await page.locator('.santofe-public-card [data-reward-slot],.santofe-public-card [data-loyalty-flip]').count(),0);
      if(process.env.LOYALTY_POLISH_EVIDENCE_DIR){await page.setViewportSize({width:1440,height:900});await page.screenshot({path:process.env.LOYALTY_POLISH_EVIDENCE_DIR+'/santofe-inicio-muestra.png'});}
    }
    if(tenant.name==='Renace'){
      for(const size of [{width:360,height:800},{width:390,height:844},{width:393,height:852}]){
        await page.setViewportSize(size);
        assert.equal(await page.locator('.editorial-steps').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      if(process.env.LOYALTY_UX_EVIDENCE_DIR){await page.setViewportSize({width:360,height:800});await page.locator('.editorial-steps').screenshot({path:process.env.LOYALTY_UX_EVIDENCE_DIR+'/renace-360-pasos-en.png'});}
    }
    await page.goto(tenant.base+'/#equipo');await page.waitForSelector('#auth-form');assert.match(await page.locator('#auth-form button').innerText(),/Log in/);assert.match(await page.locator('.eyebrow').first().innerText(),/TEAM/);
    await page.click('[data-language-toggle]');assert.equal(await page.getAttribute('html','lang'),'es');
    await context.close();
  }
});
