import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const tenants=[
  {base:'http://127.0.0.1:8787',slug:'renace',admin:['admin_local','Admin-test-928!'],employee:['mostrador_local','Staff-test-928!']},
  {base:'http://127.0.0.1:8788',slug:'mooncoffee',admin:['admin_moon_local','Moon-admin-local928!'],employee:['moon_staff_local','Moon-staff-local928!']},
  {base:'http://127.0.0.1:8789',slug:'santofe',admin:['admin_santofe_local','Santofe-admin-local928!'],employee:['santofe_staff_local','Santofe-staff-local928!']}
];

async function localCookies(context){
  await context.addCookies((await context.cookies()).map(cookie=>({...cookie,secure:false})));
}

const viewports=[{width:360,height:800},{width:390,height:844},{width:393,height:852},{width:768,height:1024},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}];
const evidence=process.env.LOYALTY_BOTTOM_NAV_EVIDENCE_DIR;
async function expectNavigation(page,{role='public'}){
  const authenticated=role!=='public';
  const expected=role==='admin'?['home-link','counter-link','admin-link','account-link']:role==='employee'?['home-link','counter-link','account-link']:role==='customer'?['home-link','card-link','account-link']:['staff-link'];
  assert.equal(await page.locator('#nav-menu-toggle').count(),0);
  assert.equal(await page.locator('#primary-navigation [data-language-toggle],#primary-navigation #logout').count(),0);
  assert.equal(await page.locator('#home-link').getAttribute('href'),'#inicio');
  const route=new URL(page.url()).hash.slice(1)||'inicio';
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    const compact=viewport.width<=1000;
    const geometry=await page.evaluate(()=>{
      const nav=document.querySelector('#primary-navigation'),style=getComputedStyle(nav),bounds=nav.getBoundingClientRect();
      const links=[...nav.querySelectorAll('a')].filter(link=>!link.hidden);
      const current=nav.querySelector('[aria-current="page"]');
      const language=document.querySelector('[data-language-toggle]'),logout=document.querySelector('#logout');
      const header=document.querySelector('body>header').getBoundingClientRect(),brand=document.querySelector('body>header .brand').getBoundingClientRect(),utilities=language.closest('.header-utilities').getBoundingClientRect();
      return{ids:links.map(link=>link.id),position:style.position,background:style.backgroundColor,top:bounds.top,bottom:bounds.bottom,height:bounds.height,padding:parseFloat(getComputedStyle(document.body).paddingBottom),overflow:document.documentElement.scrollWidth>innerWidth,current:current?.getAttribute('href'),icons:links.map(link=>({hidden:link.querySelector('svg').getAttribute('aria-hidden'),display:getComputedStyle(link.querySelector('svg')).display})),targets:links.map(link=>{const r=link.getBoundingClientRect();return [r.width,r.height]}),language:language.innerText,languageTop:language.getBoundingClientRect().top,logout:!logout.hidden,utilitiesInHeader:Boolean(language.closest('header')&&logout.closest('header')),headerHeight:header.height,brandRight:brand.right,utilitiesLeft:utilities.left,utilitiesRight:utilities.right,headerRight:header.right};
    });
    assert.deepEqual(geometry.ids,expected,`${page.url()} role ${role} at ${viewport.width}`);
    assert.equal(geometry.overflow,false);
    assert.equal(geometry.utilitiesInHeader,true);assert.ok(geometry.languageTop<110);assert.equal(geometry.logout,authenticated);
    assert.ok(geometry.brandRight+6<=geometry.utilitiesLeft,'branding leaves room for language/logout');assert.ok(geometry.utilitiesRight<=geometry.headerRight+1,'utilities stay in the header');if(viewport.width<=760)assert.ok(geometry.headerHeight<=82,'mobile branding keeps a compact header');
    assert.equal(geometry.language,'ES');
    assert.equal(geometry.current,authenticated?'#'+route:undefined);
    assert.equal(geometry.position,compact?'fixed':'static');
    if(compact){
      assert.match(geometry.background,/^rgb\(/);assert.equal(Math.round(geometry.bottom),viewport.height);assert.ok(geometry.height>=56&&geometry.height<=64);assert.ok(geometry.padding>=geometry.height);
      for(const [width,height] of geometry.targets)assert.ok(Math.round(width)>=44&&Math.round(height)>=44);
      for(const icon of geometry.icons){assert.equal(icon.hidden,'true');assert.notEqual(icon.display,'none');}
      await page.locator('footer').scrollIntoViewIfNeeded();
      const clearance=await page.evaluate(()=>({footer:document.querySelector('footer').getBoundingClientRect().bottom,nav:document.querySelector('#primary-navigation').getBoundingClientRect().top}));
      assert.ok(clearance.footer<=clearance.nav+1,'footer remains above the navigation after scrolling');
    }else{for(const icon of geometry.icons)assert.equal(icon.display,'none');}
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
  assert.equal(await page.locator('[data-language-toggle]').getAttribute('aria-label'),'Cambiar a inglés');
  for(const selector of ['[data-language-toggle]',...(authenticated?['#logout']:[])]){const bounds=await page.locator(selector).boundingBox();assert.ok(Math.round(bounds.width)>=44&&Math.round(bounds.height)>=44);}
  if(role==='admin'){
    assert.equal(await page.locator('#admin-link').innerText(),'Admin');assert.equal(await page.locator('#admin-link').getAttribute('aria-label'),'Administración');
    await page.click('[data-language-toggle]');assert.equal(await page.locator('#admin-link').getAttribute('aria-label'),'Administration');assert.equal(await page.locator('#admin-link').innerText(),'Admin');
    await page.click('[data-language-toggle]');
  }
}
async function expectInternalHome(page,base){
  // A document marker and request log catch a real app reboot, not just a hidden animation.
  const marker=await page.evaluate(()=>{window.__navigationDocument=crypto.randomUUID();window.__unexpectedLoader=false;new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&(node.id==='app-loader'||node.querySelector?.('#app-loader')))))window.__unexpectedLoader=true;}).observe(document.body,{childList:true,subtree:true});return window.__navigationDocument;});
  const requests=[];const observe=request=>{if(request.isNavigationRequest()||new URL(request.url()).pathname==='/api/me')requests.push(request.url());};page.on('request',observe);
  await page.click('#home-link');await page.waitForURL(base+'/#inicio');await page.waitForSelector('.tenant-landing');
  assert.equal(await page.evaluate(()=>window.__navigationDocument),marker,'Inicio preserves the current document');
  assert.deepEqual(requests,[],'internal navigation does not fetch a new document or boot /api/me');
  assert.equal(await page.evaluate(()=>window.__unexpectedLoader),false);assert.equal(await page.locator('#app-loader').count(),0);
  assert.equal(await page.locator('#home-link').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#logout').isVisible(),true,'session and role survive Inicio');page.off('request',observe);
}
test('shared authenticated navigation stays inside each tenant for every role',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  for(const tenant of tenants){
    const publicContext=await browser.newContext({viewport:{width:390,height:844}}),publicPage=await publicContext.newPage();
    await publicPage.goto(tenant.base+'/');await publicPage.waitForSelector('#app-loader',{state:'detached'});
    await expectNavigation(publicPage,{role:'public'});
    assert.equal(await publicPage.locator('#staff-link').getAttribute('href'),'#equipo');
    for(const route of ['registro','login']){
      await publicPage.goto(tenant.base+'/#'+route);await publicPage.waitForSelector('#auth-form');
      await publicPage.locator('#auth-form input').first().focus();
      assert.equal(await publicPage.locator('#primary-navigation').isVisible(),false);
      await publicPage.locator('#auth-form button').focus();
      await publicPage.locator('#auth-form button').scrollIntoViewIfNeeded();
      assert.equal(await publicPage.locator('#primary-navigation').isVisible(),true);
      const button=await publicPage.locator('#auth-form button').boundingBox(),nav=await publicPage.locator('#primary-navigation').boundingBox();
      assert.ok(button.y+button.height<=nav.y,'form submit remains accessible above the bottom navigation');
    }
    await publicContext.close();

    const customerContext=await browser.newContext({viewport:{width:390,height:844}});
    const phone=({renace:'663',mooncoffee:'667',santofe:'665'}[tenant.slug])+String(Date.now()).slice(-7);
    const registration=await customerContext.request.post(tenant.base+'/api/register',{data:{name:'Navegación '+tenant.slug,phone,pin:'4826'}});
    assert.equal(registration.status(),201);await localCookies(customerContext);
    const customerPage=await customerContext.newPage();await customerPage.goto(tenant.base+'/#tarjeta');await customerPage.waitForSelector('#qr svg',{state:'attached'});await customerPage.waitForSelector('#app-loader',{state:'detached'});
    await expectNavigation(customerPage,{role:'customer'});
    await expectInternalHome(customerPage,tenant.base);await customerPage.click('#card-link');await customerPage.waitForSelector('#qr svg',{state:'attached'});
    if(evidence){
      await (await import('node:fs/promises')).mkdir(evidence,{recursive:true});
      await customerPage.screenshot({path:`${evidence}/${tenant.slug}-cliente-movil.png`});
      if(tenant.slug==='mooncoffee'){
        await customerPage.click('#flip-card');await customerPage.waitForFunction(()=>document.querySelector('[data-loyalty-flip]').getAnimations({subtree:true}).every(animation=>animation.playState!=='running'));
        const qr=await customerPage.locator('#qr svg').boundingBox(),nav=await customerPage.locator('#primary-navigation').boundingBox();assert.ok(qr.y+qr.height<nav.y);
        await customerPage.screenshot({path:evidence+'/moon-qr-movil.png'});await customerPage.click('#flip-card');
      }
      if(tenant.slug==='renace'){
        await customerPage.setViewportSize({width:1440,height:900});await customerPage.screenshot({path:evidence+'/renace-cliente-desktop.png'});await customerPage.setViewportSize({width:390,height:844});
      }
    }
    await customerPage.click('#account-link');await customerPage.waitForSelector('#secret-form');
    await customerPage.locator('[name="currentSecret"]').focus();assert.equal(await customerPage.locator('#primary-navigation').isVisible(),false);
    await customerPage.locator('#secret-form button').focus();assert.equal(await customerPage.locator('#primary-navigation').isVisible(),true);
    assert.equal(await customerPage.locator('#account-link').getAttribute('aria-current'),'page');
    await expectInternalHome(customerPage,tenant.base);
    assert.equal(new URL(customerPage.url()).origin,tenant.base);
    await customerContext.close();

    for(const [role,credentials,route,selector] of [
      ['employee',tenant.employee,'empleado','#lookup'],
      ['admin',tenant.admin,'admin','.stats']
    ]){
      const context=await browser.newContext({viewport:{width:390,height:844}});
      const login=await context.request.post(tenant.base+'/api/login/staff',{data:{username:credentials[0],password:credentials[1]}});
      assert.equal(login.status(),200,`${tenant.slug} ${role}`);await localCookies(context);
      const page=await context.newPage();await page.goto(tenant.base+'/#'+route);await page.waitForSelector(selector);await page.waitForSelector('#app-loader',{state:'detached'});
      await expectNavigation(page,{role});
      await expectInternalHome(page,tenant.base);await page.click(role==='admin'?'#admin-link':'#counter-link');await page.waitForSelector(selector);
      if(evidence&&role==='admin'&&tenant.slug==='renace')await page.screenshot({path:evidence+'/renace-admin-movil.png'});
      assert.equal(new URL(await page.locator('#home-link').evaluate(link=>link.href)).origin,tenant.base);
      if(role==='employee'){
        await page.click('#account-link');await page.waitForSelector('#secret-form');
        await page.fill('[name="currentSecret"]','not-submitted');
        assert.equal(await page.locator('#primary-navigation').isVisible(),false);
        await page.click('[data-language-toggle]');assert.equal(await page.inputValue('[name="currentSecret"]'),'not-submitted');await page.click('[data-language-toggle]');
        await page.locator('#secret-form button').focus();assert.equal(await page.locator('#primary-navigation').isVisible(),true);
        assert.equal(await page.locator('#account-link').getAttribute('aria-current'),'page');assert.equal(await page.locator('#counter-link').getAttribute('aria-current'),null);assert.equal(await page.locator('#counter-link').isVisible(),true);await page.click('#counter-link');await page.waitForSelector('#lookup');assert.equal(await page.locator('#counter-link').getAttribute('aria-current'),'page');
        assert.equal((await context.request.get(tenant.base+'/api/admin/dashboard')).status(),403);
      }else{
        await page.click('#counter-link');await page.waitForSelector('#lookup');
        const lookup=await context.request.get(tenant.base+'/api/staff/card?value='+encodeURIComponent(phone));assert.equal(lookup.status(),200);
      }
      await context.close();
    }
  }
});
