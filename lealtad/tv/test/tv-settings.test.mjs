import {localTvUrl} from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const output = process.env.TV_SCREENSHOTS;
if(output) await mkdir(output,{recursive:true});
const sizes=[[1920,1080],[1280,720],[1080,1920],[720,1280],[1180,820],[390,844]];
for(const engine of ['chromium','webkit']) for(const site of ['renace','santofe']) {
  test(`${engine} ${site}: responsive orientation, rotation, persistence, independent TVs and fullscreen`,async t=>{
    const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});t.after(()=>browser.close());
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const base=localTvUrl(site);
    await page.goto(base); await page.waitForSelector('.media-card');
    assert.equal(await page.locator('body').getAttribute('data-tv-site'),site);
    assert.equal(await page.locator('.brand-logo').getAttribute('src'),`/media/images/logo-${site}.png`);
    assert.equal(await page.locator('#photo-durations,#duration-login,#edit-durations').count(),0);
    assert.equal(await page.getByRole('link',{name:'Administrar',exact:true}).getAttribute('href'),'/admin');
    for(const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}x${height}`);
      for(const mode of ['auto','horizontal','vertical']) {
        await page.click(`button[data-orientation="${mode}"]`);
        assert.equal(await page.locator(`button[data-orientation="${mode}"]`).getAttribute('aria-pressed'),'true');
      }
      await page.click('button[data-orientation="auto"]');
      for(const rotation of [0,90,-90]) {
        await page.click(`button[data-rotation="${rotation}"]`);
        await page.click('#play-all');await page.waitForSelector('#media-stage img');
        await page.waitForFunction(()=>document.querySelector('#media-stage img')?.complete);
        const rect=await page.locator('#media-stage').evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};});
        assert.ok(rect.x>=-1&&rect.y>=-1&&rect.x+rect.w<=rect.vw+1&&rect.y+rect.h<=rect.vh+1,JSON.stringify(rect));
        assert.equal(await page.locator('#media-stage img').evaluate(node=>getComputedStyle(node).objectFit),'contain');
        await page.keyboard.press('Escape');await page.waitForSelector('#presentation',{state:'hidden'});
      }
    }
    await page.click('button[data-orientation="vertical"]');await page.click('button[data-rotation="90"]');await page.reload();
    await page.waitForSelector('.media-card');
    assert.equal(await page.locator('button[data-orientation="vertical"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('button[data-rotation="90"]').getAttribute('aria-pressed'),'true');
    const second=await browser.newContext({serviceWorkers:'block'}),other=await second.newPage();await other.goto(base);await other.waitForSelector('.media-card');
    assert.equal(await other.locator('button[data-orientation="auto"]').getAttribute('aria-pressed'),'true');
    assert.equal(await other.locator('button[data-rotation="0"]').getAttribute('aria-pressed'),'true');await second.close();
    await page.setViewportSize({width:1920,height:1080});await page.click('button[data-orientation="auto"]');await page.click('button[data-rotation="0"]');
    await page.evaluate(()=>scrollTo(0,0));
    if(output&&engine==='chromium') {
      await page.screenshot({path:`${output}/${site}-inicio.png`,fullPage:true});
      await page.click('#play-all');await page.waitForSelector('#media-stage img');await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#media-stage')).opacity)>=0.99);
      await page.screenshot({path:`${output}/${site}-horizontal.png`});await page.keyboard.press('Escape');
      await page.setViewportSize({width:1080,height:1920});
      await page.getByRole('button',{name:'Seleccionar Vertical',exact:true}).click();await page.click('#play-selected');await page.waitForSelector('#media-stage img');await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#media-stage')).opacity)>=0.99);
      await page.screenshot({path:`${output}/${site}-vertical.png`});await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);
  });
}

test('admin duration edit persists, conflicts safely, syncs public TV; sessions separate',async t=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),other=await context.newPage();
  const base=localTvUrl('santofe');await page.goto(base);await page.waitForSelector('.media-card');await other.goto(base);await other.waitForSelector('.media-card');
  await page.getByRole('link',{name:'Administrar',exact:true}).click();
  await page.fill('#username','demo_santofe');await page.fill('#password','Demo-santofe-TV-2026!');await page.click('#login-form button');
  await page.waitForSelector('.photo-duration-editor');
  const row=page.locator('.photo-duration-editor').first();await row.locator('input').fill('8');await row.getByRole('button',{name:'Guardar'}).click();
  await row.locator('.duration-message').filter({hasText:'Guardado.'}).waitFor();
  const content=await (await context.request.get(`${base}/admin/api/content`)).json();
  const photo=content.items.find(x=>x.type==='image');assert.equal(photo.durationSeconds,8);
  assert.equal((await context.request.get(localTvUrl('renace')+'/admin/api/session')).status(),401);
  // Real 30-second polling, no reload/manual refresh, no fake clock.
  await other.waitForFunction(id=>document.querySelector(`[data-media-id="${id}"] .media-meta`)?.textContent.includes('8 s'),photo.id,{timeout:35000});
  await page.reload();await page.waitForSelector('.photo-duration-editor');assert.equal(await page.locator('.photo-duration-editor input').first().inputValue(),'8');
  const changed=await context.request.patch(`${base}/admin/api/content/${photo.id}/duration`,{headers:{origin:base},data:{durationSeconds:9,revision:photo.durationRevision}});assert.equal(changed.status(),200);
  await page.locator('.photo-duration-editor input').first().fill('7');await page.locator('.photo-duration-editor button').first().click();
  await page.waitForFunction(()=>document.querySelector('.duration-message').textContent.includes('cambió'));
  const current=(await (await context.request.get(`${base}/admin/api/content`)).json()).items.find(x=>x.id===photo.id);assert.equal(current.durationSeconds,9);
  assert.equal((await context.request.patch(`${base}/admin/api/content/${photo.id}/duration`,{headers:{origin:base},data:{durationSeconds:10,revision:current.durationRevision}})).status(),200);
});

test('photo timers, natural video ending, live removal and out-of-order transitions remain coherent',async t=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({serviceWorkers:'block'}),base=localTvUrl('renace');
  const config=await (await fetch(`${base}/playlist.json`)).json();
  const photo=config.items.find(x=>x.type==='image'),video=config.items.find(x=>x.type==='video');
  let next={...config,items:[{...photo,durationSeconds:1},video,{...photo,id:'second',durationSeconds:2}]};
  await page.route('**/playlist.json*',route=>route.fulfill({json:next}));
  await page.goto(base);await page.waitForSelector('.media-card');await page.click('#play-all');
  await page.waitForSelector('#media-stage video',{timeout:5000});await page.waitForFunction(()=>document.querySelector('video')?.currentTime>2);
  assert.equal(await page.locator('#presentation').getAttribute('data-index'),'1');
  await page.waitForFunction(()=>document.querySelector('#presentation').dataset.index==='2',{timeout:8000});
  await page.waitForFunction(()=>document.querySelector('#presentation').dataset.index==='0',{timeout:5000});
  next={...config,items:[{...photo,id:'replacement',durationSeconds:10}]};
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('.media-card')?.dataset.mediaId==='replacement');
  assert.equal(await page.locator('#media-stage img').count(),1);
  await page.keyboard.press('Escape');await page.waitForSelector('#presentation',{state:'hidden'});
  await page.waitForTimeout(2200);assert.equal(await page.locator('#media-stage').evaluate(x=>x.children.length),0);
});
