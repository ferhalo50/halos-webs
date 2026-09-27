import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const tenants=[
  {base:'http://127.0.0.1:8787',slug:'renace',admin:['admin_local','Admin-test-928!'],employee:['mostrador_local','Staff-test-928!']},
  {base:'http://127.0.0.1:8788',slug:'mooncoffee',admin:['admin_moon_local','Moon-admin-local928!'],employee:['moon_staff_local','Moon-staff-local928!']}
];

async function localCookies(context){
  await context.addCookies((await context.cookies()).map(cookie=>({...cookie,secure:false})));
}

async function expectNavigation(page,{authenticated}){
  const home=page.locator('#home-link'),staff=page.locator('#staff-link');
  assert.equal(await home.isVisible(),authenticated);
  assert.equal(await staff.isVisible(),!authenticated);
  assert.equal(await home.getAttribute('href'),'/');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}

test('shared authenticated navigation stays inside each tenant for every role',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  for(const tenant of tenants){
    const publicContext=await browser.newContext({viewport:{width:390,height:844}}),publicPage=await publicContext.newPage();
    await publicPage.goto(tenant.base+'/');await publicPage.waitForSelector('#app-loader',{state:'detached'});
    await expectNavigation(publicPage,{authenticated:false});
    assert.equal(await publicPage.locator('#staff-link').getAttribute('href'),'#equipo');
    await publicContext.close();

    const customerContext=await browser.newContext({viewport:{width:390,height:844}});
    const phone=(tenant.slug==='renace'?'663':'667')+String(Date.now()).slice(-7);
    const registration=await customerContext.request.post(tenant.base+'/api/register',{data:{name:'Navegación '+tenant.slug,phone,pin:'4826'}});
    assert.equal(registration.status(),201);await localCookies(customerContext);
    const customerPage=await customerContext.newPage();await customerPage.goto(tenant.base+'/#tarjeta');await customerPage.waitForSelector('#qr svg');
    await expectNavigation(customerPage,{authenticated:true});
    await customerPage.click('#home-link');await customerPage.waitForURL(tenant.base+'/');
    assert.equal(new URL(customerPage.url()).origin,tenant.base);
    await customerContext.close();

    for(const [role,credentials,route,selector] of [
      ['employee',tenant.employee,'empleado','#lookup'],
      ['admin',tenant.admin,'admin','.stats']
    ]){
      const context=await browser.newContext({viewport:{width:390,height:844}});
      const login=await context.request.post(tenant.base+'/api/login/staff',{data:{username:credentials[0],password:credentials[1]}});
      assert.equal(login.status(),200,`${tenant.slug} ${role}`);await localCookies(context);
      const page=await context.newPage();await page.goto(tenant.base+'/#'+route);await page.waitForSelector(selector);
      await expectNavigation(page,{authenticated:true});
      assert.equal(new URL(await page.locator('#home-link').evaluate(link=>link.href)).origin,tenant.base);
      await context.close();
    }
  }
});
