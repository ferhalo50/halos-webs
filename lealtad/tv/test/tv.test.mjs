import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:8790';
const config=JSON.parse(await readFile(new URL('../public/media.json',import.meta.url)));
const images=config.items.filter(x=>x.type==='image'),videos=config.items.filter(x=>x.type==='video');
test('every configured demo file exists and is served with the correct type',async()=>{
  assert.equal(config.slideDurationSeconds,10);
  assert.equal(config.music.source,'/media/audio/musicacoffee.mp3');
  assert.ok(!config.items.some(x=>/logo-renace/.test(x.source)));
  assert.ok(config.items.some(x=>x.source==='/media/images/renace-qr-tv.png'));
  for(const item of [...config.items,{source:config.music.source,type:'audio'}]){
    const file=await stat(new URL('../public'+item.source,import.meta.url));assert.ok(file.size>0);
    const response=await fetch(base+item.source,{method:'HEAD'});assert.equal(response.status,200,item.source);
    assert.match(response.headers.get('content-type'),new RegExp('^'+item.type+'/'));
  }
});

test('real photos, MP4s and MP3: sequences, loop, keyboard, full screen and mobile',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.waitForSelector('.media-card');
  const brand=page.locator('.brand');
  assert.equal(await brand.locator('.brand-logo').getAttribute('src'),'/media/images/logo-renace.png');
  assert.equal(await brand.locator('.brand-tv').innerText(),'TV');
  assert.equal(await brand.getAttribute('aria-label'),'Renace Café TV, inicio');
  assert.ok(await brand.locator('.brand-logo').evaluate(img=>img.complete&&img.naturalWidth===1073&&img.naturalHeight===464));
  for(const id of ['now-playing-title','presentation-progress','presentation-music','exit-presentation']){
    assert.equal(await page.locator(`#${id}`).count(),1,`legacy cache compatibility: ${id}`);
    assert.equal(await page.locator(`#${id}`).evaluate(element=>element.closest('[hidden]')!==null),true);
  }
  assert.equal(await page.locator('.media-card').count(),config.items.length);
  for(const item of images){
    const locator=page.locator(`[data-media-id="${item.id}"] img`);await locator.scrollIntoViewIfNeeded();
    await locator.evaluate(async img=>{await img.decode();});
    assert.equal(await locator.evaluate(img=>getComputedStyle(img).objectFit),'contain');
  }
  assert.equal(await page.locator('.media-card[data-media-id="'+videos[0].id+'"] img').count(),0);
  await page.locator('#select-all').focus();await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.evaluate(()=>document.activeElement.id),'select-all');
  await page.click('#toggle-music');await page.waitForFunction(()=>!document.querySelector('audio').paused&&document.querySelector('audio').currentTime>0);
  const audioStart=await page.locator('audio').evaluate(a=>a.currentTime);
  await page.click(`[data-media-id="${images[0].id}"]`);await page.click(`[data-media-id="${images[1].id}"]`);await page.click('#play-selected');
  await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.waitForFunction(()=>document.querySelector('#presentation').dataset.index==='1',null,{timeout:14000});
  const bounds=await page.locator('#media-stage img').evaluate(img=>{const r=img.getBoundingClientRect();return {fit:getComputedStyle(img).objectFit,w:r.width,h:r.height,iw:innerWidth,ih:innerHeight};});
  assert.equal(bounds.fit,'contain');assert.ok(bounds.w<=bounds.iw&&bounds.h<=bounds.ih);
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('#presentation').dataset.index==='0');
  assert.ok(await page.locator('audio').evaluate(a=>a.currentTime)>audioStart);
  await page.keyboard.press('Escape');await page.waitForSelector('#presentation',{state:'hidden'});
  await page.click('#clear-selection');
  for(const item of videos)await page.click(`[data-media-id="${item.id}"]`);
  await page.click('#play-selected');
  for(let index=0;index<videos.length;index++){
    await page.waitForFunction(src=>document.querySelector('#media-stage video')?.getAttribute('src')===src,videos[index].source);
    await page.waitForFunction(()=>{const v=document.querySelector('#media-stage video');return v&&v.readyState>=2&&v.currentTime>0;});
    const dimensions=await page.locator('#media-stage video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,muted:v.muted,controls:v.controls,fit:getComputedStyle(v).objectFit}));
    assert.ok(dimensions.width>0&&dimensions.height>0);assert.equal(dimensions.muted,true);assert.equal(dimensions.controls,false);assert.equal(dimensions.fit,'contain');
    // The menu video is intentionally long. Verify it starts, then use the same manual next action available on Fire TV.
    if(index<videos.length-1)await page.keyboard.press('ArrowRight');
    else await page.locator('#media-stage video').evaluate(v=>{v.playbackRate=8;});
  }
  await page.waitForFunction(src=>document.querySelector('#media-stage video')?.getAttribute('src')===src,videos[0].source);
  await page.evaluate(()=>document.exitFullscreen());await page.waitForSelector('#presentation',{state:'hidden'});
  await page.click('#clear-selection');await page.click(`[data-media-id="${images[0].id}"]`);await page.click(`[data-media-id="${videos[1].id}"]`);await page.click('#play-selected');
  await page.waitForSelector('#media-stage video',{timeout:14000});
  await page.waitForFunction(()=>document.querySelector('#media-stage video').currentTime>0);
  await page.locator('#media-stage video').evaluate(v=>{v.playbackRate=8;});await page.waitForSelector('#media-stage img');
  assert.equal(await page.locator('audio').evaluate(a=>a.paused),false);
  await page.evaluate(()=>document.exitFullscreen());await page.click('#toggle-music');assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
  const pausedAt=await page.locator('audio').evaluate(a=>a.currentTime);
  await page.click('#toggle-music');await page.waitForFunction(time=>document.querySelector('audio').currentTime>time,pausedAt);
  if(process.env.RENACE_SCREENSHOTS)await page.screenshot({path:process.env.RENACE_SCREENSHOTS+'/tv-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.RENACE_SCREENSHOTS)await page.screenshot({path:process.env.RENACE_SCREENSHOTS+'/tv-mobile.png',fullPage:true});
  await page.evaluate(()=>{HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new Error('Unavailable'));});
  await page.click('#play-selected');await page.waitForSelector('#media-stage img');
  assert.equal(await page.locator('#presentation button').count(),0);
  await page.locator('#media-stage').dblclick();await page.waitForSelector('#presentation',{state:'hidden'});
  assert.deepEqual(errors,[]);
});

test('offline real media, byte ranges and atomic replacement preserve other caches',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  const context=await browser.newContext(),page=await context.newPage();await page.goto(base);await page.waitForSelector('.media-card');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal((await page.evaluate(()=>caches.keys())).some(x=>x.startsWith('renace-tv-media-')),false);
  await page.evaluate(async()=>{await caches.open('unrelated-test-cache');});
  await page.click('#prepare-offline');await page.waitForFunction(()=>document.querySelector('#offline-label').textContent==='Listo para usar sin conexión',null,{timeout:120000});
  const first=await page.evaluate(()=>caches.keys());assert.ok(first.includes('unrelated-test-cache'));
  const replace=async next=>page.evaluate(async config=>{
    const reg=await navigator.serviceWorker.ready,channel=new MessageChannel();
    return new Promise(resolve=>{channel.port1.onmessage=e=>{if(['complete','error'].includes(e.data.type)){channel.port1.close();resolve(e.data);}};reg.active.postMessage({type:'PREPARE_OFFLINE',config},[channel.port2]);});
  },next);
  const next={...config,version:config.version+'-test-update'};
  assert.equal((await replace(next)).type,'complete');
  const keys=await page.evaluate(()=>caches.keys());assert.equal(keys.filter(x=>x.startsWith('renace-tv-media-')).length,1);assert.ok(keys.some(x=>x.includes('test-update')));assert.ok(keys.includes('unrelated-test-cache'));
  await context.setOffline(true);await page.reload();await page.waitForSelector('.media-card');
  assert.equal(await page.locator('.media-card').count(),config.items.length);
  const range=await page.evaluate(async source=>{const r=await fetch(source,{headers:{Range:'bytes=-32'}});return {status:r.status,bytes:(await r.arrayBuffer()).byteLength};},videos[0].source);
  assert.deepEqual(range,{status:206,bytes:32});
  await page.click('#toggle-music');await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
  await page.click(`[data-media-id="${videos[0].id}"]`);await page.click('#play-selected');await page.waitForFunction(()=>document.querySelector('#media-stage video')?.currentTime>0);
  await page.evaluate(()=>document.exitFullscreen());
  assert.equal((await replace({...config,version:'failed-offline-attempt'})).type,'error');
  assert.deepEqual(await page.evaluate(()=>caches.keys()),keys);
});
