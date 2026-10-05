import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,invoke} from './reward-choice-fixture.mjs';

const base=process.env.MOON_UX_BASE||'http://127.0.0.1:8788';
const output=process.env.MOON_UX_EVIDENCE;
const contrast=(a,b)=>{
 const luminance=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];};
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
const evidence=async(page,name)=>{if(output){mkdirSync(output,{recursive:true});await page.screenshot({path:output+'/'+name+'.png',animations:'disabled'});}};

async function simulatedPage(browser,slug,url,{role='customer',touch=true,reducedMotion='no-preference'}={}){
 const db=schema(),f=await fixture(db,slug),dashboard=(await invoke(db,slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data;
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:touch,hasTouch:touch,serviceWorkers:'block',reducedMotion});
 const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='PATCH'&&path==='/api/card/style'){
   const data=request.postDataJSON();assert.deepEqual(Object.keys(data),['stampStyle']);assert.ok(['classic','moon'].includes(data.stampStyle));
   writes.push(data.stampStyle);f.card.stampStyle=data.stampStyle;await route.fulfill({json:{ok:true,card:f.card}});return;
  }
  assert.equal(request.method(),'GET','No real API mutations permitted');
  let data;if(path==='/api/me')data=(role==='employee'?f.staff:role==='admin'?f.admin:f.customer).data;
  else if(path==='/api/card'||path==='/api/staff/card')data={ok:true,card:f.card};
  else if(path==='/api/admin/dashboard')data=dashboard;
  else throw Error('Unexpected API: '+path);
  await route.fulfill({json:data});
 });
 const route=role==='admin'?'admin':role==='employee'?'empleado':'tarjeta';
 const response=await page.goto(url+'/#'+route);assert.equal(response.status(),200);
 await page.locator('#app-loader').waitFor({state:'detached'});await page.locator('#role-guide').waitFor();
 return {page,context,f,errors,writes,close:async()=>{await context.close();db.close();}};
}

test('MOON guides: every role, installation, ES/EN, scrolling, touch targets and AA contrast',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const measurements=[];
 for(const role of ['customer','employee','admin']){
  const s=await simulatedPage(browser,'mooncoffee',base,{role});
  try{
   for(const [width,height]of [[360,800],[390,844],[412,915],[430,932],[1366,768]]){
    await s.page.setViewportSize({width,height});
    for(const language of ['es','en']){
     await s.page.evaluate(lang=>window.LoyaltyI18n.set(lang),language);
     for(const trigger of ['#role-guide','#install-app']){
      await s.page.locator(trigger).click();await s.page.locator('dialog[open]').waitFor();
      const colors=await s.page.evaluate(()=>{
       const dialog=document.querySelector('dialog'),content=dialog.querySelector('.guide-content'),header=dialog.querySelector('header'),close=dialog.querySelector('.guide-close');
       const style=n=>getComputedStyle(n),bounds=n=>n.getBoundingClientRect();
       const steps=[...content.querySelectorAll('section')];
       return {background:style(dialog).backgroundColor,headerBackground:style(header).backgroundColor,title:style(header.querySelector('h2')).color,closeColor:style(close).color,closeBackground:style(close).backgroundColor,closeHeight:bounds(close).height,closeWidth:bounds(close).width,dialogWidth:bounds(dialog).width,viewport:innerWidth,scroll:content.scrollHeight>content.clientHeight,sections:steps.map(n=>({heading:style(n.querySelector('h3')).color,text:style(n.querySelector('p')).color,number:getComputedStyle(n,'::before').color}))};
      });
      assert.ok(colors.closeHeight>=44&&colors.closeWidth>=44);assert.ok(colors.dialogWidth<=colors.viewport);
      assert.ok(contrast(colors.title,colors.headerBackground)>=4.5);assert.ok(contrast(colors.closeColor,colors.closeBackground)>=4.5);
      for(const section of colors.sections)for(const key of ['heading','text','number'])assert.ok(contrast(section[key],colors.background)>=4.5,`${role} ${language} ${key}`);
      if(role==='customer'&&width===390&&language==='es'&&trigger==='#role-guide'){
       await evidence(s.page,'01-guia-moon-movil');
       if(output){await s.page.locator('.guide-content section').nth(0).screenshot({path:output+'/02-paso-01.png'});await s.page.locator('.guide-content section').nth(1).screenshot({path:output+'/03-paso-02.png'});}
      }
      const geometry=await s.page.evaluate(()=>{const content=document.querySelector('.guide-content'),header=document.querySelector('dialog header');const before=header.getBoundingClientRect().top;content.scrollTop=content.scrollHeight;const last=content.lastElementChild.getBoundingClientRect(),area=content.getBoundingClientRect();return {headerDelta:header.getBoundingClientRect().top-before,lastBottom:last.bottom,areaBottom:area.bottom,horizontal:content.scrollWidth-content.clientWidth};});
      assert.equal(geometry.headerDelta,0);assert.ok(geometry.lastBottom<=geometry.areaBottom+1);assert.equal(geometry.horizontal,0);
      if(role==='customer'&&width===390&&language==='es'&&trigger==='#role-guide')await evidence(s.page,'04-guia-ultimo-paso');
      if(role==='admin'&&width===1366&&language==='es'&&trigger==='#role-guide')await evidence(s.page,'08-guia-admin-desktop');
      await s.page.locator('.guide-close').click();await s.page.locator('dialog').waitFor({state:'detached'});
      assert.equal(await s.page.evaluate(()=>document.activeElement.id),trigger.slice(1));
      measurements.push({role,width,language,guide:trigger,heading:contrast(colors.sections[0].heading,colors.background),text:contrast(colors.sections[0].text,colors.background),step:contrast(colors.sections[0].number,colors.background)});
     }
    }
   }
   // Safari/iPhone instructions use the same guide surface.
   await s.page.evaluate(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,value:'iPhone Safari'}));
   await s.page.locator('#install-app').click();assert.match(await s.page.locator('dialog').innerText(),/Safari/);await s.page.keyboard.press('Escape');
   assert.deepEqual(s.errors,[]);assert.deepEqual(s.writes,[]);
  }finally{await s.close();}
 }
 if(output)writeFileSync(output+'/guide-contrasts.json',JSON.stringify(measurements,null,2));
});

test('MOON selector: dark selected state, finite repeatable tap, keyboard focus and unchanged persistence requests',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const s=await simulatedPage(browser,'mooncoffee',base);try{
  await s.page.locator('.loyalty-card-details summary').click();
  for(const style of ['classic','moon','classic','moon']){
   const button=s.page.locator(`[data-stamp-style="${style}"]`);await button.tap();
   await s.page.waitForFunction(()=>!document.querySelector('[data-stamp-style]').disabled);
   await s.page.waitForTimeout(450);
   assert.equal(await button.getAttribute('aria-pressed'),'true');
   const paint=await button.evaluate(n=>{const c=getComputedStyle(n);return {background:c.backgroundColor,text:c.color,shadow:c.boxShadow,animations:n.getAnimations().length,border:c.borderTopColor,check:getComputedStyle(n,'::after').content};});
   assert.equal(paint.background,'rgb(11, 17, 27)');assert.equal(paint.shadow,'none');assert.equal(paint.animations,0);assert.equal(paint.border,'rgb(210, 162, 83)');assert.match(paint.check,/✓/);assert.ok(contrast(paint.text,paint.background)>=4.5);
   if(style==='classic')await evidence(s.page,'05-selector-clasico');else await evidence(s.page,'06-selector-luna');
  }
  assert.deepEqual(s.writes,['moon','classic','moon']);
  const moon=s.page.locator('[data-stamp-style="moon"]');await moon.dispatchEvent('pointerdown',{button:0,pointerType:'touch'});
  assert.equal(await moon.evaluate(n=>n.getAnimations().some(a=>a.effect.getTiming().duration===360)),true);
  await s.page.waitForTimeout(450);await evidence(s.page,'07-selector-despues-tap');assert.equal(await moon.evaluate(n=>n.getAnimations().length),0);
  await s.page.reload();await s.page.locator('#app-loader').waitFor({state:'detached'});await s.page.locator('.loyalty-card-details summary').click();assert.equal(await moon.getAttribute('aria-pressed'),'true');
  for(const [width,height]of [[360,800],[390,844],[412,915],[430,932]]){
   await s.page.setViewportSize({width,height});
   for(const style of ['classic','moon']){
    const button=s.page.locator(`[data-stamp-style="${style}"]`);await button.tap();await s.page.waitForTimeout(450);
    assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await button.evaluate(n=>getComputedStyle(n).boxShadow),'none');assert.ok(await button.evaluate(n=>n.getBoundingClientRect().height>=44));
    assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
  }
  const classic=s.page.locator('[data-stamp-style="classic"]');await classic.focus();await s.page.keyboard.press('Space');await s.page.waitForTimeout(450);assert.equal(await classic.getAttribute('aria-pressed'),'true');
  assert.equal(await classic.evaluate(n=>n.matches(':focus-visible')),true);assert.equal(await classic.evaluate(n=>getComputedStyle(n).outlineWidth),'3px');
  await s.page.emulateMedia({reducedMotion:'reduce'});await classic.dispatchEvent('pointerdown',{button:0,pointerType:'touch'});assert.equal(await classic.evaluate(n=>n.getAnimations().length),0);
  await s.page.setViewportSize({width:1366,height:768});assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
 const desktop=await simulatedPage(browser,'mooncoffee',base,{touch:false});try{
  await desktop.page.locator('.loyalty-card-details summary').click();const button=desktop.page.locator('[data-stamp-style="moon"]');await button.hover();await desktop.page.waitForTimeout(220);assert.equal(await button.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(23, 33, 49)');await desktop.page.mouse.move(0,0);await desktop.page.waitForTimeout(220);assert.equal(await button.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(11, 17, 27)');
 }finally{await desktop.close();}
});

test('Renace, Santofé and Vainilla retain identical guide and card rendering',async t=>{
 const current=readFileSync(new URL('../public/assets/tenant.css',import.meta.url),'utf8');
 const baseline=process.env.MOON_UX_BASELINE_CSS?readFileSync(process.env.MOON_UX_BASELINE_CSS,'utf8'):current.replace(/\/\* MOON guides use a light reading surface[\s\S]*?\/\* End MOON guide and selector accessibility\. \*\//,'');
 assert.notEqual(baseline,current,'Compare against CSS without the MOON correction');
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 for(const [slug,port,host]of [['renace',8787,'renacecafe'],['santofe',8789,'santofe'],['vainillacoffee',8790,'vainillacoffee']]){
  const url=process.env.MOON_UX_BASE?.startsWith('https:')?'https://'+host+'.haloswebs.com':`http://127.0.0.1:${port}`;
  const s=await simulatedPage(browser,slug,url);try{
   for(const view of ['card','guide']){
    await s.page.route('**/assets/tenant.css',route=>route.fulfill({contentType:'text/css',body:baseline}));await s.page.reload();await s.page.locator('#app-loader').waitFor({state:'detached'});if(view==='guide')await s.page.locator('#role-guide').click();
    const before=await s.page.screenshot({animations:'disabled'});
    await s.page.unroute('**/assets/tenant.css');await s.page.reload();await s.page.locator('#app-loader').waitFor({state:'detached'});if(view==='guide')await s.page.locator('#role-guide').click();
    const after=await s.page.screenshot({animations:'disabled'});assert.equal(before.equals(after),true,slug+' '+view+' visual regression');
   }
   assert.deepEqual(s.errors,[]);assert.deepEqual(s.writes,[]);
  }finally{await s.close();}
 }
});
