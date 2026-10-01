import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {TENANTS} from '../worker/tenants.js';

const cases=[
  {slug:'renace',base:'http://127.0.0.1:8787',goal:9,columns:5,rows:2,reward:true,prefix:'662'},
  {slug:'mooncoffee',base:'http://127.0.0.1:8788',goal:8,columns:4,rows:2,reward:false,prefix:'661'},
  {slug:'santofe',base:'http://127.0.0.1:8789',goal:10,columns:5,rows:2,reward:false,prefix:'660'}
];

test('tenant card layouts declare the physical-card geometry without changing reward goals',()=>{
  for(const item of cases){
    const tenant=TENANTS[item.slug];
    assert.equal(tenant.rewardGoal,item.goal);
    assert.deepEqual(tenant.cardLayout,{stampColumns:item.columns,stampRows:item.rows,rewardSlot:item.reward,variant:item.slug==='mooncoffee'?'moon':item.slug});
    assert.equal(tenant.rewardGoal+(tenant.cardLayout.rewardSlot?1:0),item.columns*item.rows);
  }
});

test('customer cards keep exact rows on every requested mobile viewport',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  for(const item of cases){
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    await context.addInitScript(()=>{window.__wakeLockTest={requests:0,releases:0};Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.__wakeLockTest.requests++;let released=false;return{get released(){return released;},addEventListener(){},release:async()=>{released=true;window.__wakeLockTest.releases++;}};}}});});
    const phone=item.prefix+String(Date.now()+cases.indexOf(item)).slice(-7);
    const response=await context.request.post(item.base+'/api/register',{data:{name:'Layout '+item.slug,phone,pin:'4826'}});
    assert.equal(response.status(),201);
    await context.addCookies((await context.cookies()).map(cookie=>({...cookie,secure:false})));
    const page=await context.newPage();page.setDefaultTimeout(8000);await page.goto(item.base+'/#tarjeta');await page.waitForSelector('#qr svg',{state:'attached'});await page.waitForSelector('#app-loader',{state:'detached'});
    if(item.slug==='mooncoffee'){
      await page.route('**/api/card',async route=>{const response=await route.fetch(),json=await response.json();json.card.name='Fernando Alejandro de la Cruz Hernández y Rodríguez';await route.fulfill({response,json});});
      await page.click('#account-link');await page.waitForSelector('#secret-form');await page.click('#card-link');await page.waitForSelector('#qr svg',{state:'attached'});
    }
    const grid=page.locator('.personal-card .stamps[data-stamp-columns]').first();
    assert.equal(Number(await grid.getAttribute('data-stamp-columns')),item.columns);
    assert.equal(Number(await grid.getAttribute('data-stamp-rows')),item.rows);
    assert.equal(await grid.locator('[data-stamp-number]').count(),item.goal);
    assert.deepEqual(await grid.locator('[data-stamp-number]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.stampNumber))),Array.from({length:item.goal},(_,i)=>i+1));
    assert.equal(await grid.locator('[data-reward-slot]').count(),item.reward?1:0);
    if(item.reward){assert.equal(await grid.locator('[data-stamp-number="10"]').count(),0);assert.equal(await grid.locator('.reward-badge').getAttribute('src'),'/assets/renace-gratis.png');}
    for(const viewport of [{width:360,height:800},{width:390,height:844},{width:393,height:852},{width:768,height:1024},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}]){
      await page.setViewportSize(viewport);
      const geometry=await grid.evaluate((element,columns)=>{const style=getComputedStyle(element),items=[...element.children].map(node=>node.getBoundingClientRect());return {columns:style.gridTemplateColumns.trim().split(/\s+/).length,firstTop:Math.round(items[0].top),lastFirstRowTop:Math.round(items[columns-1].top),secondTop:Math.round(items[columns].top),overflow:document.documentElement.scrollWidth>innerWidth};},item.columns);
      assert.equal(geometry.columns,item.columns,`${item.slug} columns at ${viewport.width}`);
      assert.equal(geometry.firstTop,geometry.lastFirstRowTop,`${item.slug} first row at ${viewport.width}`);
      assert.ok(geometry.secondTop>geometry.firstTop,`${item.slug} second row at ${viewport.width}`);
      assert.equal(geometry.overflow,false,`${item.slug} overflow at ${viewport.width}`);
      if(item.slug!=='santofe'){
        const paper=await page.locator('[data-loyalty-flip]').evaluate(surface=>{
          const box=surface.getBoundingClientRect(),front=surface.querySelector('.loyalty-card-front'),back=surface.querySelector('.loyalty-card-back');
          return{ratio:box.width/box.height,front:[front.offsetWidth,front.offsetHeight],back:[back.offsetWidth,back.offsetHeight],contents:[...front.querySelectorAll('.stamps>div,.moon-card-footer,.card-bottom,.row,.moon-card-owner')].map(node=>{const r=node.getBoundingClientRect();return[r.top-box.top,r.bottom-box.top];}),height:box.height,stampWidth:front.querySelector('.stamp').getBoundingClientRect().width};
        });
        assert.ok(Math.abs(paper.ratio-(item.slug==='mooncoffee'?1.7:1.6))<.01);
        assert.deepEqual(paper.front,paper.back);
        for(const [top,bottom] of paper.contents)assert.ok(top>=0&&bottom<=paper.height+1,`${item.slug} card content stays inside at ${viewport.width}`);
        if(item.slug==='renace')assert.ok(paper.stampWidth>=46,'Renace stamp designs have room to remain recognizable');
        if(item.slug==='mooncoffee'){
          const separation=await page.locator('.moon-loyalty-card').evaluate(card=>{const logo=card.querySelector('.moon-card-logo').getBoundingClientRect(),name=card.querySelector('.moon-card-owner').getBoundingClientRect(),surface=card.getBoundingClientRect();return{gap:name.top-logo.bottom,margin:logo.top-surface.top,name:card.querySelector('.moon-card-owner strong').textContent};});
          assert.ok(separation.gap>=8&&separation.margin>=4,'long names keep a separate logo zone with a safe top margin');assert.equal(separation.name,'Fernando Alejandro de la Cruz Hernández y Rodríguez');
        }
      }
      if(process.env.LOYALTY_POLISH_EVIDENCE_DIR&&(viewport.width===390||viewport.width===1440)){
        const directory=process.env.LOYALTY_POLISH_EVIDENCE_DIR;await (await import('node:fs/promises')).mkdir(directory,{recursive:true});
        await page.screenshot({path:`${directory}/${item.slug}-cliente-${viewport.width===390?'movil':'desktop'}.png`,fullPage:true});
      }
    }
    const dimensions=await page.evaluate(()=>{const card=document.querySelector('[data-loyalty-flip]').getBoundingClientRect(),front=document.querySelector('.loyalty-card-front,.santofe-card-front').getBoundingClientRect(),back=document.querySelector('.loyalty-card-back,.santofe-card-back').getBoundingClientRect();return {card:[Math.round(card.width),Math.round(card.height)],front:[Math.round(front.width),Math.round(front.height)],back:[Math.round(back.width),Math.round(back.height)]};});
    assert.deepEqual(dimensions.front,dimensions.back);assert.deepEqual(dimensions.card,dimensions.front);
    assert.match(await page.locator('.qr-brightness-help').innerText(),/Sube el brillo/);
    await page.click('#flip-card');await page.waitForFunction(()=>window.__wakeLockTest.requests===1);assert.equal(await page.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'true');
    await page.click('#flip-card');await page.waitForFunction(()=>window.__wakeLockTest.releases===1);assert.equal(await page.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'false');
    if(item.slug==='mooncoffee'){
      assert.equal(await grid.locator('.moon-stamp-cup').count(),8);
      assert.equal(await grid.locator('.stamp-slot-number').first().evaluate(node=>getComputedStyle(node).clipPath),'inset(50%)');
      assert.doesNotMatch(await page.locator('.moon-loyalty-card').innerText(),/MEMBRESÍA LUNAR/);
      for(const language of ['en','es']){
        await page.tap('[data-language-toggle]');assert.equal(await page.locator('html').getAttribute('lang'),language);
        const contrast=await page.locator('[data-language-toggle]').evaluate(node=>{
          const luminance=rgb=>{const values=rgb.match(/[\d.]+/g).slice(0,3).map(value=>{const channel=Number(value)/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
          const background=luminance(getComputedStyle(node).backgroundColor),text=luminance(getComputedStyle(node.querySelector('b')).color);return(Math.max(background,text)+.05)/(Math.min(background,text)+.05);
        });assert.ok(contrast>=4.5,'MOON language remains legible after a touch');
      }
    }
    await context.close();
    if(item.slug!=='santofe'){
      const publicContext=await browser.newContext(),publicPage=await publicContext.newPage();await publicPage.goto(item.base);await publicPage.waitForSelector('#app-loader',{state:'detached'});
      for(const width of [360,390,393,768,1366,1440,1920]){
        await publicPage.setViewportSize({width,height:900});
        const sample=await publicPage.locator('.hero>.card').evaluate(node=>{
          const r=node.getBoundingClientRect(),owner=node.querySelector('.row,.moon-card-owner').getBoundingClientRect(),stamps=[...node.querySelectorAll('.stamp')].map(element=>element.getBoundingClientRect()),footer=node.querySelector('.card-bottom,.moon-card-footer').getBoundingClientRect();return{width:r.width,ratio:r.width/r.height,overflow:document.documentElement.scrollWidth>innerWidth,separated:stamps[0].top>=owner.bottom&&stamps.at(-1).bottom<=footer.top,contents:[...node.querySelectorAll('.stamps>div,.moon-card-footer,.card-bottom,.row,.moon-card-owner')].map(element=>{const box=element.getBoundingClientRect();return[box.top-r.top,box.bottom-r.top];}),height:r.height};
        });
        assert.ok(sample.width>=280,'public sample must occupy its card column');assert.ok(Math.abs(sample.ratio-(item.slug==='mooncoffee'?1.7:1.6))<.01);assert.equal(sample.overflow,false);
        assert.ok(sample.separated,`${item.slug} public stamps must not overlap name or rule at ${width}`);
        for(const [top,bottom] of sample.contents)assert.ok(top>=0&&bottom<=sample.height+1,`${item.slug} public card clips content at ${width}`);
      }
      await publicContext.close();
    }
  }
});
