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
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(()=>{window.__wakeLockTest={requests:0,releases:0};Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.__wakeLockTest.requests++;let released=false;return{get released(){return released;},addEventListener(){},release:async()=>{released=true;window.__wakeLockTest.releases++;}};}}});});
    const phone=item.prefix+String(Date.now()+cases.indexOf(item)).slice(-7);
    const response=await context.request.post(item.base+'/api/register',{data:{name:'Layout '+item.slug,phone,pin:'4826'}});
    assert.equal(response.status(),201);
    await context.addCookies((await context.cookies()).map(cookie=>({...cookie,secure:false})));
    const page=await context.newPage();page.setDefaultTimeout(8000);await page.goto(item.base+'/#tarjeta');await page.waitForSelector('#qr svg',{state:'attached'});await page.waitForSelector('#app-loader',{state:'detached'});
    const grid=page.locator('.personal-card .stamps[data-stamp-columns]').first();
    assert.equal(Number(await grid.getAttribute('data-stamp-columns')),item.columns);
    assert.equal(Number(await grid.getAttribute('data-stamp-rows')),item.rows);
    assert.equal(await grid.locator('[data-stamp-number]').count(),item.goal);
    assert.deepEqual(await grid.locator('[data-stamp-number]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.stampNumber))),Array.from({length:item.goal},(_,i)=>i+1));
    assert.equal(await grid.locator('[data-reward-slot]').count(),item.reward?1:0);
    if(item.reward){assert.equal(await grid.locator('[data-stamp-number="10"]').count(),0);assert.equal(await grid.locator('.reward-badge').getAttribute('src'),'/assets/renace-gratis.png');}
    for(const viewport of [{width:360,height:800},{width:390,height:844},{width:393,height:852}]){
      await page.setViewportSize(viewport);
      const geometry=await grid.evaluate((element,columns)=>{const style=getComputedStyle(element),items=[...element.children].map(node=>node.getBoundingClientRect());return {columns:style.gridTemplateColumns.trim().split(/\s+/).length,firstTop:Math.round(items[0].top),lastFirstRowTop:Math.round(items[columns-1].top),secondTop:Math.round(items[columns].top),overflow:document.documentElement.scrollWidth>innerWidth};},item.columns);
      assert.equal(geometry.columns,item.columns,`${item.slug} columns at ${viewport.width}`);
      assert.equal(geometry.firstTop,geometry.lastFirstRowTop,`${item.slug} first row at ${viewport.width}`);
      assert.ok(geometry.secondTop>geometry.firstTop,`${item.slug} second row at ${viewport.width}`);
      assert.equal(geometry.overflow,false,`${item.slug} overflow at ${viewport.width}`);
    }
    const dimensions=await page.evaluate(()=>{const card=document.querySelector('[data-loyalty-flip]').getBoundingClientRect(),front=document.querySelector('.loyalty-card-front,.santofe-card-front').getBoundingClientRect(),back=document.querySelector('.loyalty-card-back,.santofe-card-back').getBoundingClientRect();return {card:[Math.round(card.width),Math.round(card.height)],front:[Math.round(front.width),Math.round(front.height)],back:[Math.round(back.width),Math.round(back.height)]};});
    assert.deepEqual(dimensions.front,dimensions.back);assert.deepEqual(dimensions.card,dimensions.front);
    assert.match(await page.locator('.qr-brightness-help').innerText(),/Sube el brillo/);
    await page.click('#flip-card');await page.waitForFunction(()=>window.__wakeLockTest.requests===1);assert.equal(await page.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'true');
    await page.click('#flip-card');await page.waitForFunction(()=>window.__wakeLockTest.releases===1);assert.equal(await page.locator('[data-loyalty-flip]').getAttribute('aria-pressed'),'false');
    await context.close();
  }
});
