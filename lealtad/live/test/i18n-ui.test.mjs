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
    await page.click('#nav-menu-toggle');assert.match(await page.locator('#primary-navigation').innerText(),/Team access/);
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
